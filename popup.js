const statusEl = document.getElementById("status");
const exportClipboardBtn = document.getElementById("export-clipboard");
const exportDownloadBtn = document.getElementById("export-download");
const turnSelectRow = document.getElementById("turn-select-row");
const turnSelect = document.getElementById("turn-select");
const autoCloseCheckbox = document.getElementById("auto-close");
const includeThoughtsCheckbox = document.getElementById("include-thoughts");
const filenameFormatInput = document.getElementById("filename-format");
const MARKDOWN_STYLE_STORAGE_KEY = "markdownStyle";
const AUTO_CLOSE_STORAGE_KEY = "autoCloseOnComplete";
const INCLUDE_THOUGHTS_STORAGE_KEY = "includeThoughts";
const FILENAME_FORMAT_STORAGE_KEY = "filenameFormat";
const DEFAULT_FILENAME_FORMAT = "{date}_{time}-{toolname}";

const SUPPORTED_SITES = [
	{ prefix: "https://gemini.google.com/", toolname: "gemini" },
	{ prefix: "https://claude.ai/", toolname: "claude" },
	{ prefix: "https://chatgpt.com/", toolname: "chatgpt" },
];

function applyI18n() {
	document.querySelectorAll("[data-i18n]").forEach((el) => {
		const key = el.getAttribute("data-i18n");
		if (!key) return;
		const message = chrome.i18n.getMessage(key);
		if (message) {
			el.textContent = message;
		}
	});
}

function getScope() {
	const selected = document.querySelector("input[name=scope]:checked");
	return selected ? selected.value : "current";
}

function getSelectedTurnIndex() {
	const value = turnSelect.value;
	return value ? Number.parseInt(value, 10) : null;
}

function getFormat() {
	const selected = document.querySelector("input[name=format]:checked");
	return selected ? selected.value : "md";
}

function getMarkdownStyle() {
	const selected = document.querySelector("input[name=markdownStyle]:checked");
	return selected ? selected.value : "legacy";
}

async function restoreMarkdownStyle() {
	try {
		const stored = await chrome.storage.local.get(MARKDOWN_STYLE_STORAGE_KEY);
		const value = stored?.[MARKDOWN_STYLE_STORAGE_KEY];
		if (value !== "gemini" && value !== "legacy") return;
		const input = document.querySelector(
			`input[name=markdownStyle][value="${value}"]`,
		);
		if (input) {
			input.checked = true;
		}
	} catch (error) {
		console.error("[Chat Export] failed to restore markdown style", error);
	}
}

async function persistMarkdownStyle() {
	try {
		await chrome.storage.local.set({
			[MARKDOWN_STYLE_STORAGE_KEY]: getMarkdownStyle(),
		});
	} catch (error) {
		console.error("[Chat Export] failed to save markdown style", error);
	}
}

async function restoreAutoCloseSetting() {
	try {
		const stored = await chrome.storage.local.get(AUTO_CLOSE_STORAGE_KEY);
		const value = stored?.[AUTO_CLOSE_STORAGE_KEY];
		if (typeof value !== "boolean") return;
		autoCloseCheckbox.checked = value;
	} catch (error) {
		console.error("[Chat Export] failed to restore auto close setting", error);
	}
}

async function restoreIncludeThoughtsSetting() {
	try {
		const stored = await chrome.storage.local.get(INCLUDE_THOUGHTS_STORAGE_KEY);
		const value = stored?.[INCLUDE_THOUGHTS_STORAGE_KEY];
		if (typeof value !== "boolean") return;
		includeThoughtsCheckbox.checked = value;
	} catch (error) {
		console.error(
			"[Chat Export] failed to restore include thoughts setting",
			error,
		);
	}
}

async function restoreFilenameFormat() {
	try {
		const stored = await chrome.storage.local.get(FILENAME_FORMAT_STORAGE_KEY);
		const value = stored?.[FILENAME_FORMAT_STORAGE_KEY];
		filenameFormatInput.value =
			typeof value === "string" && value.trim()
				? value
				: DEFAULT_FILENAME_FORMAT;
	} catch (error) {
		console.error("[Chat Export] failed to restore filename format", error);
		filenameFormatInput.value = DEFAULT_FILENAME_FORMAT;
	}
}

async function persistFilenameFormat() {
	try {
		await chrome.storage.local.set({
			[FILENAME_FORMAT_STORAGE_KEY]:
				filenameFormatInput.value || DEFAULT_FILENAME_FORMAT,
		});
	} catch (error) {
		console.error("[Chat Export] failed to save filename format", error);
	}
}

function buildFilename(toolname, scope, extension) {
	const now = new Date();
	const pad = (n) => String(n).padStart(2, "0");
	const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
	const time = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
	const format = filenameFormatInput.value.trim() || DEFAULT_FILENAME_FORMAT;
	const name = format
		.replace(/\{date\}/g, date)
		.replace(/\{time\}/g, time)
		.replace(/\{toolname\}/g, toolname)
		.replace(/\{scope\}/g, scope)
		.replace(/\{ext\}/g, extension);
	const hasExt = format.includes("{ext}");
	return hasExt ? name : `${name}.${extension}`;
}

async function persistAutoCloseSetting() {
	try {
		await chrome.storage.local.set({
			[AUTO_CLOSE_STORAGE_KEY]: autoCloseCheckbox.checked,
		});
	} catch (error) {
		console.error("[Chat Export] failed to save auto close setting", error);
	}
}

async function persistIncludeThoughtsSetting() {
	try {
		await chrome.storage.local.set({
			[INCLUDE_THOUGHTS_STORAGE_KEY]: includeThoughtsCheckbox.checked,
		});
	} catch (error) {
		console.error(
			"[Chat Export] failed to save include thoughts setting",
			error,
		);
	}
}

function closePopupIfEnabled() {
	if (!autoCloseCheckbox.checked) return;
	window.close();
}

async function getActiveTab() {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	return tab;
}

function setStatus(text, isWarn = false) {
	statusEl.textContent = text;
	statusEl.classList.toggle("warn", isWarn);
}

async function ensureContentScript(tabId) {
	try {
		await chrome.scripting.executeScript({
			target: { tabId },
			files: ["content.js"],
		});
		console.debug("[Chat Export] content script injected");
		return true;
	} catch (error) {
		console.error("[Chat Export] content script inject failed", error);
		return false;
	}
}

async function requestExport(format, output) {
	try {
		const tab = await getActiveTab();
		if (!tab?.id) {
			setStatus(chrome.i18n.getMessage("statusNoTab"), true);
			return;
		}

		const request = {
			type: "EXPORT_GEMINI_CHAT",
			scope: getScope(),
			turnIndex: getSelectedTurnIndex(),
			markdownStyle: getMarkdownStyle(),
			includeThoughts: includeThoughtsCheckbox.checked,
		};
		console.debug("[Chat Export] sendMessage payload", request);

		const injected = await ensureContentScript(tab.id);
		if (!injected) {
			setStatus(chrome.i18n.getMessage("statusInjectFailed"), true);
			return;
		}

		const response = await chrome.tabs.sendMessage(tab.id, request);
		console.debug("[Chat Export] response", response);

		if (!response?.ok) {
			if (response?.error) {
				console.error("[Chat Export] content error", response.error);
			}
			setStatus(chrome.i18n.getMessage("statusPageNotReady"), true);
			return;
		}

		const payload = response.data;
		const isHtml = format === "html";
		const data = isHtml ? payload.html : payload.markdown;
		const extension = isHtml ? "html" : "md";
		const blob = new Blob([data], {
			type: isHtml ? "text/html" : "text/markdown",
		});
		const url = URL.createObjectURL(blob);

		const targetOutput = output === "download" ? "download" : "clipboard";
		if (targetOutput === "clipboard") {
			await navigator.clipboard.writeText(data);
			setStatus(chrome.i18n.getMessage("statusCopied"), false);
			closePopupIfEnabled();
			return;
		}

		const scope = getScope();
		const scopeLabel =
			scope === "current" ? "current" : scope === "select" ? "select" : "all";
		const matched = SUPPORTED_SITES.find((s) => tab.url?.startsWith(s.prefix));
		const toolname = matched ? matched.toolname : "chat";
		const filename = buildFilename(toolname, scopeLabel, extension);

		await chrome.downloads.download({ url, filename, saveAs: true });
		setStatus(chrome.i18n.getMessage("statusDownloadStarted"), false);
		closePopupIfEnabled();
	} catch (_error) {
		console.error("[Chat Export] export failed", _error);
		setStatus(chrome.i18n.getMessage("statusExportFailed"), true);
	}
}

async function loadTurnOptions(tabId) {
	try {
		const injected = await ensureContentScript(tabId);
		if (!injected) return;
		const response = await chrome.tabs.sendMessage(tabId, {
			type: "LIST_GEMINI_TURNS",
		});
		if (!response?.ok) return;
		const turns = response.data.turns || [];
		turnSelect.innerHTML = "";
		if (turns.length === 0) {
			const option = document.createElement("option");
			option.value = "";
			option.textContent = chrome.i18n.getMessage("turnListEmpty");
			turnSelect.appendChild(option);
			return;
		}
		turns.forEach((turn) => {
			const option = document.createElement("option");
			option.value = String(turn.index);
			option.textContent = turn.label;
			turnSelect.appendChild(option);
		});
	} catch (error) {
		console.error("[Chat Export] failed to load turn list", error);
	}
}

function toggleTurnSelect() {
	const scope = getScope();
	turnSelectRow.hidden = scope !== "select";
}

document.querySelectorAll("input[name=scope]").forEach((radio) => {
	radio.addEventListener("change", toggleTurnSelect);
});
document.querySelectorAll("input[name=markdownStyle]").forEach((radio) => {
	radio.addEventListener("change", () => {
		persistMarkdownStyle();
	});
});
autoCloseCheckbox.addEventListener("change", () => {
	persistAutoCloseSetting();
});
includeThoughtsCheckbox.addEventListener("change", () => {
	persistIncludeThoughtsSetting();
});
filenameFormatInput.addEventListener("change", () => {
	persistFilenameFormat();
});
filenameFormatInput.addEventListener("blur", () => {
	persistFilenameFormat();
});

exportClipboardBtn.addEventListener("click", () =>
	requestExport(getFormat(), "clipboard"),
);
exportDownloadBtn.addEventListener("click", () =>
	requestExport(getFormat(), "download"),
);

function isSupportedTab(tab) {
	if (!tab || typeof tab.url !== "string") return false;
	return SUPPORTED_SITES.some((s) => tab.url.startsWith(s.prefix));
}

Promise.all([
	restoreMarkdownStyle(),
	restoreAutoCloseSetting(),
	restoreIncludeThoughtsSetting(),
	restoreFilenameFormat(),
	getActiveTab(),
]).then(([, , , , tab]) => {
	applyI18n();
	if (isSupportedTab(tab)) {
		setStatus(chrome.i18n.getMessage("statusReady"), false);
		loadTurnOptions(tab.id);
	} else {
		setStatus(chrome.i18n.getMessage("statusOpenGemini"), true);
	}
	toggleTurnSelect();
});
