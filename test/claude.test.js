const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
	parseHtml,
	setupContentScript,
	requestExport,
} = require("./helpers/dom.js");

function setupClaude(fixtureName) {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures", fixtureName),
		"utf8",
	);
	const root = parseHtml(html);
	const messageListener = setupContentScript(root, { hostname: "claude.ai" });
	return messageListener;
}

test("claude simple turn is exported", async () => {
	const messageListener = setupClaude("claude-simple.html");
	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "gemini",
	});

	assert.ok(response?.ok, "export should succeed");
	assert.equal(response.data.turns.length, 1);
	assert.equal(response.data.turns[0].user, "1+3は");
	assert.ok(
		response.data.turns[0].model.includes("1 + 3"),
		"model response should include the answer",
	);
});

test("claude export markdown uses Claude label", async () => {
	const messageListener = setupClaude("claude-simple.html");

	const geminiStyle = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "gemini",
	});
	assert.ok(geminiStyle?.ok);
	assert.ok(
		geminiStyle.data.markdown.includes("### Claude"),
		"gemini-style markdown should use Claude label",
	);
	assert.ok(
		!geminiStyle.data.markdown.includes("### Gemini"),
		"should not use Gemini label on claude.ai",
	);

	const legacyStyle = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "legacy",
	});
	assert.ok(legacyStyle?.ok);
	assert.ok(
		legacyStyle.data.markdown.includes("## Turn 1-2: Claude"),
		"legacy-style markdown should use Claude label",
	);
});

test("claude export html uses Claude label", async () => {
	const messageListener = setupClaude("claude-simple.html");
	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "gemini",
	});

	assert.ok(response?.ok);
	assert.ok(
		response.data.html.includes("<h3>Claude</h3>"),
		"html should use Claude label",
	);
	assert.ok(
		/<title>Claude Export \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)<\/title>/.test(
			response.data.html,
		),
		"html title should say Claude Export with date",
	);
});

test("claude multi-turn all scope exports all turns", async () => {
	const messageListener = setupClaude("claude-multi-turn.html");
	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "all",
		markdownStyle: "gemini",
	});

	assert.ok(response?.ok, "export should succeed");
	assert.equal(response.data.turns.length, 2, "should have 2 turns");
	assert.equal(response.data.turns[0].user, "Pythonとは何ですか？");
	assert.equal(response.data.turns[1].user, "特徴を教えてください");
	assert.ok(response.data.turns[0].model.includes("汎用プログラミング言語"));
	assert.ok(response.data.turns[1].model.includes("豊富なライブラリ"));
});

test("claude multi-turn current scope exports last turn only", async () => {
	const messageListener = setupClaude("claude-multi-turn.html");
	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "gemini",
	});

	assert.ok(response?.ok);
	assert.equal(
		response.data.turns.length,
		1,
		"current scope should return 1 turn",
	);
	assert.equal(response.data.turns[0].user, "特徴を教えてください");
});

test("claude multi-turn select scope exports specified turn", async () => {
	const messageListener = setupClaude("claude-multi-turn.html");
	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "select",
		turnIndex: 0,
		markdownStyle: "gemini",
	});

	assert.ok(response?.ok);
	assert.equal(response.data.turns.length, 1);
	assert.equal(response.data.turns[0].user, "Pythonとは何ですか？");
});

test("claude LIST_GEMINI_TURNS returns turn list", async () => {
	const messageListener = setupClaude("claude-multi-turn.html");
	const response = await new Promise((resolve) => {
		messageListener({ type: "LIST_GEMINI_TURNS" }, null, resolve);
	});

	assert.ok(response?.ok);
	assert.equal(response.data.turns.length, 2);
	assert.equal(response.data.turns[0].index, 0);
	assert.ok(response.data.turns[0].label.includes("Pythonとは何ですか"));
	assert.equal(response.data.turns[1].index, 1);
});

test("claude toml export uses Claude label", async () => {
	const messageListener = setupClaude("claude-simple.html");
	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
	});

	assert.ok(response?.ok);
	const toml = response.data.toml;
	assert.ok(
		/title = "Claude Export \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)"/.test(
			toml,
		),
		"toml session title should be Claude Export with date",
	);
});
