const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const BACKGROUND_PATH = path.resolve(__dirname, "../background.js");

function loadBackground(downloadImpl) {
	let listener;
	const calls = [];
	global.chrome = {
		runtime: {
			onMessage: {
				addListener: (fn) => {
					listener = fn;
				},
			},
		},
		downloads: {
			download: (options) => {
				calls.push(options);
				return downloadImpl(options);
			},
		},
	};
	delete require.cache[BACKGROUND_PATH];
	require(BACKGROUND_PATH);
	return { listener, calls };
}

function send(listener, message) {
	return new Promise((resolve) => {
		const returned = listener(message, {}, resolve);
		assert.equal(returned, true);
	});
}

function decodeDataUrl(url) {
	const match = /^data:([^;]+);base64,(.*)$/s.exec(url);
	assert.ok(match, "expected a base64 data URL");
	return {
		mimeType: match[1],
		text: Buffer.from(match[2], "base64").toString("utf8"),
	};
}

test("background downloads content as a base64 data URL", async () => {
	const { listener, calls } = loadBackground(async () => 42);
	const data = "# タイトル\n日本語 abc 😀";
	const response = await send(listener, {
		type: "chat-export-download",
		data,
		mimeType: "text/markdown",
		filename: "chat.md",
	});

	assert.deepEqual(response, { ok: true, id: 42 });
	assert.equal(calls.length, 1);
	assert.equal(calls[0].filename, "chat.md");
	assert.equal(calls[0].saveAs, true);
	assert.deepEqual(decodeDataUrl(calls[0].url), {
		mimeType: "text/markdown",
		text: data,
	});
});

test("background handles large content", async () => {
	const { listener, calls } = loadBackground(async () => 1);
	const data = "日本語abc😀\n".repeat(100000);
	await send(listener, {
		type: "chat-export-download",
		data,
		mimeType: "text/html",
		filename: "chat.html",
	});

	assert.equal(decodeDataUrl(calls[0].url).text, data);
});

test("background reports download failures", async () => {
	const { listener } = loadBackground(async () => {
		throw new Error("boom");
	});
	const response = await send(listener, {
		type: "chat-export-download",
		data: "x",
		mimeType: "text/markdown",
		filename: "chat.md",
	});

	assert.equal(response.ok, false);
	assert.match(response.error, /boom/);
});

test("background ignores unrelated messages", () => {
	const { listener, calls } = loadBackground(async () => 1);
	assert.equal(
		listener({ type: "other" }, {}, () => {}),
		false,
	);
	assert.equal(calls.length, 0);
});
