// Runs in Brewfather's page context at document_start. Only recipe IDs and
// public URLs cross the extension boundary; authentication stays in Brewfather.
(function (root, build) {
  const api = build();
  if (typeof module === "object" && module.exports) module.exports = api;
  else api.install(root);
})(globalThis, () => {
  "use strict";
  const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
  const sharePattern = /^[A-Za-z0-9_-]{4,160}$/;
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

  function firstValue(observable, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      let subscription, done = false;
      const finish = (error, value) => {
        if (done) return;
        done = true; clearTimeout(timer); subscription?.unsubscribe();
        error ? reject(error) : resolve(value);
      };
      const timer = setTimeout(() => finish(new Error("Brewfather did not respond. Check your connection and try Add QR again.")), timeoutMs);
      try {
        subscription = observable.subscribe({next: value => finish(null, value), error: error => finish(error)});
        if (done) subscription?.unsubscribe();
      } catch (error) { finish(error); }
    });
  }

  const randomShareId = () => Array.from(crypto.getRandomValues(new Uint8Array(14)), n => "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"[n & 63]).join("");
  async function resolveShare(data, recipeId, {waitMs = 15000, randomId = randomShareId, deadline = Date.now() + 40000, isOnline = () => globalThis.navigator?.onLine !== false} = {}) {
    const remaining = () => {
      const ms = Math.min(waitMs, deadline - Date.now());
      if (ms <= 0) throw new Error("Brewfather took too long to prepare the link. Try Add QR again.");
      return ms;
    };
    if (!idPattern.test(recipeId || "")) throw new Error("Brewfather did not provide a valid recipe ID.");
    const uid = data.userService?.uid();
    if (!uid) throw new Error("Sign in to Brewfather, then try Add QR again.");
    const recipe = await firstValue(data.getRecipe(recipeId), remaining());
    if (!recipe || recipe._id !== recipeId) throw new Error("The recipe was not found in this Brewfather account.");
    const shareId = sharePattern.test(recipe._share || "") ? recipe._share : randomId();
    const shareRef = data.fs.docRef("public", "all", "recipes", shareId);
    // Read the current public mapping too: a copied or revoked token must not
    // turn into a QR code for the wrong recipe.
    const existing = await firstValue(data.fs.doc$(shareRef), remaining());
    if (data.userService.uid() !== uid) throw new Error("The Brewfather account changed. Preview the batch again.");
    if (existing && (existing.uid !== uid || existing.recipeId !== recipeId)) {
      throw new Error("This share link belongs to another recipe. Use Brewfather Share to repair it before adding QR.");
    }
    if (recipe.public === true && existing?.public === true) {
      return {shareUrl: `https://share.brewfather.app/${shareId}`, created: false};
    }
    const app = data.appService, metadata = app?.accountMetadataService;
    if (!metadata?.getAccountMetadata || typeof app.isTrialOnlyUser !== "function") {
      throw new Error("Brewfather sharing is not ready. Reload Brewfather and try Add QR again.");
    }
    const metadataDeadline = Date.now() + remaining();
    while (!metadata.getAccountMetadata() && Date.now() < metadataDeadline) await pause(Math.min(100, Math.max(1, metadataDeadline - Date.now())));
    if (!metadata.getAccountMetadata()) throw new Error("Brewfather is still loading your account. Try Add QR again in a moment.");
    if (app.isTrialOnlyUser()) {
      throw new Error("Brewfather does not allow new share links on a trial plan. An existing shared recipe can still use QR. Turn off Add QR to print this label.");
    }
    if (data.userService.uid() !== uid) throw new Error("The Brewfather account changed. Preview the batch again.");
    if (typeof data.fs.batchSetMerge !== "function" || typeof data.getDoc !== "function") {
      throw new Error("This Brewfather version does not support background sharing. Turn off Add QR to print this label.");
    }
    remaining();
    if (!isOnline()) throw new Error("Brewfather is offline. Reconnect and try Add QR again.");
    // These are the same two records as Brewfather's Share action. Merge only
    // share metadata, atomically, so recipe edits and ingredients stay intact.
    await data.fs.batchSetMerge([
      {ref: data.getDoc("recipes", recipeId), data: {_share: shareId, public: true}},
      {ref: shareRef, data: {uid, recipeId, public: true}}
    ]);
    return {shareUrl: `https://share.brewfather.app/${shareId}`, created: true};
  }

  function captureService(chunks, onService) {
    const wrapped = new WeakSet();
    function wrapChunk(chunk) {
      const modules = chunk?.[1];
      if (!modules || typeof modules !== "object") return;
      for (const [id, factory] of Object.entries(modules)) {
        if (typeof factory !== "function" || wrapped.has(factory)) continue;
        const source = Function.prototype.toString.call(factory);
        if (!source.includes("recipePublic(") || !source.includes("getRecipe(")) continue;
        const replacement = function (module, exports, ...args) {
          const result = Reflect.apply(factory, this, [module, exports, ...args]);
          for (const Service of Object.values(module.exports || exports)) {
            if (!Service?.prototype?.getRecipe || !Service.prototype.recipePublic) continue;
            const provider = Service.ɵprov;
            if (typeof provider?.factory !== "function") continue;
            const original = provider.factory;
            provider.factory = function (...parameters) {
              const instance = Reflect.apply(original, this, parameters);
              onService(instance);
              return instance;
            };
          }
          return result;
        };
        wrapped.add(replacement); modules[id] = replacement;
      }
    }
    chunks.forEach(wrapChunk);
    // Webpack replaces push during startup. Wrap each delegate independently
    // so the bootstrap's reference to the old push cannot recurse into itself.
    const wrapPush = delegate => function (...entries) {
      entries.forEach(wrapChunk);
      return Reflect.apply(delegate, this, entries);
    };
    let push = wrapPush(chunks.push);
    Object.defineProperty(chunks, "push", {configurable: true, get: () => push, set: delegate => { push = wrapPush(delegate); }});
  }

  function install(page) {
    if (page.location.origin !== "https://web.brewfather.app" || page.top !== page) return;
    let service;
    const jobs = new Map();
    captureService(page.webpackChunkapp = page.webpackChunkapp || [], value => { service = value; });
    page.addEventListener("message", event => {
      const request = event.data;
      if (event.source !== page || event.origin !== page.location.origin ||
          request?.source !== "brewfather-niimbot" || request.type !== "share-recipe" ||
          !idPattern.test(request.recipeId || "") || !idPattern.test(request.requestId || "") ||
          !/^\/tabs\/batches(?:\/|$)/.test(page.location.pathname)) return;
      const run = async () => {
        const started = Date.now(), serviceDeadline = started + 12000;
        while (!service && Date.now() < serviceDeadline) await pause(100);
        if (!service) throw new Error("Brewfather sharing is not ready. Reload Brewfather and try Add QR again.");
        let job = jobs.get(request.recipeId);
        if (!job) {
          job = resolveShare(service, request.recipeId, {deadline: started + 40000}).finally(() => jobs.delete(request.recipeId));
          jobs.set(request.recipeId, job);
        }
        return job;
      };
      run().then(result => reply({ok: true, ...result}), error => reply({ok: false, error: friendlyError(error)}));
      function reply(result) {
        page.postMessage({source: "brewfather-niimbot-page", type: "share-result", requestId: request.requestId, recipeId: request.recipeId, ...result}, page.location.origin);
      }
    });
  }
  function friendlyError(error) {
    if (/permission-denied|unauthorized/.test(error?.code || "")) return "Brewfather did not allow recipe sharing. Check your account access, or turn off Add QR to print this label.";
    if (/unavailable|network/.test(error?.code || "")) return "Brewfather is offline. Reconnect and try Add QR again.";
    return error?.message || "Could not prepare the QR code. Try Add QR again.";
  }
  return {firstValue, resolveShare, captureService, install};
});
