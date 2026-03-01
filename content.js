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
		thoughtsToggleButton: "[data-test-id='thoughts-header-button']",
	};

	const markdown = window.__geminiMarkdown || {};
	const THOUGHTS_HEADING = "Thought Process";

	function cleanText(text) {
		return text
			.replace(/\u00A0/g, " ")
			.replace(/[\t\f\r]+/g, " ")
			.replace(/\n{3,}/g, "\n\n")
			.trim();
	}

	function getVisibleText(node) {
		if (!node) return "";
		const clone = node.cloneNode(true);
		const hiddenNodes = Array.from(
			clone.querySelectorAll(".cdk-visually-hidden, [aria-hidden='true']"),
		);
		hiddenNodes.forEach((hiddenNode) => {
			hiddenNode.remove();
		});
		return cleanText(clone.innerText || clone.textContent || "");
	}

	function getUserText(container) {
		const node = container.querySelector(SELECTORS.userText);
		if (!node) return "";
		return getVisibleText(node);
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

	function sleep(ms) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	}

	function getThoughtsToggleButton(container) {
		return container.querySelector(SELECTORS.thoughtsToggleButton);
	}

	function hasExpandedThoughts(container) {
		return Boolean(getModelThoughts(container));
	}

	async function ensureThoughtsExpanded(container) {
		if (hasExpandedThoughts(container)) {
			return false;
		}

		const toggleButton = getThoughtsToggleButton(container);
		if (!toggleButton || typeof toggleButton.click !== "function") {
			return false;
		}

		toggleButton.click();

		for (let i = 0; i < 10; i += 1) {
			if (hasExpandedThoughts(container)) {
				return true;
			}
			await sleep(50);
		}

		return false;
	}

	async function restoreThoughtsState(container, shouldCollapse) {
		if (!shouldCollapse) return;
		const toggleButton = getThoughtsToggleButton(container);
		if (!toggleButton || typeof toggleButton.click !== "function") {
			return;
		}
		toggleButton.click();
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

	function buildHtml(turns, includeThoughts) {
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

				if (includeThoughts && thoughtsHtml) {
					parts.push(
						`  <div class="role thoughts">`,
						`    <h3>${THOUGHTS_HEADING}</h3>`,
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

	function buildGeminiStyleMarkdown(turns, includeThoughts) {
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

			if (includeThoughts && turn.thoughts) {
				lines.push("", `### ${THOUGHTS_HEADING}`, "", turn.thoughts);
			}

			lines.push("", "### Gemini", "", turn.model || "");
		});
		return lines.join("\n");
	}

	function buildLegacyStyleMarkdown(turns, includeThoughts) {
		const lines = [];
		turns.forEach((turn, index) => {
			lines.push("", `## Turn ${index + 1}-1: User`, "", turn.user || "");

			if (includeThoughts && turn.thoughts) {
				lines.push(
					"",
					`## Turn ${index + 1}-1.5: ${THOUGHTS_HEADING}`,
					"",
					turn.thoughts,
				);
			}

			lines.push("", `## Turn ${index + 1}-2: Gemini`, "", turn.model || "");
		});
		return lines.join("\n");
	}

	function buildMarkdown(turns, markdownStyle, includeThoughts) {
		if (markdownStyle === "legacy") {
			return buildLegacyStyleMarkdown(turns, includeThoughts);
		}
		return buildGeminiStyleMarkdown(turns, includeThoughts);
	}

	async function extract(scope, turnIndex, markdownStyle, includeThoughts) {
		const containers = pickConversations(scope, turnIndex);
		const turns = [];

		for (const container of containers) {
			const shouldRestoreThoughts = includeThoughts
				? await ensureThoughtsExpanded(container)
				: false;
			try {
				turns.push({
					user: getUserText(container),
					thoughts: getModelThoughts(container),
					thoughtsHtml: getModelThoughtsHtml(container),
					model: getModelText(container),
					modelHtml: getModelHtml(container),
				});
			} finally {
				await restoreThoughtsState(container, shouldRestoreThoughts);
			}
		}

		return {
			turns,
			html: buildHtml(turns, includeThoughts),
			markdown: buildMarkdown(turns, markdownStyle, includeThoughts),
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
		if (message.type === "EXPORT_GEMINI_CHAT") {
			const scope =
				message.scope === "current" || message.scope === "select"
					? message.scope
					: "all";
			const turnIndex = Number.isInteger(message.turnIndex)
				? message.turnIndex
				: null;
			const markdownStyle =
				message.markdownStyle === "gemini" ? "gemini" : "legacy";
			const includeThoughts = message.includeThoughts !== false;
			extract(scope, turnIndex, markdownStyle, includeThoughts)
				.then((result) => {
					sendResponse({ ok: true, data: result });
				})
				.catch((error) => {
					sendResponse({ ok: false, error: String(error) });
				});
			return true;
		}
		try {
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
