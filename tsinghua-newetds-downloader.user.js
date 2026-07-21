// ==UserScript==
// @name         Tsinghua Newetds Userscript
// @name:zh-CN   清华大学学位论文下载助手
// @namespace    https://github.com/Yousa-Mirage/tsinghua-newetds-userscript
// @version      0.1.1
// @description  Saving PDFs available in the current authorized Newetds preview session.
// @description:zh-CN 保存当前账户有权预览的 PDF，并按“题名_作者.pdf”命名。
// @author       Yousa-Mirage
// @homepageURL  https://github.com/Yousa-Mirage/tsinghua-newetds-userscript
// @supportURL   https://github.com/Yousa-Mirage/tsinghua-newetds-userscript/issues
// @match        https://newetds.lib.tsinghua.edu.cn/qh/paper/summary*
// @match        https://newetds.lib.tsinghua.edu.cn/pdf/generic/web/viewer.html*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// @inject-into  page
// ==/UserScript==

(() => {
	const DB_KEY = "tned-lite:db";
	const MODE_KEY = "tned-lite:mode";
	const TTL = 6 * 60 * 60 * 1000;
	const log = (...args) => console.log("[TNED Lite]", ...args);

	const readDB = () => {
		try {
			return (
				JSON.parse(localStorage.getItem(DB_KEY)) || {
					papers: {},
					signs: {},
				}
			);
		} catch {
			return {
				papers: {},
				signs: {},
			};
		}
	};

	const writeDB = (db) => localStorage.setItem(DB_KEY, JSON.stringify(db));

	const mode = () =>
		["ask", "save", "no-save"].includes(localStorage.getItem(MODE_KEY))
			? localStorage.getItem(MODE_KEY)
			: "ask";

	const later = (fn) =>
		document.readyState === "loading"
			? document.addEventListener("DOMContentLoaded", fn, {
					once: true,
				})
			: fn();

	const requestUrl = (input) =>
		new URL(
			typeof input === "string" ? input : input?.url || String(input),
			location.href,
		);

	const pathIs = (input, path) => {
		try {
			const url = requestUrl(input);

			return (
				url.origin === location.origin && url.pathname.toLowerCase() === path
			);
		} catch {
			return false;
		}
	};

	function addModeButton() {
		later(() => {
			const labels = {
				ask: "询问",
				save: "总是保存",
				"no-save": "不保存",
			};

			const order = ["ask", "save", "no-save"];
			const button = document.createElement("button");

			const refresh = () => {
				button.textContent = `PDF：${labels[mode()]}`;
				button.title = "点击切换：询问 → 总是保存 → 不保存";
			};

			button.style.cssText = [
				"position:fixed",
				"left:12px",
				"bottom:12px",
				"z-index:2147483647",
				"padding:6px 9px",
				"border:1px solid #aaa",
				"border-radius:6px",
				"background:#fff",
				"color:#333",
				"cursor:pointer",
				"font:12px Arial",
				"box-shadow:0 2px 8px #0003",
			].join(";");

			button.onclick = () => {
				const next = order[(order.indexOf(mode()) + 1) % order.length];

				localStorage.setItem(MODE_KEY, next);
				refresh();
			};

			refresh();
			document.body.appendChild(button);
		});
	}

	addModeButton();

	if (location.pathname.toLowerCase().startsWith("/qh/paper/summary")) {
		runSummaryPage();
	} else {
		runViewerPage();
	}

	/*
	 * 摘要页：
	 * 1. 读取论文题名和作者；
	 * 2. 截获 /api/fileProxy；
	 * 3. 建立 proxySign 与论文信息的映射。
	 */
	function runSummaryPage() {
		let paper = null;
		const pendingSigns = [];

		const save = () => {
			if (!paper) return;

			const db = readDB();
			const now = Date.now();
			const value = {
				...paper,
				timestamp: now,
			};

			db.papers[`${paper.dbCode}_${paper.sysId}`] = value;

			for (const sign of pendingSigns.splice(0)) {
				db.signs[sign] = value;
			}

			writeDB(db);
		};

		const capture = (payload) => {
			const rows = Array.isArray(payload?.data)
				? payload.data
				: Array.isArray(payload)
					? payload
					: [];

			const signs = rows
				.map((row) => String(row?.encryptPreviewUrl || "").trim())
				.filter(Boolean);

			if (!signs.length) return;

			pendingSigns.push(...signs);
			save();
		};

		/*
		 * 拦截 fetch。
		 */
		const nativeFetch = window.fetch;

		if (typeof nativeFetch === "function") {
			window.fetch = async function (...args) {
				const response = await nativeFetch.apply(this, args);

				if (pathIs(args[0], "/api/fileproxy")) {
					response
						.clone()
						.json()
						.then(capture)
						.catch(() => {});
				}

				return response;
			};
		}

		/*
		 * 拦截 XMLHttpRequest。
		 */
		const open = XMLHttpRequest.prototype.open;
		const send = XMLHttpRequest.prototype.send;

		XMLHttpRequest.prototype.open = function (method, url, ...rest) {
			this.__tnedUrl = url;

			return open.call(this, method, url, ...rest);
		};

		XMLHttpRequest.prototype.send = function (...args) {
			if (pathIs(this.__tnedUrl, "/api/fileproxy")) {
				this.addEventListener("loadend", () => {
					try {
						capture(
							this.responseType === "json"
								? this.response
								: JSON.parse(this.responseText),
						);
					} catch {
						// 忽略非 JSON 响应。
					}
				});
			}

			return send.apply(this, args);
		};

		/*
		 * 页面可能异步渲染，因此短暂轮询题名和作者。
		 */
		const timer = setInterval(() => {
			const params = new URLSearchParams(location.search);

			const thesis = document.querySelector("h1.cn")?.textContent.trim();

			const author = [...document.querySelectorAll("span")]
				.map((span) =>
					span.textContent
						.trim()
						.match(/^作者[:：]\s*(.+)$/)?.[1]
						?.trim(),
				)
				.find(Boolean);

			const dbCode = params.get("dbCode");
			const sysId = params.get("sysId");

			if (thesis && author && dbCode && sysId) {
				paper = {
					thesis,
					author,
					dbCode,
					sysId,
				};

				save();
				clearInterval(timer);

				log("论文信息已缓存", paper);
			}
		}, 200);

		setTimeout(() => clearInterval(timer), 15000);
	}

	/*
	 * PDF 预览页：
	 * 1. 截获 PDF 响应；
	 * 2. 必要时获取临时密钥并解密；
	 * 3. 恢复论文题名；
	 * 4. 下载 PDF。
	 */
	function runViewerPage() {
		let resolvePdf;
		let finished = false;

		const pdfReady = new Promise((resolve) => {
			resolvePdf = resolve;
		});

		const nativeFetch = window.fetch;

		const decode = (value) => {
			let result = String(value || "");

			for (let i = 0; i < 3; i++) {
				try {
					const next = decodeURIComponent(result);

					if (next === result) break;

					result = next;
				} catch {
					break;
				}
			}

			return result;
		};

		const viewerPdfUrl = () => {
			try {
				const file = new URL(location.href).searchParams.get("file");

				return file ? new URL(decode(file), location.href) : null;
			} catch {
				return null;
			}
		};

		const proxySign = (input = viewerPdfUrl() || location.href) => {
			try {
				return requestUrl(input).searchParams.get("proxySign") || "";
			} catch {
				return decode(location.href).match(/[?&]proxySign=([^&#]+)/)?.[1] || "";
			}
		};

		const b64 = (value) =>
			Uint8Array.from(atob(value || ""), (char) => char.charCodeAt(0));

		const isPdf = (buffer) => {
			const bytes = new Uint8Array(
				buffer,
				0,
				Math.min(buffer.byteLength, 1024),
			);

			for (let i = 0; i <= bytes.length - 5; i++) {
				if (
					bytes[i] === 37 &&
					bytes[i + 1] === 80 &&
					bytes[i + 2] === 68 &&
					bytes[i + 3] === 70 &&
					bytes[i + 4] === 45
				) {
					return true;
				}
			}

			return false;
		};

		async function decrypt(buffer, url, iv, tag) {
			/*
			 * 没有加密响应头时，直接检查是否已经是 PDF。
			 */
			if (!iv || !tag) {
				if (isPdf(buffer)) return buffer;

				throw new Error("响应既没有 PDF 文件头，也没有加密参数");
			}

			const sign = proxySign(url);

			if (!sign) {
				throw new Error("PDF 请求中没有 proxySign");
			}

			/*
			 * 使用当前登录会话请求临时解密密钥。
			 */
			const keyResponse = await nativeFetch.call(
				window,
				`/api/getTempDecryptKey?proxySign=${encodeURIComponent(sign)}`,
				{
					credentials: "include",
				},
			);

			if (!keyResponse.ok) {
				throw new Error(`临时密钥请求失败：${keyResponse.status}`);
			}

			const key = (await keyResponse.json())?.tempKey;

			if (!key) {
				throw new Error("临时密钥响应中没有 tempKey");
			}

			/*
			 * 网站将 AES-GCM 认证标签放在响应头中，
			 * 解密前需要把认证标签拼接到密文末尾。
			 */
			const cipher = new Uint8Array(buffer);
			const authTag = b64(tag);

			const data = new Uint8Array(cipher.length + authTag.length);

			data.set(cipher);
			data.set(authTag, cipher.length);

			const cryptoKey = await crypto.subtle.importKey(
				"raw",
				b64(key),
				"AES-GCM",
				false,
				["decrypt"],
			);

			const result = await crypto.subtle.decrypt(
				{
					name: "AES-GCM",
					iv: b64(iv),
					tagLength: 128,
				},
				cryptoKey,
				data,
			);

			if (!isPdf(result)) {
				throw new Error("解密结果不是 PDF");
			}

			return result;
		}

		async function capture(buffer, url, status, iv, tag) {
			if (finished || !buffer?.byteLength) return;

			try {
				const pdf = await decrypt(buffer, url, iv, tag);

				if (finished) return;

				finished = true;

				resolvePdf(
					new Blob([pdf], {
						type: "application/pdf",
					}),
				);

				log("已捕获 PDF", {
					url,
					status,
					size: pdf.byteLength,
				});
			} catch (error) {
				console.error("[TNED Lite] PDF 处理失败：", error);
			}
		}

		/*
		 * 拦截 fetch 加载的 PDF。
		 */
		if (typeof nativeFetch === "function") {
			window.fetch = async function (...args) {
				const response = await nativeFetch.apply(this, args);

				if (pathIs(args[0], "/api/getpdfstream")) {
					response
						.clone()
						.arrayBuffer()
						.then((buffer) =>
							capture(
								buffer,
								requestUrl(args[0]).href,
								response.status,
								response.headers.get("X-PDF-IV") || "",
								response.headers.get("X-PDF-TAG") || "",
							),
						);
				}

				return response;
			};
		}

		/*
		 * 拦截 XMLHttpRequest 加载的 PDF。
		 */
		const open = XMLHttpRequest.prototype.open;
		const send = XMLHttpRequest.prototype.send;

		XMLHttpRequest.prototype.open = function (method, url, ...rest) {
			this.__tnedUrl = url;

			return open.call(this, method, url, ...rest);
		};

		XMLHttpRequest.prototype.send = function (...args) {
			if (pathIs(this.__tnedUrl, "/api/getpdfstream")) {
				this.addEventListener("loadend", async () => {
					try {
						const buffer =
							this.responseType === "blob"
								? await this.response.arrayBuffer()
								: this.responseType === "arraybuffer"
									? this.response
									: await new Blob([this.responseText || ""]).arrayBuffer();

						capture(
							buffer,
							requestUrl(this.__tnedUrl).href,
							this.status,
							this.getResponseHeader("X-PDF-IV") || "",
							this.getResponseHeader("X-PDF-TAG") || "",
						);
					} catch (error) {
						console.error("[TNED Lite] 读取 XHR PDF 失败：", error);
					}
				});
			}

			return send.apply(this, args);
		};

		/*
		 * 根据 proxySign 查找论文信息；
		 * 查找失败时再使用 dbCode + recordId。
		 */
		const paperInfo = async () => {
			for (let i = 0; i < 15; i++) {
				const db = readDB();
				const now = Date.now();
				const sign = proxySign();
				const bySign = sign && db.signs[sign];
				const pdfUrl = viewerPdfUrl();

				const key =
					pdfUrl &&
					`${pdfUrl.searchParams.get("dbCode")}_${pdfUrl.searchParams.get(
						"recordId",
					)}`;

				const found =
					bySign && now - bySign.timestamp < TTL
						? bySign
						: key && !key.includes("null")
							? db.papers[key]
							: null;

				if (found) return found;

				await new Promise((resolve) => setTimeout(resolve, 200));
			}

			return {
				thesis: "download",
				author: "",
			};
		};

		const fileName = ({ thesis, author }) => {
			const name = `${thesis || "download"}${author ? `_${author}` : ""}.pdf`
				.replace(/[\\/:*?"<>|]/g, "_")
				.replace(/\s+/g, " ")
				.trim();

			return name.length <= 180 ? name : `${name.slice(0, 176)}.pdf`;
		};

		const download = (blob, name) => {
			const url = URL.createObjectURL(blob);

			const link = Object.assign(document.createElement("a"), {
				href: url,
				download: name,
			});

			(document.body || document.documentElement).appendChild(link);

			link.click();
			link.remove();

			setTimeout(() => URL.revokeObjectURL(url), 60000);
		};

		/*
		 * 同时等待 PDF 和论文信息。
		 */
		(async () => {
			if (mode() === "no-save") return;

			const [blob, paper] = await Promise.all([pdfReady, paperInfo()]);

			const name = fileName(paper);

			if (mode() === "save" || confirm(`保存 PDF？\n${name}`)) {
				download(blob, name);
			}
		})();
	}
})();
