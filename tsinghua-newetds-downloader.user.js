// ==UserScript==
// @name         Tsinghua Newetds Userscript
// @name:zh-CN   清华大学学位论文下载助手
// @namespace    https://github.com/Yousa-Mirage/tsinghua-newetds-userscript
// @version      0.1.1
// @description  Saving PDFs available in the current authorized Newetds preview session.
// @description:zh-CN 保存当前账户有权预览的 PDF，并按“题名_作者.pdf”命名。
// @author       Yousa-Mirage
// @license      MIT
// @homepageURL  https://github.com/Yousa-Mirage/tsinghua-newetds-userscript
// @supportURL   https://github.com/Yousa-Mirage/tsinghua-newetds-userscript/issues
// @match        https://newetds.lib.tsinghua.edu.cn/qh/paper/summary*
// @match        https://newetds.lib.tsinghua.edu.cn/pdf/generic/web/viewer.html*
// @run-at       document-start
// @grant        none
// @sandbox      raw
// ==/UserScript==

(() => {
	const nativeFetch = window.fetch;
	const DB_KEY = "tned-lite:db";
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

	// 旁路读取响应，处理失败时仍将网站原始响应交还给页面。
	function interceptResponses(path, onFetch, onXHR) {
		const report = (error) =>
			console.error("[TNED Lite] 读取响应失败：", error);

		if (typeof nativeFetch === "function") {
			window.fetch = async function (...args) {
				const response = await nativeFetch.apply(this, args);

				if (pathIs(args[0], path)) {
					try {
						Promise.resolve(
							onFetch(response.clone(), requestUrl(args[0]).href),
						).catch(report);
					} catch (error) {
						report(error);
					}
				}

				return response;
			};
		}

		const urls = new WeakMap();
		const { open, send } = XMLHttpRequest.prototype;

		XMLHttpRequest.prototype.open = function (method, url, ...rest) {
			urls.set(this, url);
			return open.call(this, method, url, ...rest);
		};

		XMLHttpRequest.prototype.send = function (...args) {
			const url = urls.get(this);

			if (pathIs(url, path)) {
				this.addEventListener(
					"loadend",
					() => {
						Promise.resolve()
							.then(() => onXHR(this, requestUrl(url).href))
							.catch(report);
					},
					{ once: true },
				);
			}

			return send.apply(this, args);
		};
	}

	const previewFiles = (payload) => {
		const rows = Array.isArray(payload?.data)
			? payload.data
			: Array.isArray(payload)
				? payload
				: [];

		return rows.filter(
			(row) =>
				typeof row?.encryptPreviewUrl === "string" &&
				row.encryptPreviewUrl.trim(),
		);
	};

	const b64 = (value) =>
		Uint8Array.from(atob(value || ""), (char) => char.charCodeAt(0));

	const isPdf = (buffer) => {
		const bytes = new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1024));

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

	async function fetchTempKey(url) {
		const sign = requestUrl(url).searchParams.get("proxySign");

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

		return key;
	}

	async function decrypt(buffer, url, iv, tag, tempKey) {
		/*
		 * 没有加密响应头时，直接检查是否已经是 PDF。
		 */
		if (!iv || !tag) {
			if (isPdf(buffer)) return buffer;

			throw new Error("响应既没有 PDF 文件头，也没有加密参数");
		}

		const key = tempKey || (await fetchTempKey(url));

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

	async function fetchPreviewFiles(paper) {
		const response = await nativeFetch.call(window, "/api/fileProxy", {
			method: "POST",
			credentials: "include",
			body: new URLSearchParams({
				action: "getToken",
				dbCode: paper.dbCode,
				recordId: paper.sysId,
			}),
		});

		if (!response.ok) throw new Error(`预览地址请求失败：${response.status}`);

		const payload = await response.json();
		const files = previewFiles(payload);

		if (!files.length) {
			throw new Error(
				payload?.data?.msg || payload?.msg || "当前账户没有可下载的预览文件",
			);
		}

		return files;
	}

	async function fetchPdf(file) {
		const url = `/api/getPdfStream?proxySign=${encodeURIComponent(file.encryptPreviewUrl.trim())}`;
		// 密钥请求同时准备当前会话，必须在 PDF 流请求之前完成。
		const key = await fetchTempKey(url);
		const response = await nativeFetch.call(window, url, {
			credentials: "include",
		});

		if (!response.ok) throw new Error(`PDF 请求失败：${response.status}`);

		const pdf = await decrypt(
			await response.arrayBuffer(),
			url,
			response.headers.get("X-PDF-IV") || "",
			response.headers.get("X-PDF-TAG") || "",
			key,
		);

		return new Blob([pdf], { type: "application/pdf" });
	}

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

	function createDownloadButton() {
		const button = document.createElement("button");

		button.type = "button";
		button.textContent = "下载为 PDF";
		button.style.cssText = [
			"padding:10px 18px",
			"border:1px solid #1565c0",
			"border-radius:6px",
			"background:#1565c0",
			"color:#fff",
			"cursor:pointer",
			"font:14px Arial",
			"box-shadow:0 2px 8px #0003",
		].join(";");

		return button;
	}

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
		let downloadButton = null;
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
			const signs = previewFiles(payload).map((row) =>
				row.encryptPreviewUrl.trim(),
			);

			if (!signs.length) return;

			pendingSigns.push(...signs);
			save();
		};

		interceptResponses(
			"/api/fileproxy",
			async (response) => capture(await response.json()),
			(xhr) =>
				capture(
					xhr.responseType === "json"
						? xhr.response
						: JSON.parse(xhr.responseText),
				),
		);

		/*
		 * 页面可能异步渲染，因此短暂轮询题名和作者。
		 */
		const timer = setInterval(() => {
			if (!paper) {
				paper = readSummaryPaper();
				if (paper) {
					save();
					log("论文信息已缓存", paper);
				}
			}

			const preview = document.querySelector(
				'.operaBox a[onclick*="preview("]',
			);

			if (paper && preview && !downloadButton) {
				downloadButton = addSummaryDownloadButton(preview, paper);
				clearInterval(timer);
			}
		}, 200);

		setTimeout(() => clearInterval(timer), 15000);
	}

	function readSummaryPaper() {
		const params = new URLSearchParams(location.search);
		const thesis = document.querySelector("h1.cn")?.textContent.trim();
		const dbCode = params.get("dbCode");
		const sysId = params.get("sysId");

		if (!thesis || !dbCode || !sysId) return null;

		for (const span of document.querySelectorAll("span")) {
			const author = span.textContent
				.trim()
				.match(/^作者[:：]\s*(.+)$/)?.[1]
				?.trim();
			if (author) return { thesis, author, dbCode, sysId };
		}

		return null;
	}

	function addSummaryDownloadButton(preview, paper) {
		const button = createDownloadButton();
		button.style.marginRight = "12px";
		preview.before(button);
		let files = null;
		let select = null;

		button.onclick = async () => {
			if (button.disabled) return;

			button.disabled = true;
			let label = "下载为 PDF";
			button.textContent = "正在准备…";
			button.title = "";

			try {
				if (!files) {
					files = await fetchPreviewFiles(paper);

					if (files.length > 1) {
						select = document.createElement("select");
						select.setAttribute("aria-label", "选择要下载的文件");
						files.forEach((file, index) => {
							const option = document.createElement("option");
							option.value = String(index);
							option.textContent = file.fileName || `文件 ${index + 1}`;
							select.appendChild(option);
						});
						button.before(select);
						button.title = "请选择文件后点击下载";
						return;
					}
				}

				const file = files[select ? Number(select.value) : 0];
				download(await fetchPdf(file), fileName(paper));
			} catch (error) {
				files = null;
				select?.remove();
				select = null;
				button.title = error.message;
				console.error("[TNED Lite] 摘要页下载失败：", error);
				label = "下载失败，点击重试";
			} finally {
				button.disabled = false;
				button.textContent = label;
			}
		};

		return button;
	}

	/*
	 * PDF 预览页：
	 * 1. 截获 PDF 响应；
	 * 2. 必要时获取临时密钥并解密；
	 * 3. 恢复论文题名；
	 * 4. 用户点击按钮后下载 PDF。
	 */
	function runViewerPage() {
		let resolvePdf;
		let finished = false;

		const pdfReady = new Promise((resolve) => {
			resolvePdf = resolve;
		});

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

		interceptResponses(
			"/api/getpdfstream",
			async (response, url) =>
				capture(
					await response.arrayBuffer(),
					url,
					response.status,
					response.headers.get("X-PDF-IV") || "",
					response.headers.get("X-PDF-TAG") || "",
				),
			async (xhr, url) => {
				const buffer =
					xhr.responseType === "blob"
						? await xhr.response.arrayBuffer()
						: xhr.responseType === "arraybuffer"
							? xhr.response
							: await new Blob([xhr.responseText || ""]).arrayBuffer();

				return capture(
					buffer,
					url,
					xhr.status,
					xhr.getResponseHeader("X-PDF-IV") || "",
					xhr.getResponseHeader("X-PDF-TAG") || "",
				);
			},
		);

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

		/*
		 * PDF 和论文信息就绪后启用按钮，仅在用户点击时下载。
		 */
		later(async () => {
			const button = createDownloadButton();
			button.title = "等待 PDF 加载";
			button.disabled = true;
			button.style.cssText +=
				";position:fixed;right:12px;bottom:12px;z-index:2147483647";
			button.style.cursor = "wait";

			document.body.appendChild(button);

			const [blob, paper] = await Promise.all([pdfReady, paperInfo()]);
			const name = fileName(paper);

			button.onclick = () => download(blob, name);
			button.title = `下载 ${name}`;
			button.style.cursor = "pointer";
			button.disabled = false;
		});
	}
})();
