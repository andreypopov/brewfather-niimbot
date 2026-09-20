const {test} = require("node:test");
const assert = require("node:assert/strict");
const B = require("../label.js");
globalThis.qrcode = require("../vendor/qrcode-generator.js");
const A = require("../api.js");
require("../sample.js");
const fixture = () => structuredClone(globalThis.BrewLabelSample);

test("batch metrics override the recipe, missing actual FG makes ABV estimated", () => {
  const label = B.normalize(fixture());
  assert.equal(label.metrics.abv.value, 4.7);
  assert.equal(label.metrics.og.value, 1.046);
  assert.equal(label.metrics.ibu.value, 47);
  assert.equal(label.metrics.abv.estimated, true);
  assert.equal(label.metrics.og.estimated, false);
  assert.equal(label.metrics.fg.estimated, true);
  assert.ok(B.lines(label).some(s => s.includes("FG ≈1.010")));
});
test("final measurements remove estimate markers; explicit unset flags take priority", () => {
  const b = fixture(); b.measuredFg = 1.008; b.measuredFgSet = true; b.measuredAbv = 5.0;
  let l = B.normalize(b);
  assert.equal(l.metrics.fg.estimated, false); assert.equal(l.metrics.abv.estimated, false);
  b.measuredOgSet = false; b.measuredFgSet = false;
  l = B.normalize(b);
  assert.equal(l.metrics.og.value, b.recipe.og); assert.equal(l.metrics.fg.value, 1.010);
  assert.equal(l.metrics.abv.estimated, true);
});
test("zero is a value; null, numeric strings and NaN must not become zero", () => {
  const b = fixture(); b.measuredAbv = 0; b.estimatedIbu = 0;
  assert.equal(B.normalize(b).metrics.abv.value, 0); assert.equal(B.normalize(b).metrics.ibu.value, 0);
  delete b.measuredOg; delete b.recipe.og; b.measuredFg = "1.010"; delete b.estimatedFg; b.recipe.fg = NaN;
  const l = B.normalize(b); assert.equal(l.metrics.og.value, null); assert.equal(l.metrics.fg.value, null);
  assert.ok(B.lines(l).some(s => s.includes("OG —")));
});
test("40 × 14 mm uses the 144-dot head and 472-dot feed axis", () => {
  assert.deepEqual(B.geometry(), {w_px: 144, h_px: 472, dpi: 300, offset_y_px: 0});
  assert.equal(B.geometry({lengthMm: 50, widthMm: 15}).h_px, 591);
  assert.equal(B.geometry({widthMm: 8}).w_px, 94);
  for (const bad of [{copies: 0}, {copies: 1.5}, {density: 6}, {lengthMm: "40"}, {offsetMm: 2}, {widthMm: Infinity}]) assert.throws(() => B.settings(bad));
  assert.equal(B.settings({addQrDefault: true}).addQrDefault, true);
  assert.throws(() => B.settings({addQrDefault: "yes"}));
});
test("recipe share links are accepted only from Brewfather public-share forms", () => {
  assert.equal(B.findSharedRecipeUrl({shareUrl: "https://share.brewfather.app/etWBx3UNaKixBc"}), "https://share.brewfather.app/etWBx3UNaKixBc");
  assert.equal(B.findSharedRecipeUrl({share: {id: "etWBx3UNaKixBc"}}), "https://share.brewfather.app/etWBx3UNaKixBc");
  assert.equal(B.findSharedRecipeUrl({shareUrl: "https://evil.example/etWBx3UNaKixBc", _id: "internal-id"}), "");
  assert.equal(B.normalize({...fixture(), recipe: {...fixture().recipe, shareUrl: "https://web.brewfather.app/share/etWBx3UNaKixBc"}}).shareUrl, "https://web.brewfather.app/share/etWBx3UNaKixBc");
});
test("only Brewfather batch URLs produce a batch ID", () => {
  assert.equal(B.batchId("https://web.brewfather.app/tabs/batches/batch/abc123?foo=bar"), "abc123");
  assert.equal(B.batchId("https://web.brewfather.app/tabs/recipes/recipe/abc123"), null);
  assert.equal(B.batchId("https://evil.example/tabs/batches/batch/abc123"), null);
  assert.equal(B.batchId("https://web.brewfather.app/tabs/batches"), null);
});
test("card resolution uses number AND full recipe name, ambiguity fails closed", () => {
  const row = {...fixture(), _id: "batch119"};
  assert.equal(A.resolveCard([row], 119, "Citra American Pale Ale - 50 L\u00a0—\u00a0Andrey"), "batch119");
  assert.throws(() => A.resolveCard([row], 118, row.recipe.name));
  assert.throws(() => A.resolveCard([row], 119, "Citra"));
  assert.throws(() => A.resolveCard([row, {...row, _id: "duplicate"}], 119, row.recipe.name));
});
test("fetch sends only GET to the fixed API; redirects, HTTP errors, and wrong IDs stop printing", async () => {
  let call;
  const creds = {userId: "test", apiKey: "dummy"};
  const result = await A.getBatch("abc", creds, async (url, options) => {
    call = {url, options}; return {ok: true, json: async () => ({_id: "abc"})};
  });
  assert.equal(result._id, "abc"); assert.equal(call.url, "https://api.brewfather.app/v2/batches/abc");
  assert.equal(call.options.method, "GET"); assert.equal(call.options.redirect, "error");
  assert.equal(call.options.cache, "no-store");
  await assert.rejects(() => A.getBatch("../recipes", creds), /ID/);
  await assert.rejects(() => A.getBatch("abc", creds, async () => ({ok: false, status: 403})), /Read Batches/);
  await assert.rejects(() => A.getBatch("abc", creds, async () => ({ok: true, json: async () => ({_id: "wrong"})})), /different batch/);
});
test("batch listing follows start_after and detects a stuck cursor", async () => {
  const creds = {userId: "test", apiKey: "dummy"};
  const page = Array.from({length: 50}, (_, i) => ({_id: `id${i}`}));
  const urls = [];
  const rows = await A.listBatches(creds, async (url, opts) => {
    urls.push(url); assert.equal(opts.method, "GET");
    return {ok: true, json: async () => urls.length === 1 ? page : [{_id: "last"}]};
  });
  assert.equal(rows.length, 51); assert.ok(urls[1].includes("start_after=id49"));
  await assert.rejects(() => A.listBatches(creds, async () => ({ok: true, json: async () => page})), /repeated/);
});

test("BLE canvas is rotated, without resizing or stretching landscape pixels", () => {
  const calls = [];
  const makeCanvas = () => {
    const context = {fillRect(){}, fillText(){}, measureText: s => ({width: s.length * 8}),
      save(){}, restore(){}, translate: (...v) => calls.push(["translate", ...v]),
      rotate: v => calls.push(["rotate", v]), drawImage: (...v) => calls.push(["drawImage", ...v])};
    return {width: 0, height: 0, getContext: () => context};
  };
  const r = B.render(B.normalize(fixture()), B.DEFAULTS, makeCanvas);
  assert.equal(r.canvas.width, 472); assert.equal(r.canvas.height, 144);
  assert.equal(r.output.width, 144); assert.equal(r.output.height, 472);
  assert.deepEqual(calls.find(c => c[0] === "rotate"), ["rotate", Math.PI / 2]);
  assert.deepEqual(calls.find(c => c[0] === "drawImage").slice(2), [0, 0]);
});
test("QR rendering reserves a square and blocks printing when a share link is missing", () => {
  const makeCanvas = () => {
    const context = {fillRect(){}, fillText(){}, measureText: s => ({width: s.length * 2}),
      save(){}, restore(){}, translate(){}, rotate(){}, drawImage(){}};
    return {width: 0, height: 0, getContext: () => context};
  };
  const withQr = B.render(B.normalize(fixture()), {...B.DEFAULTS, addQr: true}, makeCanvas);
  assert.equal(withQr.warnings.length, 0);
  const missing = fixture(); delete missing.recipe.shareUrl;
  const withoutLink = B.render(B.normalize(missing), {...B.DEFAULTS, addQr: true}, makeCanvas);
  assert.match(withoutLink.warnings[0], /no Brewfather share link/);
});
