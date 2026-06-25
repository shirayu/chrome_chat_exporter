const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
	parseHtml,
	setupContentScript,
	requestExport,
} = require("./helpers/dom.js");

function cloneNodes(nodes) {
	return nodes.map((node) => node.cloneNode(true));
}

function replaceChildren(target, nodes) {
	target.childNodes = [];
	nodes.forEach((node) => {
		target.appendChild(node);
	});
}

function setupThoughtsToggle(root, expandedRoot) {
	const currentContainer = root.querySelector(".thoughts-container");
	const expandedContainer = expandedRoot.querySelector(".thoughts-container");
	const toggleButton = root.querySelector(
		"[data-test-id='thoughts-header-button']",
	);
	const expandedButton = expandedRoot.querySelector(
		"[data-test-id='thoughts-header-button']",
	);
	assert.ok(currentContainer, "current thoughts container not found");
	assert.ok(expandedContainer, "expanded thoughts container not found");
	assert.ok(toggleButton, "thoughts toggle button not found");
	assert.ok(expandedButton, "expanded thoughts toggle button not found");

	const collapsedChildren = cloneNodes(currentContainer.childNodes);
	const expandedChildren = cloneNodes(expandedContainer.childNodes);
	const collapsedLabel = toggleButton.textContent;
	const expandedLabel = expandedButton.textContent;

	toggleButton.onclick = () => {
		const isExpanded = Boolean(
			currentContainer.querySelector(".thoughts-container .markdown") ||
				currentContainer.querySelector(".markdown"),
		);
		if (isExpanded) {
			replaceChildren(currentContainer, cloneNodes(collapsedChildren));
		} else {
			replaceChildren(currentContainer, cloneNodes(expandedChildren));
		}
		const buttonAfterToggle = root.querySelector(
			"[data-test-id='thoughts-header-button']",
		);
		if (buttonAfterToggle) {
			buttonAfterToggle.onclick = toggleButton.onclick;
			buttonAfterToggle.attributes["data-toggle-state"] = isExpanded
				? "collapsed"
				: "expanded";
			if (isExpanded) {
				assert.equal(buttonAfterToggle.textContent, collapsedLabel);
			} else {
				assert.equal(buttonAfterToggle.textContent, expandedLabel);
			}
		}
	};
}

test("user prompt hidden label is excluded from markdown export", async () => {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-user-hidden-label.html"),
		"utf8",
	);
	const root = parseHtml(html);
	const messageListener = setupContentScript(root);
	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
	});

	assert.ok(response?.ok, "export should succeed");
	assert.equal(response.data.turns.length, 1);
	assert.equal(response.data.turns[0].user, "SynthIDはどうやって作れる？");
	assert.ok(
		!response.data.markdown.includes("あなたのプロンプト"),
		"markdown should not include hidden user prompt label",
	);
	assert.ok(response.data.markdown.includes("SynthIDはどうやって作れる？"));
});

test("markdown style option switches heading format", async () => {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-user-hidden-label.html"),
		"utf8",
	);
	const root = parseHtml(html);
	const messageListener = setupContentScript(root);
	const defaultStyleResponse = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
	});
	assert.ok(defaultStyleResponse?.ok, "default export should succeed");
	assert.ok(defaultStyleResponse.data.markdown.includes("## Turn 1-1: User"));
	assert.ok(defaultStyleResponse.data.markdown.includes("## Turn 1-2: Gemini"));

	const legacyStyleResponse = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "legacy",
	});
	assert.ok(legacyStyleResponse?.ok, "legacy export should succeed");
	assert.ok(legacyStyleResponse.data.markdown.includes("## Turn 1-1: User"));
	assert.ok(legacyStyleResponse.data.markdown.includes("## Turn 1-2: Gemini"));

	const geminiStyleResponse = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "gemini",
	});
	assert.ok(geminiStyleResponse?.ok, "gemini style export should succeed");
	assert.ok(geminiStyleResponse.data.markdown.includes("## Turn 1"));
	assert.ok(geminiStyleResponse.data.markdown.includes("### User"));
	assert.ok(geminiStyleResponse.data.markdown.includes("### Gemini"));
});

test("thoughts are included by default and can be disabled", async () => {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-thoughts-toggle.html"),
		"utf8",
	);
	const root = parseHtml(html);
	const messageListener = setupContentScript(root);
	const defaultResponse = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "gemini",
	});

	assert.ok(defaultResponse?.ok, "default export should succeed");
	assert.equal(
		defaultResponse.data.turns[0].thoughts,
		"まず要件を整理します。\n\n次に出力形式を分けて考えます。",
	);
	assert.ok(
		defaultResponse.data.markdown.includes("### Thought Process"),
		"default markdown should include thoughts heading",
	);
	assert.ok(
		defaultResponse.data.markdown.includes("まず要件を整理します。"),
		"default markdown should include thoughts content",
	);
	assert.ok(
		defaultResponse.data.html.includes("<h3>Thought Process</h3>"),
		"default html should include thoughts section",
	);

	const hiddenResponse = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "gemini",
		includeThoughts: false,
	});

	assert.ok(hiddenResponse?.ok, "thoughts-disabled export should succeed");
	assert.equal(
		hiddenResponse.data.turns[0].thoughts,
		"まず要件を整理します。\n\n次に出力形式を分けて考えます。",
	);
	assert.ok(
		!hiddenResponse.data.markdown.includes("### Thought Process"),
		"markdown should omit thoughts heading when disabled",
	);
	assert.ok(
		!hiddenResponse.data.markdown.includes("まず要件を整理します。"),
		"markdown should omit thoughts content when disabled",
	);
	assert.ok(
		!hiddenResponse.data.html.includes("<h3>Thought Process</h3>"),
		"html should omit thoughts section when disabled",
	);
});

test("collapsed thoughts are expanded for export and restored afterward", async () => {
	const collapsedHtml = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-thoughts-collapsed.html"),
		"utf8",
	);
	const expandedHtml = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-thoughts-expanded.html"),
		"utf8",
	);
	const root = parseHtml(collapsedHtml);
	const expandedRoot = parseHtml(expandedHtml);
	setupThoughtsToggle(root, expandedRoot);
	const messageListener = setupContentScript(root);

	assert.equal(root.querySelector(".thoughts-container .markdown"), null);

	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "gemini",
		includeThoughts: true,
	});

	assert.ok(response?.ok, "export should succeed");
	assert.ok(
		response.data.markdown.includes("### Thought Process"),
		"collapsed thoughts should be exported after auto expand",
	);
	assert.ok(
		response.data.turns[0].thoughts.includes(
			"Assessing Difficulty of Info Geom",
		),
		"expanded thoughts text should be captured",
	);
	assert.equal(
		root.querySelector(".thoughts-container .markdown"),
		null,
		"thoughts should be restored to collapsed state after export",
	);
});

test("sequence UI export excludes hidden labels and separates each event", async () => {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-sequence-ui.html"),
		"utf8",
	);
	const root = parseHtml(html);
	const messageListener = setupContentScript(root);
	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "gemini",
	});

	assert.ok(response?.ok, "export should succeed");
	const md = response.data.markdown;

	// only-show-to-message-actions のエクスポートヘッダー（display:none）が混入しないこと
	assert.ok(!md.includes("1.ステップA:"), "export header should not appear");
	assert.ok(!md.includes("2.ステップB:"), "export header should not appear");
	assert.ok(!md.includes("3.ステップC:"), "export header should not appear");

	// タイトル・サブタイトルが含まれること（画面に表示されるテキストは失われない）
	assert.ok(md.includes("ステップA"), "sequence title should appear");
	assert.ok(md.includes("最初にやること"), "sequence subtitle should appear");

	// 各イベントの本文が独立して含まれること
	assert.ok(md.includes("ステップAの本文です。"), "event A body should appear");
	assert.ok(md.includes("ステップBの本文です。"), "event B body should appear");
	assert.ok(md.includes("ステップCの本文です。"), "event C body should appear");

	// 3つの本文が1行に連結されていないこと
	assert.ok(
		!md.includes("ステップAの本文です。ステップBの本文です。"),
		"event bodies should not be concatenated",
	);

	// sequence の前後のテキストも含まれること
	assert.ok(md.includes("以下の3つのステップがあります。"));
	assert.ok(md.includes("以上が3つのステップです。"));
});

test("shared Gemini page sample is exported", async () => {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-share-page-minimal.html"),
		"utf8",
	);
	const root = parseHtml(html);
	const messageListener = setupContentScript(root);
	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		markdownStyle: "gemini",
		includeThoughts: false,
	});

	assert.ok(response?.ok, "shared page export should succeed");
	assert.equal(response.data.turns.length, 1);
	assert.equal(response.data.turns[0].user, "共有ページでも読める？");
	assert.ok(
		response.data.turns[0].model.includes(
			"共有ページの DOM でも抽出できます。",
		),
		"shared page model response should be captured",
	);
	assert.ok(
		response.data.markdown.includes("### Gemini"),
		"shared page markdown should include Gemini heading",
	);
});

test("toml export matches v3.0 specification", async () => {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-thoughts-toggle.html"),
		"utf8",
	);
	const root = parseHtml(html);
	const messageListener = setupContentScript(root);
	const response = await requestExport(messageListener, {
		type: "EXPORT_GEMINI_CHAT",
		scope: "current",
		includeThoughts: true,
	});

	assert.ok(response?.ok, "export should succeed");
	const toml = response.data.toml;

	assert.ok(
		toml.includes("[export_info]"),
		"should contain export_info section",
	);
	assert.ok(toml.includes('format_version = "3.0"'), "should version 3.0");
	assert.ok(toml.includes('exported_at = "'), "should contain exported_at");

	assert.ok(toml.includes("[session]"), "should contain session section");
	assert.ok(toml.includes('id = "'), "should contain session id");
	assert.ok(toml.includes('user_id = "'), "should contain user_id");
	assert.ok(
		toml.includes('created_at = "'),
		"should contain session created_at",
	);
	assert.ok(
		toml.includes('last_activity = "'),
		"should contain session last_activity",
	);
	assert.ok(
		/title = "Gemini Export \(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\)"/.test(
			toml,
		),
		"should contain default title with date",
	);

	assert.ok(toml.includes("[[messages]]"), "should contain messages sections");
	assert.ok(toml.includes('id = "'), "should contain message id");
	assert.ok(toml.includes('role = "user"'), "should contain user role");
	assert.ok(
		toml.includes('session_id = "'),
		"should link messages to session_id",
	);
	assert.ok(toml.includes('user_id = "'), "should link messages to user_id");
	assert.ok(
		toml.includes('role = "assistant"'),
		"should contain assistant role",
	);
	assert.ok(
		toml.includes('parent_chat_message_id = "'),
		"should link assistant message to parent",
	);

	assert.ok(toml.includes("[[messages.parts]]"), "should contain parts array");
	assert.ok(
		toml.includes('type = "reasoning"'),
		"should contain reasoning part",
	);
	assert.ok(toml.includes('type = "text"'), "should contain text part");

	// Verify multiline format for text containing newlines
	assert.ok(
		toml.includes(
			'thinking = """\nまず要件を整理します。\n\n次に出力形式を分けて考えます。"""',
		),
		"thinking should be exported in multiline basic string format with actual newlines",
	);

	assert.ok(
		toml.includes("[workflow_execution_history]"),
		"should contain history section",
	);
	assert.ok(
		toml.includes("entries = []"),
		"should contain empty history entries",
	);
});
