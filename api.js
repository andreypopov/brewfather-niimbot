(function (root) {
  "use strict";
  async function getBatch(id, credentials, fetchImpl = fetch) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(id || "")) throw new Error("Invalid batch ID.");
    if (!credentials?.userId || !credentials?.apiKey) throw new Error("Open label settings and enter your Brewfather access details.");
    const auth = btoa(`${credentials.userId}:${credentials.apiKey}`);
    const response = await fetchImpl(`https://api.brewfather.app/v2/batches/${id}`, {
      method: "GET", headers: {Authorization: `Basic ${auth}`}, credentials: "omit",
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000)
    });
    if (response.status === 401) throw new Error("Brewfather rejected the User ID or API key. Check the settings.");
    if (response.status === 403) throw new Error("The API key must have the Read Batches permission in Brewfather.");
    if (response.status === 404) throw new Error("The batch was not found in Brewfather.");
    if (response.status === 429) throw new Error("Brewfather API rate limit reached. Try again later; nothing was sent to the printer.");
    if (!response.ok) throw new Error(`Brewfather API returned HTTP ${response.status}.`);
    const batch = await response.json();
    if (batch._id !== id) throw new Error("Brewfather returned a different batch. Printing was stopped.");
    return batch;
  }
  async function listBatches(credentials, fetchImpl = fetch) {
    if (!credentials?.userId || !credentials?.apiKey) throw new Error("Enter your Brewfather access details in label settings.");
    const all = [], seen = new Set();
    let cursor = "";
    for (let page = 0; page < 100; page++) {
      const url = new URL("https://api.brewfather.app/v2/batches");
      url.searchParams.set("limit", "50");
      if (cursor) url.searchParams.set("start_after", cursor);
      const response = await fetchImpl(url.href, {method: "GET", credentials: "omit", redirect: "error", cache: "no-store",
        headers: {Authorization: `Basic ${btoa(`${credentials.userId}:${credentials.apiKey}`)}`}, signal: AbortSignal.timeout(15000)});
      if (!response.ok) throw new Error(`Could not load the batch list: HTTP ${response.status}. Check Read Batches on the API key.`);
      const rows = await response.json();
      if (!Array.isArray(rows)) throw new Error("Brewfather returned an unexpected batch-list format.");
      all.push(...rows);
      if (rows.length < 50) return all;
      cursor = rows.at(-1)?._id;
      if (!cursor || seen.has(cursor)) throw new Error("Brewfather repeated a list page. Printing was stopped.");
      seen.add(cursor);
    }
    throw new Error("The batch list is too large for this extension version.");
  }
  const clean = value => String(value || "").replace(/\s+/g, " ").trim();
  function matchesCard(batch, batchNo, cardTitle) {
    const name = clean(batch.recipe?.name), title = clean(cardTitle);
    return batch.batchNo === batchNo && !!name && (title === name || title.startsWith(name + " — "));
  }
  function resolveCard(rows, batchNo, cardTitle) {
    if (!Number.isInteger(batchNo) || !cardTitle) throw new Error("Could not read the card number and recipe name.");
    const candidates = rows.filter(row => matchesCard(row, batchNo, cardTitle));
    if (candidates.length !== 1) throw new Error(candidates.length ? "Several batches have this number and recipe name. Open the exact batch to print." : "The batch was not found by number and recipe name. Refresh the Brewfather list.");
    return candidates[0]._id;
  }
  root.BrewLabelApi = {getBatch, listBatches, resolveCard, matchesCard};
  if (typeof module !== "undefined" && module.exports) module.exports = root.BrewLabelApi;
})(globalThis);
