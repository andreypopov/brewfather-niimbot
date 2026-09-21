(() => {
  if (location.hostname !== "127.0.0.1") throw new Error("Demo must be served locally.");
  // Deliberately omit shareUrl from every API reply, even after Share succeeds.
  // This reproduces the live Brewfather API behavior that used to block printing.
  const first = {...BrewLabelSample, _id: "demo119", recipe: {...BrewLabelSample.recipe, _id: "recipe119", shareUrl: ""}};
  const second = {...BrewLabelSample, _id: "demo118", batchNo: 118, measuredOg: 1.065, measuredFg: 1.010, measuredFgSet: true, measuredAbv: 7.2, estimatedIbu: 30, recipe: {...BrewLabelSample.recipe, _id: "recipe118", shareUrl: "", name: "PINEAPPLE PUNCH", style: {name: "Fruit Beer"}}};
  let printed = 0, cardClicks = 0, shared = 0;
  for (const card of document.querySelectorAll("bf-batch-card")) card.onclick = () => { cardClicks++; document.getElementById("test-result").textContent = `Card navigation clicks: ${cardClicks}`; };
  // Test doubles are never in the manifest or production content script list.
  window.addEventListener("message", event => {
    const message = event.data;
    if (event.source !== window || event.origin !== location.origin ||
        message?.source !== "brewfather-niimbot" || message.type !== "share-recipe") return;
    shared++;
    setTimeout(() => window.postMessage({source: "brewfather-niimbot-page", type: "share-result",
      requestId: message.requestId, recipeId: message.recipeId, ok: true,
      shareUrl: `https://share.brewfather.app/demo${message.recipeId}`}, location.origin), 300);
  });
  globalThis.chrome = {runtime: {sendMessage: async message => {
    if (message.type === "settings") return {ok: true, configured: true, settings: BrewLabel.DEFAULTS};
    if (message.type === "open-options") { location.href = "/options.html"; return {ok: true}; }
    if (message.type === "card") return {ok: true, label: BrewLabel.normalize(message.batchNo === 119 ? first : second)};
    return {ok: false, error: "Unexpected message"};
  }}};
  globalThis.Niimbot = {
    identify: async () => ({modelId: 528, label: "TEST D11H"}), disconnect: async () => {},
    printImage: async (url, options) => {
      if (!url.startsWith("data:image/png;") || options.size.w_px !== 144 || options.size.h_px !== 472) throw new Error("Wrong print payload");
      await new Promise(resolve => setTimeout(resolve, 700)); printed++;
      document.getElementById("test-result").textContent = `Test: ${printed} jobs; image ${options.size.w_px} × ${options.size.h_px}; copies ${options.copies}; share requests ${shared}; card navigations ${cardClicks}. Physical printing is disabled.`;
    }
  };
})();
