const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
	parseHtml,
	setupContentScript,
	requestExport,
} = require("./helpers/dom.js");

function setupChatGpt(fixtureName) {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures", fixtureName),
		"utf8",
	);
	const root = parseHtml(html);
	const messageListener = setupContentScript(root, { hostname: "chatgpt.com" });
	return messageListener;
}

test("chatgpt all scope exports paired turns", async () => {
	const messageListener = setupChatGpt("chatgpt-multi-turn.html");
	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "all",
		markdownStyle: "gemini",
	});

	assert.ok(response?.ok, "export should succeed");
	assert.equal(response.data.turns.length, 2);
	assert.equal(
		response.data.turns[0].user,
		"タニタ TT-559 は家庭用としてどの程度良い？",
	);
	assert.ok(
		response.data.turns[0].model.includes("家庭用の温湿度計"),
		"first response should include answer text",
	);
	assert.equal(response.data.turns[1].user, "寝室向けには？");
	assert.ok(response.data.turns[1].model.includes("寝室では時計表示"));
});

test("chatgpt export markdown and html use ChatGPT label", async () => {
	const messageListener = setupChatGpt("chatgpt-multi-turn.html");
	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "gemini",
	});

	assert.ok(response?.ok);
	assert.ok(response.data.markdown.includes("### ChatGPT"));
	assert.ok(!response.data.markdown.includes("### Claude"));
	assert.ok(!response.data.markdown.includes("### Gemini"));
	assert.ok(response.data.html.includes("<h3>ChatGPT</h3>"));
	assert.ok(
		/<title>ChatGPT Export \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)<\/title>/.test(
			response.data.html,
		),
	);
});

test("chatgpt current and select scopes choose expected turns", async () => {
	const messageListener = setupChatGpt("chatgpt-multi-turn.html");
	const currentResponse = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "gemini",
	});

	assert.ok(currentResponse?.ok);
	assert.equal(currentResponse.data.turns.length, 1);
	assert.equal(currentResponse.data.turns[0].user, "寝室向けには？");

	const selectResponse = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "select",
		turnIndex: 0,
		markdownStyle: "gemini",
	});

	assert.ok(selectResponse?.ok);
	assert.equal(selectResponse.data.turns.length, 1);
	assert.equal(
		selectResponse.data.turns[0].user,
		"タニタ TT-559 は家庭用としてどの程度良い？",
	);
});

test("chatgpt LIST_GEMINI_TURNS returns turn list", async () => {
	const messageListener = setupChatGpt("chatgpt-multi-turn.html");
	const response = await new Promise((resolve) => {
		messageListener({ type: "LIST_GEMINI_TURNS" }, null, resolve);
	});

	assert.ok(response?.ok);
	assert.equal(response.data.turns.length, 2);
	assert.equal(response.data.turns[0].index, 0);
	assert.ok(response.data.turns[0].label.includes("タニタ TT-559"));
	assert.equal(response.data.turns[1].index, 1);
	assert.ok(response.data.turns[1].label.includes("寝室向け"));
});

test("chatgpt virtualized empty turns are not exported as blank first turns", async () => {
	const messageListener = setupChatGpt("chatgpt-virtualized-partial.html");
	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "all",
		markdownStyle: "gemini",
	});

	assert.ok(response?.ok, "export should succeed");
	assert.equal(response.data.turns.length, 1);
	assert.equal(response.data.turns[0].user, "論文ある？");
	assert.ok(response.data.turns[0].model.includes("Principia Mathematica"));
	assert.ok(!response.data.markdown.includes("## Turn 1\n\n### User\n\n\n"));
});
