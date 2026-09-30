// Runs downloads outside the popup so they survive the popup closing
// (e.g. when the "Save As" dialog steals focus).
function toBase64(text) {
	const bytes = new TextEncoder().encode(text);
	const chunkSize = 0x8000;
	let binary = "";
	for (let i = 0; i < bytes.length; i += chunkSize) {
		binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
	}
	return btoa(binary);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message?.type !== "chat-export-download") return false;
	const { data, mimeType, filename } = message;
	const url = `data:${mimeType};base64,${toBase64(data)}`;
	chrome.downloads
		.download({ url, filename, saveAs: true })
		.then((id) => sendResponse({ ok: true, id }))
		.catch((error) => sendResponse({ ok: false, error: String(error) }));
	return true;
});
