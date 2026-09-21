const {test} = require("node:test");
const assert = require("node:assert/strict");
const {readFileSync} = require("node:fs");
const vm = require("node:vm");
const B = require("../label.js");
require("../sample.js");

// Run the production content script, including its real click handlers and RPC
// flow. Only the DOM, Brewfather replies, and physical printer are test doubles.
async function harness({defaultQr = false, apiShareUrl = "", deferShare = false} = {}) {
  class Element {
    constructor() { this.isConnected = true; this.style = {}; this.nodes = new Map(); this.children = []; this.value = "1"; this.textContent = ""; this.classList = {toggle(){}}; }
    querySelector(selector) { if (!this.nodes.has(selector)) this.nodes.set(selector, new Element()); return this.nodes.get(selector); }
    querySelectorAll(selector) { return selector === "button" ? [...this.nodes.values()] : []; }
    attachShadow() { return this.shadowRoot = new Element(); }
    append(child) { this.children.push(child); }
    replaceChildren(...children) { this.children = children; }
    addEventListener() {}
    getClientRects() { return [{}]; }
    closest() { return null; }
  }
  const batch = structuredClone(globalThis.BrewLabelSample);
  batch._id = "batch119"; batch.recipe._id = "recipe119";
  batch.recipe.shareUrl = apiShareUrl;
  let header = new Element(); header.querySelector = () => null;
  let card = new Element();
  card.nodes.set(".batch-title-row", header);
  card.querySelector(".batch-number").textContent = "#119";
  card.querySelector(".recipe-section .item-name .text-content").textContent = "Citra American Pale Ale - 50 L — Andrey";
  const created = [], listeners = [], printed = [], shareRequests = [], shareMessages = [];
  let identifies = 0, disconnects = 0, reads = 0, printerError = null;
  const pageWindow = {
    addEventListener(type, fn) { if (type === "message") listeners.push(fn); },
    postMessage(message) {
      assert.equal(message.type, "share-recipe");
      shareRequests.push(message.recipeId); shareMessages.push(message);
      if (!deferShare) setImmediate(() => deliverShare(message));
    }
  };
  function deliverShare(message, error, origin = "https://web.brewfather.app") {
    listeners.forEach(fn => fn({source: pageWindow, origin, data: {
      source: "brewfather-niimbot-page", type: "share-result", requestId: message.requestId,
      recipeId: message.recipeId, ok: !error, error,
      shareUrl: `https://share.brewfather.app/${message.recipeId}`
    }}));
  }
  const document = {
    body: new Element(), addEventListener(){},
    createElement() { const el = new Element(); created.push(el); return el; },
    querySelectorAll(selector) { return selector === "bf-batch-card" ? [card] : []; }
  };
  const context = vm.createContext({
    document, location: new URL("https://web.brewfather.app/tabs/batches"),
    window: pageWindow, crypto: require("node:crypto").webcrypto, MutationObserver: class { observe(){} },
    requestAnimationFrame: fn => fn(),
    setTimeout: (fn, ms) => { const timer = setTimeout(fn, ms); timer.unref(); return timer; }, clearTimeout,
    navigator: {locks: {request: async (_name, _options, callback) => callback({})}},
    BrewLabel: {...B, render(label, settings) {
      const payload = {label: structuredClone(label), settings: {...settings}};
      return {canvas: {}, output: {toDataURL: () => JSON.stringify(payload)}, size: B.geometry(settings),
        warnings: settings.addQr && !label.shareUrl ? ["Missing QR link"] : []};
    }},
    Niimbot: {
      identify: async () => { identifies++; if (printerError) throw printerError; return {modelId: B.MODEL.id}; },
      disconnect: async () => { disconnects++; },
      printImage: async (payload, options) => printed.push({payload: JSON.parse(payload), options})
    },
    chrome: {runtime: {sendMessage: async message => {
      if (message.type === "settings") return {ok: true, configured: true, settings: {...B.DEFAULTS, addQrDefault: defaultQr}};
      if (message.type === "card") { reads++; return {ok: true, label: B.normalize(structuredClone(batch))}; }
      throw new Error(`Unexpected RPC: ${message.type}`);
    }}}
  });
  vm.runInContext(readFileSync(require.resolve("../content.js"), "utf8"), context);
  const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(setImmediate); };
  await flush();
  const panel = created[0].shadowRoot;
  const click = async selector => { panel.querySelector(selector).onclick({preventDefault(){}}); await flush(); };
  return {
    batch, printed, shareRequests, panel,
    get reads() { return reads; }, get identifies() { return identifies; }, get disconnects() { return disconnects; },
    get status() { return panel.querySelector(".status").textContent; },
    set printerError(value) { printerError = value; },
    async completeShare(index = 0, error = null, origin) { deliverShare(shareMessages[index], error, origin); await flush(); },
    close: () => click(".close"),
    replaceCard({batchNo = 119, cardTitle = "Citra American Pale Ale - 50 L — Andrey"} = {}) {
      header.children[0].isConnected = false;
      header.isConnected = false;
      card.isConnected = false;
      header = new Element(); header.querySelector = () => null;
      card = new Element();
      card.nodes.set(".batch-title-row", header);
      card.querySelector(".batch-number").textContent = `#${batchNo}`;
      card.querySelector(".recipe-section .item-name .text-content").textContent = cardTitle;
    },
    async preview() { header.children[0].shadowRoot.querySelector(".print").onclick({isTrusted: true, preventDefault(){}, stopPropagation(){}}); await flush(); },
    async addQr(value = true) { const input = panel.querySelector(".add-qr"); input.checked = value; input.onchange(); await flush(); },
    print: () => click(".print-now")
  };
}

test("printing twice preserves an automatically created QR link while refreshing batch measurements", async () => {
  const ui = await harness();
  await ui.preview(); await ui.addQr();
  assert.equal(ui.shareRequests.length, 1);
  ui.batch.measuredAbv = 5.1;
  ui.panel.querySelector(".copies").value = "2";
  await ui.print(); await ui.print();
  assert.equal(ui.shareRequests.length, 1, "Print must not open another Share tab");
  assert.equal(ui.printed.length, 2, "Each Print click must reach the printer");
  assert.equal(ui.reads, 3, "Measurements are still refreshed before every print");
  assert.equal(ui.disconnects, 0, "A ready QR link must not disconnect the printer");
  for (const job of ui.printed) {
    assert.equal(job.payload.label.shareUrl, "https://share.brewfather.app/recipe119");
    assert.equal(job.payload.label.metrics.abv.value, 5.1);
    assert.equal(job.options.copies, 2);
    assert.equal(job.payload.settings.addQr, true);
  }
  assert.match(ui.status, /printer confirmed 2 copies/);
});

test("QR by default creates the link once and the first Print click prints", async () => {
  const ui = await harness({defaultQr: true});
  await ui.preview(); await ui.print();
  assert.equal(ui.shareRequests.length, 1);
  assert.equal(ui.printed.length, 1);
});

test("a share URL returned by the fresh API response takes precedence", async () => {
  const ui = await harness();
  await ui.preview(); await ui.addQr();
  ui.batch.recipe.shareUrl = "https://share.brewfather.app/replacement119";
  await ui.print();
  assert.equal(ui.printed[0].payload.label.shareUrl, ui.batch.recipe.shareUrl);
  assert.equal(ui.shareRequests.length, 1);
});

test("a different recipe never inherits the previous recipe's QR link", async () => {
  const ui = await harness();
  await ui.preview(); await ui.addQr();
  ui.batch.recipe._id = "replacementRecipe";
  await ui.print();
  assert.equal(ui.printed.length, 0);
  assert.deepEqual(ui.shareRequests, ["recipe119", "replacementRecipe"]);
  await ui.print();
  assert.equal(ui.printed.length, 1);
  assert.equal(ui.printed[0].payload.label.shareUrl, "https://share.brewfather.app/replacementRecipe");
});

test("a different batch with the same recipe does not inherit a stale preview", async () => {
  const ui = await harness();
  await ui.preview(); await ui.addQr();
  ui.batch._id = "replacementBatch";
  await ui.print();
  assert.equal(ui.printed.length, 0);
  assert.equal(ui.shareRequests.length, 2);
});

test("turning QR off prints without opening Share", async () => {
  const ui = await harness();
  await ui.preview(); await ui.print();
  assert.equal(ui.printed.length, 1);
  assert.equal(ui.shareRequests.length, 0);
  assert.equal(ui.printed[0].payload.settings.addQr, false);
});

test("cancelling printer selection preserves the ready QR for a retry", async () => {
  const ui = await harness();
  await ui.preview(); await ui.addQr();
  ui.printerError = Object.assign(new Error("Cancelled"), {name: "NotFoundError"});
  await ui.print();
  assert.equal(ui.printed.length, 0);
  assert.match(ui.status, /Printer selection was cancelled/);
  ui.printerError = null;
  await ui.print();
  assert.equal(ui.printed.length, 1);
  assert.equal(ui.shareRequests.length, 1);
});

test("a rerendered batch card retains its preview and ready QR link", async () => {
  const ui = await harness();
  await ui.preview(); await ui.addQr();
  ui.replaceCard();
  await ui.print(); await ui.print();
  assert.equal(ui.printed.length, 2);
  assert.equal(ui.shareRequests.length, 1);
  assert.equal(ui.printed[0].payload.label.shareUrl, "https://share.brewfather.app/recipe119");
});

test("a replacement card for another batch cannot take over the preview", async () => {
  const ui = await harness();
  await ui.preview(); await ui.addQr();
  ui.replaceCard({batchNo: 118});
  await ui.print();
  assert.equal(ui.printed.length, 0);
  assert.equal(ui.identifies, 0);
  assert.match(ui.status, /batch card is no longer visible/);
});

test("QR preparation is a loading state and Print waits for it", async () => {
  const ui = await harness({deferShare: true});
  await ui.preview(); await ui.addQr();
  assert.equal(ui.status, "Preparing QR code…");
  assert.equal(ui.panel.querySelector(".print-now").disabled, true);
  assert.doesNotMatch(ui.panel.querySelector(".notes").textContent, /Missing QR/);
  await ui.print();
  assert.equal(ui.identifies, 0);
  await ui.completeShare();
  assert.equal(ui.panel.querySelector(".print-now").disabled, false);
  await ui.print();
  assert.equal(ui.printed.length, 1);
});

test("turning QR off while it loads does not turn it back on", async () => {
  const ui = await harness({deferShare: true});
  await ui.preview(); await ui.addQr(); await ui.addQr(false);
  await ui.completeShare();
  assert.equal(ui.panel.querySelector(".add-qr").checked, false);
  assert.equal(ui.panel.querySelector(".print-now").disabled, false);
  await ui.print();
  assert.equal(ui.printed[0].payload.settings.addQr, false);
});

test("a failed QR request is retryable in the preview and QR-free printing still works", async () => {
  const ui = await harness({deferShare: true});
  await ui.preview(); await ui.addQr();
  await ui.completeShare(0, "Brewfather does not allow new share links on a trial plan.");
  assert.match(ui.status, /trial plan/);
  assert.equal(ui.panel.querySelector(".share-now").hidden, false);
  assert.equal(ui.panel.querySelector(".share-now").disabled, false);
  await ui.addQr(false); await ui.print();
  assert.equal(ui.printed.length, 1);
});

test("a late QR result cannot reopen a closed preview", async () => {
  const ui = await harness({deferShare: true});
  await ui.preview(); await ui.addQr(); await ui.close();
  const status = ui.status;
  await ui.completeShare();
  assert.equal(ui.status, status);
});

test("QR replies from another origin are ignored", async () => {
  const ui = await harness({deferShare: true});
  await ui.preview(); await ui.addQr();
  await ui.completeShare(0, null, "https://example.com");
  assert.equal(ui.status, "Preparing QR code…");
  await ui.completeShare();
  assert.match(ui.status, /QR code ready/);
});
