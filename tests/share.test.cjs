const {test} = require("node:test");
const assert = require("node:assert/strict");
const {firstValue, resolveShare, captureService} = require("../share-page.js");

const observable = value => ({subscribe(observer) { observer.next(value); return {unsubscribe(){}}; }});
function fixture({shared = false, trial = false, metadata = {appEntitlements: ["premium"]}} = {}) {
  const writes = [], recipe = {_id: "recipe119", name: "Citra Pale Ale", public: shared, _share: shared ? "known119" : null};
  const data = {
    userService: {uid: () => "owner"},
    appService: {isTrialOnlyUser: () => trial, accountMetadataService: {getAccountMetadata: () => metadata}},
    getRecipe: () => observable(recipe),
    getDoc: (collection, id) => `users/owner/${collection}/${id}`,
    fs: {
      docRef: (...parts) => parts.join("/"),
      doc$: () => observable(shared ? {uid: "owner", recipeId: "recipe119", public: true} : null),
      batchSetMerge: async rows => writes.push(rows)
    }
  };
  return {data, recipe, writes};
}
const options = {waitMs: 10, randomId: () => "created119"};

test("existing public links are reused without writes or waiting for account metadata", async () => {
  const {data, writes} = fixture({shared: true, trial: true, metadata: null});
  assert.deepEqual(await resolveShare(data, "recipe119", options), {shareUrl: "https://share.brewfather.app/known119", created: false});
  assert.equal(writes.length, 0);
});

test("new links merge only sharing fields and the public mapping in one commit", async () => {
  const {data, writes, recipe} = fixture();
  const before = structuredClone(recipe);
  assert.deepEqual(await resolveShare(data, "recipe119", options), {shareUrl: "https://share.brewfather.app/created119", created: true});
  assert.deepEqual(writes, [[
    {ref: "users/owner/recipes/recipe119", data: {_share: "created119", public: true}},
    {ref: "public/all/recipes/created119", data: {uid: "owner", recipeId: "recipe119", public: true}}
  ]]);
  assert.deepEqual(recipe, before, "The app's recipe object is not mutated or resaved");
});

test("a trial plan is handled without an Upgrade dialog or any write", async () => {
  const {data, writes} = fixture({trial: true});
  await assert.rejects(resolveShare(data, "recipe119", options), /trial plan/);
  assert.equal(writes.length, 0);
});

test("missing account metadata never turns into a premature trial decision", async () => {
  const {data, writes} = fixture({metadata: null});
  data.appService.isTrialOnlyUser = () => { throw new Error("Must wait for account metadata first"); };
  await assert.rejects(resolveShare(data, "recipe119", options), /still loading your account/);
  assert.equal(writes.length, 0);
});

test("sharing waits for loaded entitlements before checking the plan", async () => {
  const {data, writes} = fixture({metadata: null});
  let loaded = false;
  data.appService.accountMetadataService.getAccountMetadata = () => loaded ? {appEntitlements: ["premium"]} : null;
  data.appService.isTrialOnlyUser = () => !loaded;
  setTimeout(() => { loaded = true; }, 5);
  await resolveShare(data, "recipe119", {...options, waitMs: 500});
  assert.equal(writes.length, 1);
});

test("a revoked link is reactivated through the normal plan check", async () => {
  const {data, writes, recipe} = fixture({shared: true});
  recipe.public = false;
  data.fs.doc$ = () => observable(null);
  const result = await resolveShare(data, "recipe119", options);
  assert.equal(result.shareUrl, "https://share.brewfather.app/known119");
  assert.equal(writes.length, 1);
});

test("a share token for a different recipe or owner fails closed", async () => {
  const {data, writes} = fixture({shared: true});
  data.fs.doc$ = () => observable({uid: "someone-else", recipeId: "recipe119", public: true});
  await assert.rejects(resolveShare(data, "recipe119", options), /another recipe/);
  assert.equal(writes.length, 0);
});

test("invalid IDs, mismatched recipes and account changes cannot create links", async () => {
  const {data, writes, recipe} = fixture();
  await assert.rejects(resolveShare(data, "../recipe119", options), /valid recipe ID/);
  recipe._id = "different";
  await assert.rejects(resolveShare(data, "recipe119", options), /not found/);
  recipe._id = "recipe119";
  let reads = 0; data.userService.uid = () => ++reads === 1 ? "owner" : "new-owner";
  await assert.rejects(resolveShare(data, "recipe119", options), /account changed/);
  assert.equal(writes.length, 0);
});

test("an expired request or offline connection cannot queue a new public link", async () => {
  const {data, writes} = fixture();
  await assert.rejects(resolveShare(data, "recipe119", {...options, deadline: Date.now() - 1}), /too long/);
  await assert.rejects(resolveShare(data, "recipe119", {...options, isOnline: () => false}), /offline/);
  assert.equal(writes.length, 0);
});

test("observable readers unsubscribe even if Brewfather responds synchronously", async () => {
  let unsubscribed = 0;
  assert.equal(await firstValue({subscribe(observer) { observer.next("link"); return {unsubscribe(){unsubscribed++;}}; }}), "link");
  assert.equal(unsubscribed, 1);
});

test("service capture survives Webpack startup and preserves the app's factory", () => {
  let captured;
  const chunks = [];
  captureService(chunks, value => { captured = value; });
  function factory(module) {
    class DataService { getRecipe() {} recipePublic() {} }
    DataService.ɵprov = {factory: () => new DataService()};
    module.exports.DataService = DataService;
  }
  chunks.push([[1], {1: factory}]);
  const beforeStartup = chunks[0][1][1];
  const originalPush = chunks.push.bind(chunks);
  chunks.push = function (chunk) { return originalPush(chunk); };
  chunks.push([[2], {2: factory}]);
  for (const wrappedFactory of [beforeStartup, chunks[1][1][2]]) {
    const module = {exports: {}};
    wrappedFactory(module, module.exports);
    const instance = module.exports.DataService.ɵprov.factory();
    assert.equal(captured, instance);
    assert.ok(instance instanceof module.exports.DataService);
  }
  assert.equal(chunks.length, 2);
});
