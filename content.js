(() => {
	if (window.__geminiChatExporterInjected) {
		return;
	}
	window.__geminiChatExporterInjected = true;

	function detectSite() {
		const hostname = window.location?.hostname || "";
		if (hostname.includes("claude.ai")) return "claude";
		if (hostname.includes("chatgpt.com")) return "chatgpt";
		return "gemini";
	}

	const SITE = detectSite();

	const SELECTORS = {
		conversation: ".conversation-container, .share-turn-viewer",
		userText: ".user-query-container .query-text",
		modelMarkdown:
			".response-content .markdown, .response-container-content .markdown, .message-content .markdown",
		modelFallback:
			".response-content, .response-container-content, .message-content",
		thoughtsContainer: ".thoughts-container",
		thoughtsToggleButton: "[data-test-id='thoughts-header-button']",
	};

	const CLAUDE_SELECTORS = {
		userMessage: "[data-testid='user-message']",
		modelResponse: ".font-claude-response",
		modelMarkdown: ".standard-markdown, .progressive-markdown",
		thoughtsToggleButton: ".group\\/status",
		thoughtsTimelineText: "[data-timeline-text]",
	};

	const CHATGPT_SELECTORS = {
		scrollRoot: "[data-scroll-root]",
		turn: "[data-turn]",
		userMessage: '[data-message-author-role="user"]',
		assistantMessage: '[data-message-author-role="assistant"]',
		modelMarkdown: ".markdown",
		keyedTurn: "[data-turn-key]",
		keyedUnit: "[data-chatgpt-search-unit-key]",
		keyedUserBubble: "[data-user-message-bubble]",
		keyedModelMarkdown: '[data-markdown-text-style="assistant-message"]',
		keyedScrollRoot: "[data-app-action-timeline-scroll]",
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

	function buildClaudeTurns() {
		const userNodes = Array.from(
			document.querySelectorAll(CLAUDE_SELECTORS.userMessage),
		);
		const responseNodes = Array.from(
			document.querySelectorAll(
				`[data-is-streaming] .font-claude-response, .font-claude-response`,
			),
		);
		return userNodes.map((userNode, i) => ({
			userNode,
			responseNode: responseNodes[i] || null,
		}));
	}

	function getChatGptTurnIndex(turnNode) {
		const testId = turnNode.getAttribute("data-testid") || "";
		const match = testId.match(/^conversation-turn-(\d+)$/);
		if (match) return Number.parseInt(match[1], 10);

		const id =
			turnNode.getAttribute("data-turn-id-container") ||
			turnNode.getAttribute("data-turn-id") ||
			"";
		if (!id) return null;
		let hash = 0;
		for (let i = 0; i < id.length; i += 1) {
			hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
		}
		return hash;
	}

	function extractChatGptModel(responseNode) {
		let modelText = "";
		let modelHtmlStr = "";
		if (responseNode) {
			const markdownNode = responseNode.querySelector(
				`${CHATGPT_SELECTORS.modelMarkdown}, ${CHATGPT_SELECTORS.keyedModelMarkdown}`,
			);
			if (markdownNode) {
				modelText = cleanText(markdown.extractMarkdownFromNode(markdownNode));
				modelHtmlStr = markdownNode.innerHTML.trim();
			}
			if (!modelText) {
				modelText = getVisibleText(responseNode);
				modelHtmlStr = responseNode.innerHTML.trim();
			}
		}
		return { modelText, modelHtmlStr };
	}

	const keyedTurnOrders = new WeakMap();

	// 新DOM: [data-turn-key] が user/assistant のペアを内包する
	function captureChatGptKeyedTurns(records) {
		const keyedNodes = Array.from(
			getChatGptQueryScope().querySelectorAll(CHATGPT_SELECTORS.keyedTurn),
		);
		keyedNodes.forEach((keyedNode, order) => {
			// fallback-turn-N は仮想化で振り直され得るため、安定した turn-key の初出順で採番する
			const turnKey =
				keyedNode.getAttribute("data-turn-key") || `order-${order}`;
			let keyOrder = keyedTurnOrders.get(records);
			if (!keyOrder) {
				keyOrder = new Map();
				keyedTurnOrders.set(records, keyOrder);
			}
			if (!keyOrder.has(turnKey)) keyOrder.set(turnKey, keyOrder.size);
			const base = keyOrder.get(turnKey);

			const units = Array.from(
				keyedNode.querySelectorAll(CHATGPT_SELECTORS.keyedUnit),
			);
			const unitsOf = (kind) =>
				units.filter((unit) =>
					unit
						.getAttribute("data-chatgpt-search-unit-key")
						.endsWith(`:${kind}`),
				);
			const userUnit = unitsOf("user")[0];
			if (userUnit) {
				const userNode =
					userUnit.querySelector(CHATGPT_SELECTORS.keyedUserBubble) || userUnit;
				const userText = getVisibleText(userNode);
				if (userText) {
					const record = records.get(base * 2) || { index: base * 2 };
					record.role = "user";
					record.user = userText;
					const messageId = (
						userUnit.getAttribute("data-chatgpt-search-message-ids") || ""
					)
						.split(/\s+/)
						.find(Boolean);
					if (messageId) record.userMessageId = messageId;
					records.set(base * 2, record);
				}
			}

			const assistantUnits = unitsOf("assistant");
			const assistantUnit = assistantUnits[assistantUnits.length - 1];
			if (assistantUnit) {
				const { modelText, modelHtmlStr } = extractChatGptModel(assistantUnit);
				if (modelText || modelHtmlStr) {
					const record = records.get(base * 2 + 1) || {
						index: base * 2 + 1,
					};
					record.role = "assistant";
					record.model = modelText;
					record.modelHtml = modelHtmlStr;
					const messageId = (
						assistantUnit.getAttribute("data-chatgpt-search-message-ids") || ""
					)
						.split(/\s+/)
						.find(Boolean);
					if (messageId) record.assistantMessageId = messageId;
					records.set(base * 2 + 1, record);
				}
			}
		});
	}

	function captureChatGptVisibleTurns(records) {
		captureChatGptKeyedTurns(records);
		const turnNodes = Array.from(
			getChatGptQueryScope().querySelectorAll(CHATGPT_SELECTORS.turn),
		);

		for (const turnNode of turnNodes) {
			const index = getChatGptTurnIndex(turnNode);
			if (!Number.isInteger(index)) continue;

			const role = turnNode.getAttribute("data-turn");
			const record = records.get(index) || { index };
			if (role === "user") {
				const userNode =
					turnNode.querySelector(CHATGPT_SELECTORS.userMessage) || turnNode;
				const userText = getVisibleText(userNode);
				if (userText) {
					record.role = "user";
					record.user = userText;
					const messageId = userNode.getAttribute("data-message-id");
					if (messageId) {
						record.userMessageId = messageId;
					}
				}
			} else if (role === "assistant") {
				const assistantNodes = Array.from(
					turnNode.querySelectorAll(CHATGPT_SELECTORS.assistantMessage),
				);
				const responseNode =
					assistantNodes[assistantNodes.length - 1] ||
					turnNode.querySelector(CHATGPT_SELECTORS.assistantMessage) ||
					turnNode;
				const { modelText, modelHtmlStr } = extractChatGptModel(responseNode);
				if (modelText || modelHtmlStr) {
					record.role = "assistant";
					record.model = modelText;
					record.modelHtml = modelHtmlStr;
					if (responseNode) {
						const messageId = responseNode.getAttribute("data-message-id");
						if (messageId) {
							record.assistantMessageId = messageId;
						}
						const modelSlug = responseNode.getAttribute(
							"data-message-model-slug",
						);
						if (modelSlug) {
							record.modelSlug = modelSlug;
						}
					}
				}
			}
			if (record.role) {
				records.set(index, record);
			}
		}
	}

	function buildChatGptTurnRecords(records = new Map()) {
		captureChatGptVisibleTurns(records);

		const ordered = Array.from(records.values()).sort(
			(a, b) => a.index - b.index,
		);
		const turns = [];
		let pendingUser = null;

		for (const record of ordered) {
			if (record.role === "user") {
				pendingUser = record.user ? record : null;
				continue;
			}
			if (record.role !== "assistant" || !pendingUser) {
				continue;
			}
			if (!record.model && !record.modelHtml) {
				continue;
			}
			turns.push({
				user: pendingUser.user,
				userMessageId: pendingUser.userMessageId || "",
				thoughts: "",
				thoughtsHtml: "",
				model: record.model || "",
				modelHtml: record.modelHtml || "",
				assistantMessageId: record.assistantMessageId || "",
				modelSlug: record.modelSlug || "",
			});
			pendingUser = null;
		}

		return turns;
	}

	function isChatGptRootVisible(root) {
		if (root.closest?.("[hidden], [inert], [aria-hidden='true']")) return false;
		return !(Number.isFinite(root.clientHeight) && root.clientHeight <= 0);
	}

	// 取得対象は表示中のスクロール領域の内側だけに限定する
	function getChatGptQueryScope() {
		const root = getChatGptScrollRoot();
		return root?.querySelectorAll &&
			root !== document.documentElement &&
			root !== document.scrollingElement
			? root
			: document;
	}

	function getChatGptScrollRoot() {
		const roots = Array.from(
			document.querySelectorAll(
				`${CHATGPT_SELECTORS.scrollRoot}, ${CHATGPT_SELECTORS.keyedScrollRoot}`,
			),
		);
		if (roots.length > 0) {
			// 前の会話のDOMが非表示で残る場合があるため、表示中のものを優先する
			return roots.find(isChatGptRootVisible) || roots[0];
		}
		return document.scrollingElement || document.documentElement || null;
	}

	function getScrollTop(root) {
		return Number.isFinite(root?.scrollTop) ? root.scrollTop : 0;
	}

	function getScrollHeight(root) {
		return Number.isFinite(root?.scrollHeight) ? root.scrollHeight : 0;
	}

	function getClientHeight(root) {
		return Number.isFinite(root?.clientHeight) ? root.clientHeight : 0;
	}

	function setScrollTop(root, top) {
		if (!root) return;
		if (typeof root.scrollTo === "function") {
			root.scrollTo({ top, behavior: "instant" });
			return;
		}
		if ("scrollTop" in root) {
			root.scrollTop = top;
		}
	}

	async function collectChatGptTurnRecords({ scroll = true } = {}) {
		const records = new Map();

		const scrollRoot = getChatGptScrollRoot();
		const scrollHeight = getScrollHeight(scrollRoot);
		const clientHeight = getClientHeight(scrollRoot);
		console.debug("[Chat Export] chatgpt scroll root", {
			scroll,
			tag: scrollRoot?.tagName,
			scrollHeight,
			clientHeight,
		});
		if (
			!scroll ||
			!scrollRoot ||
			scrollHeight <= clientHeight ||
			clientHeight <= 0
		) {
			captureChatGptVisibleTurns(records);
			return buildChatGptTurnRecords(records);
		}

		// 初出順で採番するため、先頭へ戻ってから上→下の順に収集する
		const originalTop = getScrollTop(scrollRoot);
		const step = Math.max(320, Math.floor(clientHeight * 0.8));
		try {
			// 仮想リストの高さ再計測で位置が戻されることがあるため、先頭で安定するまで繰り返す
			for (let i = 0; i < 30; i += 1) {
				setScrollTop(scrollRoot, 0);
				await sleep(150);
				if (getScrollTop(scrollRoot) <= 1) break;
			}
			await sleep(150);
			captureChatGptVisibleTurns(records);

			let stalled = 0;
			for (let i = 0; i < 400; i += 1) {
				const currentTop = getScrollTop(scrollRoot);
				const maxTop =
					getScrollHeight(scrollRoot) - getClientHeight(scrollRoot);
				if (currentTop >= maxTop - 2) break;
				setScrollTop(scrollRoot, Math.min(currentTop + step, maxTop));
				await sleep(150);
				captureChatGptVisibleTurns(records);
				// 位置が進まない状態が続いたら打ち切る
				stalled = getScrollTop(scrollRoot) > currentTop + 1 ? 0 : stalled + 1;
				if (stalled >= 5) break;
			}
		} finally {
			setScrollTop(scrollRoot, originalTop);
		}

		return buildChatGptTurnRecords(records);
	}

	function pickConversations(scope, turnIndex) {
		if (SITE !== "gemini") return [];
		const nodes = Array.from(document.querySelectorAll(SELECTORS.conversation));
		if (nodes.length === 0) return [];
		if (scope === "current") return [nodes[nodes.length - 1]];
		if (scope === "select" && Number.isInteger(turnIndex)) {
			const picked = nodes[turnIndex];
			return picked ? [picked] : [];
		}
		return nodes;
	}

	const SITE_LABELS = {
		claude: "Claude",
		chatgpt: "ChatGPT",
		gemini: "Gemini",
	};

	function getModelLabel() {
		return SITE_LABELS[SITE] ?? "Gemini";
	}

	function getChatTitle(date) {
		const modelLabel = getModelLabel();
		const docTitle =
			typeof document !== "undefined" && document.title
				? document.title.trim()
				: "";
		const lowerTitle = docTitle.toLowerCase();
		let baseTitle = "";
		if (
			!docTitle ||
			lowerTitle === "gemini" ||
			lowerTitle === "claude" ||
			lowerTitle === "chatgpt" ||
			lowerTitle === "new chat" ||
			lowerTitle === "新しいチャット"
		) {
			baseTitle = `${modelLabel} Export`;
		} else {
			baseTitle = docTitle
				.replace(/\s*-\s*Gemini$/i, "")
				.replace(/\s*-\s*Claude$/i, "")
				.replace(/\s*-\s*ChatGPT$/i, "")
				.trim();
		}
		const d = date || new Date();
		const pad = (n) => String(n).padStart(2, "0");
		const timeStr = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
		return `${baseTitle} (${timeStr})`;
	}

	function buildHtml(turns, includeThoughts) {
		const modelLabel = getModelLabel();
		const title = getChatTitle(new Date());
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
					`    <h3>${modelLabel}</h3>`,
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
			`<title>${title}</title>`,
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

	function buildTurnHeadingStyleMarkdown(turns, includeThoughts) {
		const modelLabel = getModelLabel();
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

			lines.push("", `### ${modelLabel}`, "", turn.model || "");
		});
		return lines.join("\n").trim();
	}

	function buildLegacyStyleMarkdown(turns, includeThoughts) {
		const modelLabel = getModelLabel();
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

			lines.push(
				"",
				`## Turn ${index + 1}-2: ${modelLabel}`,
				"",
				turn.model || "",
			);
		});
		return lines.join("\n").trim();
	}

	function buildMarkdown(turns, markdownStyle, includeThoughts) {
		if (markdownStyle === "legacy") {
			return buildLegacyStyleMarkdown(turns, includeThoughts);
		}
		return buildTurnHeadingStyleMarkdown(turns, includeThoughts);
	}

	function generateMessageId() {
		if (
			typeof crypto !== "undefined" &&
			typeof crypto.randomUUID === "function"
		) {
			return crypto.randomUUID();
		}
		return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
			const r = (Math.random() * 16) | 0;
			const v = c === "x" ? r : (r & 0x3) | 0x8;
			return v.toString(16);
		});
	}

	function toTomlValue(str) {
		if (typeof str !== "string") return '""';
		if (str.includes("\n")) {
			let escaped = "";
			for (let i = 0; i < str.length; i += 1) {
				const char = str[i];
				const code = char.charCodeAt(0);
				if (char === "\\") {
					escaped += "\\\\";
				} else if (char === '"') {
					escaped += '\\"';
				} else if (
					code < 0x20 &&
					char !== "\n" &&
					char !== "\r" &&
					char !== "\t"
				) {
					escaped += `\\u${code.toString(16).padStart(4, "0")}`;
				} else {
					escaped += char;
				}
			}
			return `"""\n${escaped}"""`;
		}
		return JSON.stringify(str);
	}

	function buildToml(turns, includeThoughts) {
		const now = new Date();
		const title = getChatTitle(now);

		let modelsUsed = null;
		if (
			SITE === "claude" &&
			typeof document !== "undefined" &&
			typeof document.querySelector === "function"
		) {
			const dropdown = document.querySelector(
				'[data-testid="model-selector-dropdown"]',
			);
			const label = dropdown ? dropdown.getAttribute("aria-label") : null;
			if (label) {
				const match = label.match(/^(?:モデル|Model):\s*(.*)$/i);
				const modelName = match ? match[1].trim() : label.trim();
				if (modelName) {
					modelsUsed = [modelName];
				}
			}
		} else if (SITE === "gemini") {
			modelsUsed = ["Gemini"];
		}

		const sessionMetadata = {
			message_count: turns.length * 2,
		};
		if (modelsUsed) {
			sessionMetadata.models_used = modelsUsed;
		}

		const messages = [];
		let parentId = null;

		turns.forEach((turn) => {
			const userMsgId =
				SITE === "chatgpt" && turn.userMessageId
					? turn.userMessageId
					: generateMessageId();
			const assistantMsgId =
				SITE === "chatgpt" && turn.assistantMessageId
					? turn.assistantMessageId
					: generateMessageId();

			const userMsg = {
				role: "user",
				parts: [
					{
						type: "text",
						text: turn.user || "",
					},
				],
			};
			if (userMsgId) {
				userMsg.id = userMsgId;
			}
			if (parentId) {
				userMsg.parent_chat_message_id = parentId;
			}
			messages.push(userMsg);

			const assistantMsg = {
				role: "assistant",
				parts: [],
			};
			if (assistantMsgId) {
				assistantMsg.id = assistantMsgId;
			}
			if (userMsgId) {
				assistantMsg.parent_chat_message_id = userMsgId;
			}

			if (SITE === "chatgpt" && turn.modelSlug) {
				assistantMsg.generation_request = {
					model: turn.modelSlug,
				};
			}

			if (includeThoughts && turn.thoughts) {
				assistantMsg.parts.push({
					type: "reasoning",
					thinking: turn.thoughts,
				});
			}

			assistantMsg.parts.push({
				type: "text",
				text: turn.model || "",
			});

			messages.push(assistantMsg);

			parentId = assistantMsgId;
		});

		const tomlData = {
			export_info: {
				format_version: "5.0",
				exported_at: now.toISOString(),
			},
			session: {
				title: title,
				metadata: sessionMetadata,
			},
			messages: messages,
		};

		return stringifyToml(tomlData);
	}

	function stringifyToml(data) {
		const lines = [];

		lines.push("[export_info]");
		lines.push(
			`format_version = ${toTomlValue(data.export_info.format_version)}`,
		);
		lines.push(`exported_at = ${toTomlValue(data.export_info.exported_at)}`);
		lines.push("");

		lines.push("[session]");
		lines.push(`title = ${toTomlValue(data.session.title)}`);
		if (data.session.metadata) {
			lines.push("");
			lines.push("[session.metadata]");
			lines.push(`message_count = ${data.session.metadata.message_count}`);
			if (data.session.metadata.models_used) {
				const models = data.session.metadata.models_used
					.map((m) => toTomlValue(m))
					.join(", ");
				lines.push(`models_used = [${models}]`);
			}
		}
		lines.push("");

		if (data.messages && data.messages.length > 0) {
			data.messages.forEach((msg) => {
				lines.push("[[messages]]");
				if (msg.id) {
					lines.push(`id = ${toTomlValue(msg.id)}`);
				}
				lines.push(`role = ${toTomlValue(msg.role)}`);
				if (msg.parent_chat_message_id) {
					lines.push(
						`parent_chat_message_id = ${toTomlValue(msg.parent_chat_message_id)}`,
					);
				}

				if (msg.generation_request) {
					lines.push("");
					lines.push("[messages.generation_request]");
					lines.push(`model = ${toTomlValue(msg.generation_request.model)}`);
				}

				if (msg.parts && msg.parts.length > 0) {
					msg.parts.forEach((part) => {
						lines.push("");
						lines.push("[[messages.parts]]");
						if (part.id) {
							lines.push(`id = ${toTomlValue(part.id)}`);
						}
						lines.push(`type = ${toTomlValue(part.type)}`);
						if (part.text !== undefined) {
							lines.push(`text = ${toTomlValue(part.text)}`);
						}
						if (part.thinking !== undefined) {
							lines.push(`thinking = ${toTomlValue(part.thinking)}`);
						}
					});
				}
				lines.push("");
			});
		}

		lines.push("[workflow_execution_history]");
		lines.push("entries = []");

		return lines.join("\n");
	}

	function getClaudeThoughtsTimelineNodes(responseNode) {
		return Array.from(
			responseNode.querySelectorAll(CLAUDE_SELECTORS.thoughtsTimelineText),
		).filter(
			(node) =>
				node.querySelectorAll(CLAUDE_SELECTORS.modelMarkdown).length > 0,
		);
	}

	function hasExpandedClaudeThoughts(responseNode) {
		return getClaudeThoughtsTimelineNodes(responseNode).length > 0;
	}

	async function ensureClaudeThoughtsExpanded(responseNode) {
		if (hasExpandedClaudeThoughts(responseNode)) {
			return false;
		}

		const toggleButton = responseNode.querySelector(
			CLAUDE_SELECTORS.thoughtsToggleButton,
		);
		if (!toggleButton || typeof toggleButton.click !== "function") {
			return false;
		}
		if (toggleButton.getAttribute("aria-expanded") === "true") {
			return false;
		}

		toggleButton.click();

		for (let i = 0; i < 10; i += 1) {
			if (hasExpandedClaudeThoughts(responseNode)) {
				return true;
			}
			await sleep(50);
		}

		return false;
	}

	async function restoreClaudeThoughtsState(responseNode, shouldCollapse) {
		if (!shouldCollapse) return;
		const toggleButton = responseNode.querySelector(
			CLAUDE_SELECTORS.thoughtsToggleButton,
		);
		if (!toggleButton || typeof toggleButton.click !== "function") {
			return;
		}
		toggleButton.click();
	}

	function getClaudeThoughts(responseNode) {
		const timelineNodes = getClaudeThoughtsTimelineNodes(responseNode);
		if (timelineNodes.length === 0) return "";

		const chunks = [];
		for (const timelineNode of timelineNodes) {
			const markdownNodes = Array.from(
				timelineNode.querySelectorAll(CLAUDE_SELECTORS.modelMarkdown),
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

	function getClaudeThoughtsHtml(responseNode) {
		const timelineNodes = getClaudeThoughtsTimelineNodes(responseNode);
		if (timelineNodes.length === 0) return "";

		const chunks = [];
		for (const timelineNode of timelineNodes) {
			const markdownNodes = Array.from(
				timelineNode.querySelectorAll(CLAUDE_SELECTORS.modelMarkdown),
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

	function getClaudeModelMarkdownNodes(responseNode) {
		const timelineNodes = getClaudeThoughtsTimelineNodes(responseNode);
		return Array.from(
			responseNode.querySelectorAll(CLAUDE_SELECTORS.modelMarkdown),
		).filter(
			(node) =>
				!timelineNodes.some((timelineNode) => timelineNode.contains(node)),
		);
	}

	async function extractClaude(
		scope,
		turnIndex,
		markdownStyle,
		includeThoughts,
	) {
		const allTurnPairs = buildClaudeTurns();
		let pairs;
		if (scope === "current") {
			pairs =
				allTurnPairs.length > 0 ? [allTurnPairs[allTurnPairs.length - 1]] : [];
		} else if (scope === "select" && Number.isInteger(turnIndex)) {
			const picked = allTurnPairs[turnIndex];
			pairs = picked ? [picked] : [];
		} else {
			pairs = allTurnPairs;
		}

		const turns = [];
		for (const { userNode, responseNode } of pairs) {
			const userText = getVisibleText(userNode);
			let modelText = "";
			let modelHtmlStr = "";
			let thoughtsText = "";
			let thoughtsHtmlStr = "";
			if (responseNode) {
				const shouldRestoreThoughts = includeThoughts
					? await ensureClaudeThoughtsExpanded(responseNode)
					: false;
				try {
					thoughtsText = getClaudeThoughts(responseNode);
					thoughtsHtmlStr = getClaudeThoughtsHtml(responseNode);

					const markdownNodes = getClaudeModelMarkdownNodes(responseNode);
					for (const node of markdownNodes) {
						const text = markdown.extractMarkdownFromNode(node);
						if (text?.trim()) {
							modelText = cleanText(text);
							modelHtmlStr = node.innerHTML.trim();
							break;
						}
					}
					if (!modelText) {
						modelText = cleanText(
							responseNode.innerText || responseNode.textContent || "",
						);
						modelHtmlStr = responseNode.innerHTML.trim();
					}
				} finally {
					await restoreClaudeThoughtsState(responseNode, shouldRestoreThoughts);
				}
			}
			turns.push({
				user: userText,
				thoughts: thoughtsText,
				thoughtsHtml: thoughtsHtmlStr,
				model: modelText,
				modelHtml: modelHtmlStr,
			});
		}

		return {
			turns,
			html: buildHtml(turns, includeThoughts),
			markdown: buildMarkdown(turns, markdownStyle, includeThoughts),
			toml: buildToml(turns, includeThoughts),
		};
	}

	async function extractChatGpt(
		scope,
		turnIndex,
		markdownStyle,
		includeThoughts,
	) {
		const allTurns = await collectChatGptTurnRecords({
			scroll: scope === "all" || scope === "select",
		});
		let turns;
		if (scope === "current") {
			turns = allTurns.length > 0 ? [allTurns[allTurns.length - 1]] : [];
		} else if (scope === "select" && Number.isInteger(turnIndex)) {
			const picked = allTurns[turnIndex];
			turns = picked ? [picked] : [];
		} else {
			turns = allTurns;
		}

		return {
			turns,
			html: buildHtml(turns, includeThoughts),
			markdown: buildMarkdown(turns, markdownStyle, includeThoughts),
			toml: buildToml(turns, includeThoughts),
		};
	}

	async function extract(scope, turnIndex, markdownStyle, includeThoughts) {
		if (SITE === "claude") {
			return extractClaude(scope, turnIndex, markdownStyle, includeThoughts);
		}
		if (SITE === "chatgpt") {
			return extractChatGpt(scope, turnIndex, markdownStyle, includeThoughts);
		}

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
			toml: buildToml(turns, includeThoughts),
		};
	}

	async function buildTurnList({ scroll = false } = {}) {
		if (SITE === "claude") {
			return buildClaudeTurns().map(({ userNode }, index) => {
				const user = getVisibleText(userNode);
				const hint = user ? user.slice(0, 20) : "(no text)";
				return { index, label: `${index + 1}. ${hint}` };
			});
		}
		if (SITE === "chatgpt") {
			const turns = await collectChatGptTurnRecords({ scroll });
			return turns.map((turn, index) => {
				const user = turn.user;
				const hint = user ? user.slice(0, 20) : "(no text)";
				return { index, label: `${index + 1}. ${hint}` };
			});
		}
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
		if (!message?.type) return;
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
				buildTurnList({ scroll: message.scroll === true })
					.then((turns) => {
						sendResponse({ ok: true, data: { turns } });
					})
					.catch((error) => {
						sendResponse({ ok: false, error: String(error) });
					});
				return true;
			}
		} catch (error) {
			sendResponse({ ok: false, error: String(error) });
		}
		return true;
	});
})();
