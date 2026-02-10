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
	};

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

	function getModelText(container) {
		const markdownNode = container.querySelector(SELECTORS.modelMarkdown);
		if (markdownNode) {
			return cleanText(
				markdownNode.innerText || markdownNode.textContent || "",
			);
		}
		const fallback = container.querySelector(SELECTORS.modelFallback);
		if (!fallback) return "";
		return cleanText(fallback.innerText || fallback.textContent || "");
	}

	function getModelHtml(container) {
		const markdownNode = container.querySelector(SELECTORS.modelMarkdown);
		if (markdownNode) return markdownNode.innerHTML.trim();
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

	function pickConversations(scope) {
		const nodes = Array.from(document.querySelectorAll(SELECTORS.conversation));
		if (nodes.length === 0) return [];
		if (scope === "current") return [nodes[nodes.length - 1]];
		return nodes;
	}

	function buildHtml(turns, title) {
		const safeTitle = escapeHtml(title);
		const body = turns
			.map((turn, index) => {
				const userHtml = escapeHtml(turn.user).replace(/\n/g, "<br>");
				const modelHtml =
					turn.modelHtml || escapeHtml(turn.model).replace(/\n/g, "<br>");
				return [
					`<section class=\"turn\">`,
					`  <h2>Turn ${index + 1}</h2>`,
					`  <div class=\"role user\">`,
					`    <h3>User</h3>`,
					`    <div class=\"content\">${userHtml}</div>`,
					`  </div>`,
					`  <div class=\"role model\">`,
					`    <h3>Gemini</h3>`,
					`    <div class=\"content\">${modelHtml}</div>`,
					`  </div>`,
					`</section>`,
				].join("\n");
			})
			.join("\n\n");

		return [
			"<!doctype html>",
			'<html lang="ja">',
			"<head>",
			'<meta charset="utf-8">',
			`<title>${safeTitle}</title>`,
			"<style>",
			"body{font-family:system-ui, -apple-system, sans-serif;line-height:1.6;margin:24px;background:#f8f9fb;color:#111;}",
			".turn{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px;margin-bottom:16px;}",
			".role{padding:8px 12px;border-radius:10px;}",
			".role.user{background:#eef2ff;margin-bottom:12px;}",
			".role.model{background:#ecfeff;}",
			".content{white-space:normal;}",
			"pre, code{white-space:pre-wrap;}",
			"</style>",
			"</head>",
			"<body>",
			`<h1>${safeTitle}</h1>`,
			body,
			"</body>",
			"</html>",
		].join("\n");
	}

	function buildMarkdown(turns, title) {
		const lines = [`# ${title}`];
		turns.forEach((turn, index) => {
			lines.push(
				"",
				`## Turn ${index + 1}`,
				"",
				"### User",
				"",
				turn.user || "",
				"",
				"### Gemini",
				"",
				turn.model || "",
			);
		});
		return lines.join("\n");
	}

	function extract(scope) {
		const containers = pickConversations(scope);
		const turns = containers.map((container) => ({
			user: getUserText(container),
			model: getModelText(container),
			modelHtml: getModelHtml(container),
		}));

		const title =
			scope === "current"
				? "Gemini Conversation (Current)"
				: "Gemini Conversations (All)";
		return {
			title,
			turns,
			html: buildHtml(turns, title),
			markdown: buildMarkdown(turns, title),
		};
	}

	chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
		if (!message || message.type !== "EXPORT_GEMINI_CHAT") return;
		try {
			const scope = message.scope === "current" ? "current" : "all";
			const result = extract(scope);
			sendResponse({ ok: true, data: result });
		} catch (error) {
			sendResponse({ ok: false, error: String(error) });
		}
		return true;
	});
})();
