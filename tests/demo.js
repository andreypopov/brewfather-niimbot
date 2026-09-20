(() => {
  if (location.hostname !== "127.0.0.1") throw new Error("Demo must be served locally.");
  const first = {...BrewLabelSample, _id: "demo119"};
  const second = {...BrewLabelSample, _id: "demo118", batchNo: 118, measuredOg: 1.065, measuredFg: 1.010, measuredFgSet: true, measuredAbv: 7.2, estimatedIbu: 30, recipe: {...BrewLabelSample.recipe, name: "PINEAPPLE PUNCH", style: {name: "Fruit Beer"}}};
  let printed = 0, cardClicks = 0;
  for (const card of document.querySelectorAll("bf-batch-card")) card.onclick = () => { cardClicks++; document.getElementById("test-result").textContent = `Card navigation clicks: ${cardClicks}`; };
  // Test doubles are never in the manifest or production content script list.
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
      document.getElementById("test-result").textContent = `Test: ${printed} job; image ${options.size.w_px} × ${options.size.h_px}; copies ${options.copies}; card navigations ${cardClicks}. Physical printing is disabled.`;
    }
  };
})();
