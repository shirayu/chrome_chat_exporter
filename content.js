(() => {
	if (window.__geminiChatExporterInjected) {
		return;
	}
	window.__geminiChatExporterInjected = true;

	const SELECTORS = {
		conversation: ".conversation-container",
		userText: ".user-query-container .query-text",
		modelMarkdown: ".response-content .markdown",
		modelFallback: ".response-content",
		thoughtsContainer: ".thoughts-container",
	};

	const markdown = window.__geminiMarkdown || {};

	function cleanText(text) {
		return text
			.replace(/\u00A0/g, " ")
			.replace(/[\t\f\r]+/g, " ")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}

	function getUserText(container) {
		const node = container.querySelector(SELECTORS.userText);
		if (!node) return "";
		return cleanText(node.innerText || node.textContent || "");
	}

	function getModelThoughts(container) {
		const thoughtsContainers = Array.from(
			container.querySelectorAll(SELECTORS.thoughtsContainer),
		);
		if (thoughtsContainers.length === 0) return "";

		const chunks = [];
		for (const thoughtsContainer of thoughtsContainers) {
			const markdownNodes = Array.from(
				thoughtsContainer.querySelectorAll(".markdown"),
			);
			for (const node of markdownNodes) {
				const text = markdown.extractMarkdownFromNode(node);
				if (text?.trim()) {
					chunks.push(cleanText(text));
				}
			}
		}
		if (chunks.length === 0) return "";
		return cleanText(chunks.join("\n\n"));
	}

	function getModelText(container) {
		// Get all markdown nodes, skip empty ones and thoughts
		const markdownNodes = Array.from(
			container.querySelectorAll(SELECTORS.modelMarkdown),
		);
		const thoughtsContainers = Array.from(
			container.querySelectorAll(SELECTORS.thoughtsContainer),
		);

		for (const node of markdownNodes) {
			// Skip if this node is inside thoughts container
			if (
				thoughtsContainers.some((thoughtsContainer) =>
					thoughtsContainer.contains(node),
				)
			) {
				continue;
			}
			const text = markdown.extractMarkdownFromNode(node);
			if (text?.trim()) {
				return cleanText(text);
			}
		}
		const fallback = container.querySelector(SELECTORS.modelFallback);
		if (!fallback) return "";
		return cleanText(fallback.innerText || fallback.textContent || "");
	}

	if (!markdown.extractMarkdownFromNode) {
		markdown.extractMarkdownFromNode = (node) =>
			node.innerText || node.textContent || "";
	}

	function getModelThoughtsHtml(container) {
		const thoughtsContainers = Array.from(
			container.querySelectorAll(SELECTORS.thoughtsContainer),
		);
		if (thoughtsContainers.length === 0) return "";

		const chunks = [];
		for (const thoughtsContainer of thoughtsContainers) {
			const markdownNodes = Array.from(
				thoughtsContainer.querySelectorAll(".markdown"),
			);
			for (const node of markdownNodes) {
				const html = node.innerHTML.trim();
				if (html) {
					chunks.push(html);
				}
			}
		}
		return chunks.join("\n");
	}

	function getModelHtml(container) {
		// Get all markdown nodes, skip empty ones and thoughts
		const markdownNodes = Array.from(
			container.querySelectorAll(SELECTORS.modelMarkdown),
		);
		const thoughtsContainers = Array.from(
			container.querySelectorAll(SELECTORS.thoughtsContainer),
		);

		for (const node of markdownNodes) {
			// Skip if this node is inside thoughts container
			if (
				thoughtsContainers.some((thoughtsContainer) =>
					thoughtsContainer.contains(node),
				)
			) {
				continue;
			}
			const html = node.innerHTML.trim();
			if (html) {
				return html;
			}
		}
		const fallback = container.querySelector(SELECTORS.modelFallback);
		if (!fallback) return "";
		return fallback.innerHTML.trim();
	}

	function escapeHtml(text) {
		return text
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;");
	}

	function pickConversations(scope, turnIndex) {
		const nodes = Array.from(document.querySelectorAll(SELECTORS.conversation));
		if (nodes.length === 0) return [];
		if (scope === "current") return [nodes[nodes.length - 1]];
		if (scope === "select" && Number.isInteger(turnIndex)) {
			const picked = nodes[turnIndex];
			return picked ? [picked] : [];
		}
		return nodes;
	}

	function buildHtml(turns) {
		const body = turns
			.map((turn, index) => {
				const userHtml = escapeHtml(turn.user).replace(/\n/g, "<br>");
				const modelHtml =
					turn.modelHtml || escapeHtml(turn.model).replace(/\n/g, "<br>");
				const thoughtsHtml = turn.thoughtsHtml
					? turn.thoughtsHtml
					: turn.thoughts
						? escapeHtml(turn.thoughts).replace(/\n/g, "<br>")
						: "";

				const parts = [
					`<section class="turn">`,
					`  <h2>Turn ${index + 1}</h2>`,
					`  <div class="role user">`,
					`    <h3>User</h3>`,
					`    <div class="content">${userHtml}</div>`,
					`  </div>`,
				];

				if (thoughtsHtml) {
					parts.push(
						`  <div class="role thoughts">`,
						`    <h3>思考プロセス</h3>`,
						`    <div class="content">${thoughtsHtml}</div>`,
						`  </div>`,
					);
				}

				parts.push(
					`  <div class="role model">`,
					`    <h3>Gemini</h3>`,
					`    <div class="content">${modelHtml}</div>`,
					`  </div>`,
					`</section>`,
				);

				return parts.join("\n");
			})
			.join("\n\n");

		return [
			"<!doctype html>",
			'<html lang="ja">',
			"<head>",
			'<meta charset="utf-8">',
			"<title>Gemini Export</title>",
			"<style>",
			"body{font-family:system-ui, -apple-system, sans-serif;line-height:1.6;margin:24px;background:#f8f9fb;color:#111;}",
			".turn{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;}",
			".role{padding:8px 12px;border-radius:10px;margin-bottom:12px;}",
			".role.user{background:#eef2ff;}",
			".role.thoughts{background:#fff4e6;}",
			".role.model{background:#ecfeff;}",
			".content{white-space:normal;}",
			"pre, code{white-space:pre-wrap;}",
			"</style>",
			"</head>",
			"<body>",
			body,
			"</body>",
			"</html>",
		].join("\n");
	}

	function buildMarkdown(turns) {
		const lines = [];
		turns.forEach((turn, index) => {
			lines.push(
				"",
				`## Turn ${index + 1}`,
				"",
				"### User",
				"",
				turn.user || "",
			);

			if (turn.thoughts) {
				lines.push("", "### 思考プロセス", "", turn.thoughts);
			}

			lines.push("", "### Gemini", "", turn.model || "");
		});
		return lines.join("\n");
	}

	function extract(scope, turnIndex) {
		const containers = pickConversations(scope, turnIndex);
		const turns = containers.map((container) => ({
			user: getUserText(container),
			thoughts: getModelThoughts(container),
			thoughtsHtml: getModelThoughtsHtml(container),
			model: getModelText(container),
			modelHtml: getModelHtml(container),
		}));

		return {
			turns,
			html: buildHtml(turns),
			markdown: buildMarkdown(turns),
		};
	}

	function buildTurnList() {
		const nodes = Array.from(document.querySelectorAll(SELECTORS.conversation));
		return nodes.map((container, index) => {
			const user = getUserText(container);
			const hint = user ? user.slice(0, 20) : "(no text)";
			return {
				index,
				label: `${index + 1}. ${hint}`,
			};
		});
	}

	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (!message || !message.type) return;
		try {
			if (message.type === "EXPORT_GEMINI_CHAT") {
				const scope =
					message.scope === "current" || message.scope === "select"
						? message.scope
						: "all";
				const turnIndex = Number.isInteger(message.turnIndex)
					? message.turnIndex
					: null;
				const result = extract(scope, turnIndex);
				sendResponse({ ok: true, data: result });
				return true;
			}
			if (message.type === "LIST_GEMINI_TURNS") {
				const turns = buildTurnList();
				sendResponse({ ok: true, data: { turns } });
				return true;
			}
		} catch (error) {
			sendResponse({ ok: false, error: String(error) });
		}
		return true;
	});
})();
