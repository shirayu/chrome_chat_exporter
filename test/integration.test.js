const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { extractMarkdownFromNode } = require("../markdown.js");

global.Node = {
	TEXT_NODE: 3,
	ELEMENT_NODE: 1,
};

const VOID_TAGS = new Set(["br", "hr", "img", "meta", "input", "link"]);

class ElementNode {
	constructor(tagName, attrs = {}) {
		this.nodeType = global.Node.ELEMENT_NODE;
		this.tagName = tagName.toUpperCase();
		this.attributes = attrs;
		this.childNodes = [];
		this.parentNode = null;
	}

	get children() {
		return this.childNodes.filter(
			(child) => child.nodeType === global.Node.ELEMENT_NODE,
		);
	}

	getAttribute(name) {
		return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
	}

	setAttribute(name, value) {
		this.attributes[name] = value;
	}

	appendChild(node) {
		node.parentNode = this;
		this.childNodes.push(node);
	}

	replaceWith(node) {
		if (!this.parentNode) return;
		const siblings = this.parentNode.childNodes;
		const index = siblings.indexOf(this);
		if (index === -1) return;
		node.parentNode = this.parentNode;
		siblings.splice(index, 1, node);
	}

	cloneNode(deep = false) {
		const clone = new ElementNode(this.tagName, { ...this.attributes });
		if (!deep) return clone;
		this.childNodes.forEach((child) => {
			clone.appendChild(child.cloneNode(true));
		});
		return clone;
	}

	get textContent() {
		return this.childNodes.map((child) => child.textContent || "").join("");
	}

	querySelectorAll(selector) {
		const matches = [];
		const matcher = createSelectorMatcher(selector);
		walk(this, (node) => {
			if (node.nodeType === global.Node.ELEMENT_NODE && matcher(node)) {
				matches.push(node);
			}
		});
		return matches;
	}

	querySelector(selector) {
		const matcher = createSelectorMatcher(selector);
		let found = null;
		walk(this, (node) => {
			if (found) return;
			if (node.nodeType === global.Node.ELEMENT_NODE && matcher(node)) {
				found = node;
			}
		});
		return found;
	}
}

class TextNode {
	constructor(value) {
		this.nodeType = global.Node.TEXT_NODE;
		this.nodeValue = value;
		this.parentNode = null;
	}

	cloneNode() {
		return new TextNode(this.nodeValue);
	}

	get textContent() {
		return this.nodeValue;
	}
}

function walk(node, fn) {
	fn(node);
	if (node.nodeType !== global.Node.ELEMENT_NODE) return;
	node.childNodes.forEach((child) => walk(child, fn));
}

function createSelectorMatcher(selector) {
	if (selector === "annotation[encoding='application/x-tex']") {
		return (node) =>
			node.tagName.toLowerCase() === "annotation" &&
			node.getAttribute("encoding") === "application/x-tex";
	}
	if (selector === ".math-block[data-math]") {
		return (node) =>
			hasClass(node, "math-block") && node.getAttribute("data-math");
	}
	if (selector === ".math-inline[data-math]") {
		return (node) =>
			hasClass(node, "math-inline") && node.getAttribute("data-math");
	}
	if (selector === ".math-block:not([data-math])") {
		return (node) =>
			hasClass(node, "math-block") && !node.getAttribute("data-math");
	}
	if (selector === ".math-inline:not([data-math])") {
		return (node) =>
			hasClass(node, "math-inline") && !node.getAttribute("data-math");
	}
	return () => false;
}

function hasClass(node, className) {
	const value = node.getAttribute("class");
	if (!value) return false;
	return value.split(/\s+/).includes(className);
}

function parseHtml(html) {
	const root = new ElementNode("root");
	const stack = [root];
	const tagRe = /<!--[\s\S]*?-->|<\/?[^>]+>/g;
	let lastIndex = 0;
	let match;

	for (match = tagRe.exec(html); match; match = tagRe.exec(html)) {
		const token = match[0];
		const text = html.slice(lastIndex, match.index);
		if (text && /\S/.test(text)) {
			stack[stack.length - 1].appendChild(new TextNode(text));
		}
		lastIndex = match.index + token.length;

		if (token.startsWith("<!--")) {
			continue;
		}
		if (token.startsWith("</")) {
			const tagName = token.slice(2, -1).trim().toLowerCase();
			while (stack.length > 1) {
				const node = stack.pop();
				if (node.tagName.toLowerCase() === tagName) break;
			}
			continue;
		}

		const selfClosing = token.endsWith("/>");
		const tagContent = token.slice(1, selfClosing ? -2 : -1).trim();
		const [tagName, ...rest] = tagContent.split(/\s+/);
		const attrs = parseAttributes(rest.join(" "));
		const element = new ElementNode(tagName, attrs);
		stack[stack.length - 1].appendChild(element);
		if (!selfClosing && !VOID_TAGS.has(tagName.toLowerCase())) {
			stack.push(element);
		}
	}

	const tail = html.slice(lastIndex);
	if (tail && /\S/.test(tail)) {
		stack[stack.length - 1].appendChild(new TextNode(tail));
	}

	return root;
}

function parseAttributes(input) {
	const attrs = {};
	const attrRe = /(\w[\w:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
	let match;
	for (match = attrRe.exec(input); match; match = attrRe.exec(input)) {
		const name = match[1];
		const value = match[2] ?? match[3] ?? match[4] ?? "";
		attrs[name] = value;
	}
	return attrs;
}

function findByClass(node, className) {
	let found = null;
	walk(node, (current) => {
		if (found) return;
		if (current.nodeType !== global.Node.ELEMENT_NODE) return;
		if (hasClass(current, className)) {
			found = current;
		}
	});
	return found;
}

const documentShim = {
	createElement(tagName) {
		return new ElementNode(tagName, {});
	},
};

global.document = documentShim;

test("2.part.html order is preserved", () => {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-svm-response.html"),
		"utf8",
	);
	const root = parseHtml(html);
	const markdownRoot = findByClass(root, "markdown");
	assert.ok(markdownRoot, "markdown root not found");

	const markdown = extractMarkdownFromNode(markdownRoot);

	const expectedInOrder = [
		"SVM（サポートベクターマシン）は、境界線",
		"その数式的な核心は",
		"---",
		"### 1. 線形モデルの基本形",
		"まず、データを分類する超平面",
		"$$\nf(x) = w^T x + b\n$$",
		"- $w$:",
		"- $b$:",
		"- $x$:",
		"このとき、ラベル $y$ を $1$ または $-1$",
		"$$\ny_i (w^T x_i + b) \\geq 1\n$$",
		"### 2. マージンの最大化",
	];

	let lastIndex = -1;
	expectedInOrder.forEach((snippet) => {
		const index = markdown.indexOf(snippet);
		assert.ok(index !== -1, `missing snippet: ${snippet}`);
		assert.ok(index > lastIndex, `order mismatch for: ${snippet}`);
		lastIndex = index;
	});
});

test("multi-markdown response skips empty markdown elements", () => {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-multi-markdown-minimal.html"),
		"utf8",
	);
	const root = parseHtml(html);

	// Find all markdown elements
	const markdowns = [];
	walk(root, (node) => {
		if (
			node.nodeType === global.Node.ELEMENT_NODE &&
			hasClass(node, "markdown")
		) {
			markdowns.push(node);
		}
	});

	assert.ok(markdowns.length >= 2, "should have multiple markdown elements");

	// First markdown should be empty
	const firstText = extractMarkdownFromNode(markdowns[0]).trim();
	assert.equal(firstText, "", "first markdown should be empty");

	// Find first non-empty markdown
	let nonEmptyMarkdown = null;
	for (const md of markdowns) {
		const text = extractMarkdownFromNode(md).trim();
		if (text) {
			nonEmptyMarkdown = md;
			break;
		}
	}

	assert.ok(nonEmptyMarkdown, "should find non-empty markdown");

	const markdown = extractMarkdownFromNode(nonEmptyMarkdown);

	// Verify it contains expected content (using snippets that exist in the HTML)
	const expectedSnippets = ["Analyzing", "Lecture"];

	expectedSnippets.forEach((snippet) => {
		assert.ok(markdown.includes(snippet), `should contain snippet: ${snippet}`);
	});
});

test("bold-only paragraphs are converted to headings", () => {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-multi-markdown-minimal.html"),
		"utf8",
	);
	const root = parseHtml(html);

	// Find all markdown elements
	const markdowns = [];
	walk(root, (node) => {
		if (
			node.nodeType === global.Node.ELEMENT_NODE &&
			hasClass(node, "markdown")
		) {
			markdowns.push(node);
		}
	});

	// Find first non-empty markdown
	let nonEmptyMarkdown = null;
	for (const md of markdowns) {
		const text = extractMarkdownFromNode(md).trim();
		if (text) {
			nonEmptyMarkdown = md;
			break;
		}
	}

	assert.ok(nonEmptyMarkdown, "should find non-empty markdown");

	const markdown = extractMarkdownFromNode(nonEmptyMarkdown);

	// Verify bold-only paragraphs are converted to ### headings
	assert.ok(
		markdown.includes("### Analyzing the Lecture Series"),
		"should convert bold-only paragraph to heading",
	);
	assert.ok(
		markdown.includes("### Evaluating Appendix Integration"),
		"should convert bold-only paragraph to heading",
	);
});

test("tables are converted to markdown tables", () => {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-multi-markdown-minimal.html"),
		"utf8",
	);
	const root = parseHtml(html);

	// Find all markdown elements
	const markdowns = [];
	walk(root, (node) => {
		if (
			node.nodeType === global.Node.ELEMENT_NODE &&
			hasClass(node, "markdown")
		) {
			markdowns.push(node);
		}
	});

	// Check if any markdown contains a table
	let foundTable = false;
	for (const md of markdowns) {
		const markdown = extractMarkdownFromNode(md);
		if (markdown.includes("|") && markdown.includes("---")) {
			foundTable = true;
			// Verify table structure
			assert.ok(markdown.includes("観点"), "should contain table header");
			assert.ok(
				markdown.includes("第7回 (Uncertainty)"),
				"should contain table content",
			);
			assert.ok(
				markdown.includes("Appendix 2 (Purity)"),
				"should contain table content",
			);
			break;
		}
	}

	assert.ok(foundTable, "should find and convert table to markdown");
});

test("table action buttons are excluded from markdown output", () => {
	const html = fs.readFileSync(
		path.join(__dirname, "fixtures/gemini-table-with-export-button.html"),
		"utf8",
	);
	const root = parseHtml(html);
	const markdownRoot = findByClass(root, "markdown");
	assert.ok(markdownRoot, "markdown root not found");

	const markdown = extractMarkdownFromNode(markdownRoot);

	assert.ok(markdown.includes("需要のタイプ"), "should keep table content");
	assert.ok(
		!markdown.includes("Google スプレッドシートにエクスポート"),
		"should not include export button label",
	);
	assert.ok(
		!markdown.includes("表をコピー"),
		"should not include copy button label",
	);
});
