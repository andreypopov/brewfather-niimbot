importScripts("label.js", "api.js");

// Keep the API key out of the webpage and out of content-script storage access.
const storageReady = chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"});
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
let indexCache = null;
chrome.storage.onChanged.addListener(() => { indexCache = null; });

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  (async () => {
    await storageReady;
    if (sender.id !== chrome.runtime.id) throw new Error("Unknown message sender.");
    const isOptions = sender.url === chrome.runtime.getURL("options.html");
    const id = BrewLabel.batchId(sender.url);
    // Options are also allowed from the Brewfather lists, so setup is always reachable.
    const isBrewfather = sender.url?.startsWith("https://web.brewfather.app/") && sender.frameId === 0;
    if (!isOptions && !isBrewfather) throw new Error("This page is not supported.");
    if (message.type === "open-options") { await chrome.runtime.openOptionsPage(); return {}; }
    const saved = await chrome.storage.local.get(["credentials", "settings"]);
    if (message.type === "settings") return {settings: BrewLabel.settings(saved.settings), configured: !!(saved.credentials?.userId && saved.credentials?.apiKey)};
    if (message.type === "card") {
      if (!isBrewfather || !/^https:\/\/web\.brewfather\.app\/tabs\/batches(?:[/?#]|$)/.test(sender.url)) throw new Error("Open the Brewfather Batches list.");
      if (!indexCache || Date.now() - indexCache.at > 300000) {
        indexCache = {at: Date.now(), rows: await BrewLabelApi.listBatches(saved.credentials)};
      }
      let target;
      try { target = BrewLabelApi.resolveCard(indexCache.rows, message.batchNo, message.cardTitle); }
      catch {
        indexCache = {at: Date.now(), rows: await BrewLabelApi.listBatches(saved.credentials)};
        target = BrewLabelApi.resolveCard(indexCache.rows, message.batchNo, message.cardTitle);
      }
      const batch = await BrewLabelApi.getBatch(target, saved.credentials);
      if (!BrewLabelApi.matchesCard(batch, message.batchNo, message.cardTitle)) throw new Error("The card data changed. Refresh Brewfather and try again.");
      return {label: BrewLabel.normalize(batch)};
    }
    if (message.type === "batch") {
      if (!isOptions && (!id || id !== message.id)) throw new Error("The batch on the page changed. Start printing again.");
      return {label: BrewLabel.normalize(await BrewLabelApi.getBatch(message.id, saved.credentials))};
    }
    throw new Error("Unknown command.");
  })().then(data => respond({ok: true, ...data}), error => respond({ok: false, error: error.message || "Connection error."}));
  return true;
});
