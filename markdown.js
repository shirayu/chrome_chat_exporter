(() => {
	const NODE_TEXT = typeof Node !== "undefined" ? Node.TEXT_NODE : 3;
	const NODE_ELEMENT = typeof Node !== "undefined" ? Node.ELEMENT_NODE : 1;

	function extractMarkdownFromNode(node) {
		const clone = node.cloneNode(true);

		const hasClass = (element, className) => {
			if (!element || !className) return false;
			if (element.classList?.contains) {
				return element.classList.contains(className);
			}
			const classAttr = element.getAttribute?.("class");
			if (!classAttr) return false;
			return classAttr.split(/\s+/).includes(className);
		};

		const removeNode = (element) => {
			if (!element) return;
			if (typeof element.remove === "function") {
				element.remove();
				return;
			}
			const parent = element.parentNode;
			if (!parent) return;
			if (typeof parent.removeChild === "function") {
				parent.removeChild(element);
				return;
			}
			if (Array.isArray(parent.childNodes)) {
				const index = parent.childNodes.indexOf(element);
				if (index !== -1) {
					parent.childNodes.splice(index, 1);
				}
			}
		};

		const isMessageActionElement = (element) => {
			if (element.tagName?.toLowerCase() === "button") return true;
			if (element.getAttribute?.("hide-from-message-actions") !== null) {
				return true;
			}
			return hasClass(element, "table-footer");
		};

		const collectActionNodes = (element, collected) => {
			if (!element || element.nodeType !== NODE_ELEMENT) return;
			if (isMessageActionElement(element)) {
				collected.push(element);
				return;
			}
			const children = Array.from(element.childNodes || []);
			children.forEach((child) => {
				collectActionNodes(child, collected);
			});
		};

		const actionNodes = [];
		collectActionNodes(clone, actionNodes);
		actionNodes.forEach((element) => {
			removeNode(element);
		});

		const extractTex = (element) => {
			const direct = element.getAttribute("data-math");
			if (direct) return direct;
			const annotation = element.querySelector(
				"annotation[encoding='application/x-tex']",
			);
			if (!annotation) return "";
			return (annotation.textContent || "").trim();
		};
		const blockMathNodes = Array.from(
			clone.querySelectorAll(".math-block[data-math]"),
		);
		const blockMathFallbackNodes = Array.from(
			clone.querySelectorAll(".math-block:not([data-math])"),
		);
		[...blockMathNodes, ...blockMathFallbackNodes].forEach((el) => {
			const tex = extractTex(el);
			if (!tex) return;
			const text = `$$\n${tex}\n$$`;
			const raw = document.createElement("span");
			raw.setAttribute("data-md-raw", text);
			raw.textContent = text;
			el.replaceWith(raw);
		});

		const inlineMathNodes = Array.from(
			clone.querySelectorAll(".math-inline[data-math]"),
		);
		const inlineMathFallbackNodes = Array.from(
			clone.querySelectorAll(".math-inline:not([data-math])"),
		);
		[...inlineMathNodes, ...inlineMathFallbackNodes].forEach((el) => {
			const tex = extractTex(el);
			if (!tex) return;
			const text = `$${tex}$`;
			const raw = document.createElement("span");
			raw.setAttribute("data-md-raw", text);
			raw.textContent = text;
			el.replaceWith(raw);
		});

		const markdown = htmlToMarkdown(clone).replace(/\n{3,}/g, "\n\n");
		return markdown.trim();
	}

	function htmlToMarkdown(root) {
		const lines = [];

		function escapeTableCell(text) {
			return text.replace(/\|/g, "\\|");
		}

		function appendBlankLine() {
			if (lines.length === 0) return;
			if (lines[lines.length - 1] !== "") {
				lines.push("");
			}
		}

		function escapeMarkdownText(text, context) {
			if (context?.allowMarkdown) return text;
			return text.replace(/[\\`*_]/g, "\\$&");
		}

		function textFrom(node) {
			const raw = node.nodeValue || "";
			return raw.replace(/\s+/g, " ");
		}

		function appendLine(text) {
			if (text === "") {
				appendBlankLine();
				return;
			}
			if (!text) return;
			lines.push(text);
		}

		function renderNode(node, context) {
			if (!node) return "";
			if (node.nodeType === NODE_TEXT) {
				return escapeMarkdownText(textFrom(node), context);
			}
			if (node.nodeType !== NODE_ELEMENT) return "";

			const tag = node.tagName.toLowerCase();
			const rawValue = node.getAttribute("data-md-raw");
			if (rawValue) return rawValue;
			const childText = () =>
				Array.from(node.childNodes)
					.map((child) => renderNode(child, context))
					.join("");

			switch (tag) {
				case "br":
					return "\n";
				case "p": {
					const rawText = node.textContent || "";
					const allowMarkdown = /(\*\*|__|~~|`)/.test(rawText);

					// Check if paragraph contains only bold text (likely a heading)
					const isBoldOnly =
						node.childNodes.length === 1 &&
						(node.childNodes[0].tagName?.toLowerCase() === "b" ||
							node.childNodes[0].tagName?.toLowerCase() === "strong");

					const content = Array.from(node.childNodes)
						.map((child) => renderInline(child, { ...context, allowMarkdown }))
						.join("")
						.trim();

					// If bold-only and reasonably short, treat as h3
					if (isBoldOnly && content.length > 0 && content.length < 200) {
						const headingText = content.replace(/^\*\*|\*\*$/g, "");
						appendLine(`### ${headingText}`);
						appendLine("");
						return "";
					}

					appendLine(content);
					appendLine("");
					return "";
				}
				case "div": {
					Array.from(node.childNodes).forEach((child) => {
						const rendered = renderNode(child, context);
						if (rendered) appendLine(rendered);
					});
					return "";
				}
				case "b":
				case "strong":
					return `**${childText()}**`;
				case "i":
				case "em":
					return `*${childText()}*`;
				case "code": {
					if (context.inPre) return node.textContent || "";
					const codeText = (node.textContent || "").replace(/`/g, "\\`");
					return `\`${codeText}\``;
				}
				case "pre": {
					const code = node.textContent || "";
					appendLine("```");
					appendLine(code.replace(/\n$/, ""));
					appendLine("```");
					appendLine("");
					return "";
				}
				case "h1":
				case "h2":
				case "h3":
				case "h4":
				case "h5":
				case "h6": {
					const level = Number(tag.slice(1));
					const content = childText().trim();
					appendLine(`${"#".repeat(level)} ${content}`);
					appendLine("");
					return "";
				}
				case "ul":
				case "ol": {
					const ordered = tag === "ol";
					const items = Array.from(node.children).filter(
						(child) => child.tagName && child.tagName.toLowerCase() === "li",
					);
					items.forEach((item, index) => {
						const itemText = renderListItem(item, context, ordered, index);
						lines.push(itemText);
					});
					appendLine("");
					return "";
				}
				case "li":
					return childText();
				case "table": {
					const tableLines = renderTable(node, context);
					tableLines.forEach((line) => {
						lines.push(line);
					});
					appendLine("");
					return "";
				}
				case "blockquote": {
					const blockTags = new Set([
						"p",
						"div",
						"ul",
						"ol",
						"pre",
						"h1",
						"h2",
						"h3",
						"h4",
						"h5",
						"h6",
						"table",
						"blockquote",
						"hr",
					]);
					const hasBlockChild = Array.from(node.children).some((child) =>
						blockTags.has(child.tagName.toLowerCase()),
					);

					let inner = "";
					if (hasBlockChild) {
						const wrapper = document.createElement("div");
						Array.from(node.childNodes).forEach((child) => {
							wrapper.appendChild(child.cloneNode(true));
						});
						inner = htmlToMarkdown(wrapper);
					} else {
						const rawText = node.textContent || "";
						const allowMarkdown = /(\*\*|__|~~|`)/.test(rawText);
						inner = Array.from(node.childNodes)
							.map((child) =>
								renderInline(child, {
									...context,
									inlineBreak: "newline",
									allowMarkdown,
								}),
							)
							.join("")
							.trim();
					}

					if (!inner) return "";
					const content = inner
						.split("\n")
						.map((line) => (line.length === 0 ? ">" : `> ${line}`))
						.join("\n");
					appendLine(content);
					appendLine("");
					return "";
				}
				case "hr":
					appendLine("---");
					appendLine("");
					return "";
				case "a": {
					const href = node.getAttribute("href") || "";
					const text = childText().trim() || href;
					return href ? `[${text}](${href})` : text;
				}
				case "img": {
					const alt = node.getAttribute("alt") || "";
					const src = node.getAttribute("src") || "";
					return src ? `![${alt}](${src})` : "";
				}
				default:
					return childText();
			}
		}

		function renderInline(node, context) {
			if (!node) return "";
			if (node.nodeType === NODE_TEXT) {
				return escapeMarkdownText(textFrom(node), context);
			}
			if (node.nodeType !== NODE_ELEMENT) return "";

			const tag = node.tagName.toLowerCase();
			const rawValue = node.getAttribute("data-md-raw");
			if (rawValue) return rawValue;
			const childText = () =>
				Array.from(node.childNodes)
					.map((child) => renderInline(child, context))
					.join("");

			switch (tag) {
				case "br":
					return context.inlineBreak === "newline" ? "\n" : "<br>";
				case "b":
				case "strong":
					return `**${childText()}**`;
				case "i":
				case "em":
					return `*${childText()}*`;
				case "code": {
					if (context.inPre) return node.textContent || "";
					const codeText = (node.textContent || "").replace(/`/g, "\\`");
					return `\`${codeText}\``;
				}
				case "a": {
					const href = node.getAttribute("href") || "";
					const text = childText().trim() || href;
					return href ? `[${text}](${href})` : text;
				}
				case "img": {
					const alt = node.getAttribute("alt") || "";
					const src = node.getAttribute("src") || "";
					return src ? `![${alt}](${src})` : "";
				}
				default:
					return childText();
			}
		}

		function renderTable(table, context) {
			const head = Array.from(table.children).find(
				(child) => child.tagName && child.tagName.toLowerCase() === "thead",
			);
			const body = Array.from(table.children).find(
				(child) => child.tagName && child.tagName.toLowerCase() === "tbody",
			);

			const headRows = head ? collectRows(head, context) : [];
			const bodyRows = body
				? collectRows(body, context)
				: collectRows(table, context);

			let header = headRows[0];
			let rows = bodyRows;
			if (!header && bodyRows.length > 0) {
				header = bodyRows[0];
				rows = bodyRows.slice(1);
			}

			const columnCount = header ? header.length : 0;
			const normalizedHeader =
				header && columnCount > 0 ? header : new Array(columnCount).fill("");

			const lines = [];
			if (normalizedHeader && normalizedHeader.length > 0) {
				lines.push(`| ${normalizedHeader.join(" | ")} |`);
				lines.push(`| ${normalizedHeader.map(() => "---").join(" | ")} |`);
			}

			rows.forEach((row) => {
				const cells = row.slice(0, columnCount);
				while (cells.length < columnCount) cells.push("");
				lines.push(`| ${cells.join(" | ")} |`);
			});

			return lines;
		}

		function collectRows(section, context) {
			const rows = Array.from(section.children).filter(
				(child) => child.tagName && child.tagName.toLowerCase() === "tr",
			);
			const collected = [];
			rows.forEach((row) => {
				const cells = Array.from(row.children).filter((cell) => {
					if (!cell.tagName) return false;
					const name = cell.tagName.toLowerCase();
					return name === "td" || name === "th";
				});
				if (cells.length === 0) return;
				collected.push(
					cells.map((cell) =>
						escapeTableCell(renderInline(cell, context).trim()),
					),
				);
			});
			return collected;
		}

		function renderListItem(node, context, ordered, index) {
			const marker = ordered ? `${index + 1}. ` : "- ";
			const raw = Array.from(node.childNodes)
				.map((child) =>
					renderInline(child, {
						...context,
						inList: true,
						inlineBreak: "newline",
					}),
				)
				.join("")
				.trim();
			const linesInItem = raw.split("\n").filter((line) => line.length > 0);
			if (linesInItem.length === 0) return `${marker}`.trimEnd();
			const [first, ...rest] = linesInItem;
			const indent = " ".repeat(marker.length);
			return [marker + first, ...rest.map((line) => indent + line)].join("\n");
		}

		const rootResult = renderNode(root, { inPre: false, inList: false });
		if (rootResult) {
			appendLine(rootResult);
		}
		return lines.join("\n").trim();
	}

	if (typeof window !== "undefined") {
		window.__geminiMarkdown = {
			extractMarkdownFromNode,
			htmlToMarkdown,
		};
	}

	if (typeof module !== "undefined" && module.exports) {
		module.exports = { extractMarkdownFromNode, htmlToMarkdown };
	}
})();
