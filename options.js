(() => {
  "use strict";
  const B = BrewLabel, $ = id => document.getElementById(id);
  const extension = !!globalThis.chrome?.runtime?.id;
  let preview;
  const keys = ["lengthMm", "widthMm", "copies", "density", "offsetMm"];
  function values() { return B.settings({...Object.fromEntries(keys.map(key => [key, Number($(key).value)])), rotate180: $("rotate180").checked}); }
  function render() {
    try {
      const s = values(); preview = B.render(B.normalize(BrewLabelSample), s);
      $("paper").replaceChildren(preview.canvas); $("paper").style.aspectRatio = String(s.lengthMm / s.widthMm);
      $("dimensions").textContent = `${s.lengthMm} × ${s.widthMm} mm`;
      $("preview-note").textContent = [...B.normalize(BrewLabelSample).warnings, ...preview.warnings].join(" ");
      $("preview-note").classList.remove("error");
    } catch (e) { $("preview-note").textContent = e.message; $("preview-note").classList.add("error"); }
  }
  for (const key of [...keys, "rotate180"]) $(key).addEventListener("input", render);
  $("download").onclick = () => {
    if (!preview) return;
    const a = document.createElement("a"); a.href = preview.canvas.toDataURL("image/png");
    a.download = "brewfather-label-example.png"; a.click();
  };
  $("env-file").onchange = async event => {
    try {
      const file = event.target.files[0]; if (!file) return;
      if (file.size > 32768) throw new Error("The .env.local file should be small.");
      const parsed = {};
      for (const line of (await file.text()).split(/\r?\n/)) {
        const m = line.match(/^\s*(?:export\s+)?(BREWFATHER_USER_ID|BREWFATHER_API_KEY)\s*=\s*(.*?)\s*$/);
        if (m) parsed[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
      }
      if (!parsed.BREWFATHER_USER_ID || !parsed.BREWFATHER_API_KEY) throw new Error("The file must contain BREWFATHER_USER_ID and BREWFATHER_API_KEY.");
      $("userId").value = parsed.BREWFATHER_USER_ID; $("apiKey").value = parsed.BREWFATHER_API_KEY;
      $("save-state").textContent = "Fields filled. Click “Save settings”.";
      $("save-state").classList.remove("error");
    } catch (e) { $("save-state").textContent = e.message; $("save-state").classList.add("error"); }
    event.target.value = "";
  };
  $("settings-form").onsubmit = async event => {
    event.preventDefault(); if (!extension) return;
    try {
      const change = {settings: values()};
      const userId = $("userId").value.trim(), apiKey = $("apiKey").value.trim();
      if (userId || apiKey) {
        if (!userId || !apiKey) throw new Error("Fill in both access fields or load .env.local.");
        if (!/^[\x21-\x7e]+$/.test(userId + apiKey) || userId.includes(":")) throw new Error("Check the API key and User ID format.");
        change.credentials = {userId, apiKey};
      }
      await chrome.storage.local.setAccessLevel({accessLevel: "TRUSTED_CONTEXTS"});
      await chrome.storage.local.set(change);
      $("apiKey").value = ""; $("userId").value = "";
      $("save-state").textContent = "Saved. Return to Batches."; $("save-state").classList.remove("error");
      await credentialState();
    } catch (e) { $("save-state").textContent = e.message; $("save-state").classList.add("error"); }
  };
  async function credentialState() {
    const {credentials} = await chrome.storage.local.get("credentials");
    $("credential-state").textContent = credentials?.apiKey ? "Access is saved. Fill in both fields to replace it. Required permission: Read Batches." : "An API key with Read Batches permission is required.";
  }
  async function init() {
    if (extension) {
      const saved = await chrome.storage.local.get("settings");
      const s = B.settings(saved.settings);
      for (const key of keys) $(key).value = s[key]; $("rotate180").checked = s.rotate180;
      await credentialState();
    } else {
      $("credentials-section").hidden = true; $("save").hidden = true;
      $("save-state").textContent = "Layout preview only. Settings are saved in the installed extension.";
    }
    render();
  }
  init().catch(e => { $("save-state").textContent = e.message; $("save-state").classList.add("error"); render(); });
})();
