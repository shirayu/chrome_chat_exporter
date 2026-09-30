// Runs downloads outside the popup so they survive the popup closing
// (e.g. when the "Save As" dialog steals focus).
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message?.type !== "chat-export-download") return false;
	const { data, mimeType, filename } = message;
	const url = `data:${mimeType};charset=utf-8,${encodeURIComponent(data)}`;
	chrome.downloads
		.download({ url, filename, saveAs: true })
		.then((id) => sendResponse({ ok: true, id }))
		.catch((error) => sendResponse({ ok: false, error: String(error) }));
	return true;
});
