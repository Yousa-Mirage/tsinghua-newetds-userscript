const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { webcrypto } = require("node:crypto");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(`${__dirname}/../tsinghua-newetds-downloader.user.js`, "utf8");
const pdf = new TextEncoder().encode("%PDF-1.7\nTest PDF");
const tick = () => new Promise((resolve) => setImmediate(resolve));

function page({ viewer = false, previewVisible = true, fetch } = {}) {
	const elements = [];
	const downloads = [];
	const requests = [];
	const intervals = [];
	const storage = new Map();
	const paper = { thesis: "论文/题名", author: "作者", timestamp: Date.now() };
	storage.set("tned-lite:db", JSON.stringify({ papers: {}, signs: { test: paper } }));
	function element(tag) {
		const result = {
			tag, style: {}, children: [], value: "0",
			appendChild(child) { this.children.push(child); },
			setAttribute() {}, after(child) { this.next = child; },
			before(child) { this.previous = child; }, remove() { this.removed = true; },
			click() {
				if (tag === "a") downloads.push(this);
				else if (!this.disabled) return this.onclick?.();
			},
		};
		elements.push(result);
		return result;
	}
	const preview = element("preview");
	class XHR {
		open() {}
		send() {}
		addEventListener(name, fn) { this[name] = fn; }
		getResponseHeader() { return null; }
	}
	class TestURL extends URL {
		static createObjectURL(blob) {
			assert.equal(blob.type, "application/pdf");
			return "blob:test";
		}
		static revokeObjectURL() {}
	}
	const context = {
		location: new URL(viewer
			? "https://newetds.lib.tsinghua.edu.cn/pdf/generic/web/viewer.html?file=%2Fapi%2FgetPdfStream%3FproxySign%3Dtest"
			: "https://newetds.lib.tsinghua.edu.cn/qh/paper/summary?dbCode=ETDQH&sysId=287207"),
		URL: TestURL, URLSearchParams, Blob, Uint8Array, crypto: webcrypto,
		atob: (value) => Buffer.from(value, "base64").toString("binary"),
		XMLHttpRequest: XHR,
		document: {
			readyState: "complete", body: element("body"), createElement: element,
			querySelector(selector) {
				return selector === "h1.cn" ? { textContent: paper.thesis }
					: previewVisible ? preview : null;
			},
			querySelectorAll() { return [{ textContent: `作者：${paper.author}` }]; },
		},
		localStorage: {
			getItem(key) { assert.notEqual(key, "tned-lite:mode"); return storage.get(key) ?? null; },
			setItem(key, value) { assert.equal(key, "tned-lite:db"); storage.set(key, value); },
		},
		setInterval(fn) { intervals.push(fn); }, clearInterval() {}, setTimeout() {},
		console: { log() {}, error() {} },
		confirm() { assert.fail("Unexpected popup"); },
		open() { assert.fail("Summary download must not open a viewer"); },
		async fetch(url, options) {
			requests.push({ url, options });
			return fetch ? fetch(url, options) : new Response(pdf);
		},
	};
	context.window = context;
	vm.runInNewContext(source, context);
	intervals.forEach((fn) => fn());
	return { context, elements, downloads, requests, preview,
		button: elements.find((el) => el.tag === "button") };
}

const filesResponse = (files) => Response.json({ code: 0, data: files });

test("summary downloads only on click, using the site's preview parameters", async () => {
	const p = page({ fetch: async (url) => url === "/api/fileProxy"
		? filesResponse([{ encryptPreviewUrl: "test" }]) : new Response(pdf) });
	assert.equal(p.preview.next, p.button);
	assert.equal(p.button.textContent, "下载为 PDF");
	assert.equal(p.requests.length, 0);
	const pending = p.button.click();
	assert.equal(p.button.disabled, true);
	await p.button.click();
	await pending;
	assert.equal(p.requests.length, 2);
	assert.equal(p.requests[0].options.method, "POST");
	assert.deepEqual(Object.fromEntries(p.requests[0].options.body), {
		action: "getToken", dbCode: "ETDQH", recordId: "287207",
	});
	assert.equal(p.requests[1].url, "/api/getPdfStream?proxySign=test");
	assert.equal(p.downloads[0].download, "论文_题名_作者.pdf");
	assert.equal(p.button.disabled, false);
});

test("summary decrypts AES-GCM with the current session's temporary key", async () => {
	const key = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 128 }, true, ["encrypt"]);
	const iv = webcrypto.getRandomValues(new Uint8Array(12));
	const cipher = Buffer.from(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pdf));
	const rawKey = Buffer.from(await webcrypto.subtle.exportKey("raw", key)).toString("base64");
	const p = page({ fetch: async (url, options) => {
		assert.equal(options.credentials, "include");
		if (url === "/api/fileProxy") return filesResponse([{ encryptPreviewUrl: "test" }]);
		if (url.startsWith("/api/getTempDecryptKey")) return Response.json({ tempKey: rawKey });
		return new Response(cipher.subarray(0, -16), { headers: {
			"X-PDF-IV": Buffer.from(iv).toString("base64"),
			"X-PDF-TAG": cipher.subarray(-16).toString("base64"),
		} });
	} });
	await p.button.click();
	assert.equal(p.downloads.length, 1);
	assert.equal(p.requests.length, 3);
});

test("multiple files require a selection before requesting a PDF", async () => {
	const p = page({ fetch: async (url) => url === "/api/fileProxy"
		? filesResponse([{ encryptPreviewUrl: "first" }, { encryptPreviewUrl: "second", fileName: "附件" }])
		: new Response(pdf) });
	await p.button.click();
	assert.equal(p.requests.length, 1);
	assert.equal(p.downloads.length, 0);
	const select = p.button.previous;
	assert.equal(select.children[1].textContent, "附件");
	select.value = "1";
	await p.button.click();
	assert.equal(p.requests[1].url, "/api/getPdfStream?proxySign=second");
	assert.equal(p.downloads.length, 1);
});

test("permission failures show inline feedback and allow a fresh retry", async () => {
	let denied = true;
	const p = page({ fetch: async (url) => url === "/api/fileProxy"
		? denied ? Response.json({ code: -1, data: { msg: "无预览权限" } })
			: filesResponse([{ encryptPreviewUrl: "test" }]) : new Response(pdf) });
	await p.button.click();
	assert.equal(p.button.textContent, "下载失败，点击重试");
	assert.equal(p.button.title, "无预览权限");
	assert.equal(p.downloads.length, 0);
	assert.equal(p.requests.length, 1);
	denied = false;
	await p.button.click();
	assert.equal(p.downloads.length, 1);
	assert.equal(p.button.textContent, "下载为 PDF");
	assert.equal(page({ previewVisible: false }).button, undefined);
});

test("viewer fetch and XHR capture still require a manual click", async () => {
	for (const transport of ["fetch", "xhr"]) {
		const p = page({ viewer: true });
		assert.equal(p.button.disabled, true);
		if (transport === "fetch") await p.context.fetch("/api/getPdfStream?proxySign=test");
		else {
			const xhr = new p.context.XMLHttpRequest();
			xhr.open("GET", "/api/getPdfStream?proxySign=test");
			xhr.responseType = "arraybuffer";
			xhr.response = pdf.buffer;
			xhr.status = 200;
			xhr.send();
			await xhr.loadend();
		}
		for (let i = 0; i < 5 && p.button.disabled; i++) await tick();
		assert.equal(p.button.disabled, false);
		assert.equal(p.downloads.length, 0);
		p.button.click();
		p.button.click();
		assert.equal(p.downloads.length, 2);
		assert.equal(p.downloads[0].download, "论文_题名_作者.pdf");
	}
});
