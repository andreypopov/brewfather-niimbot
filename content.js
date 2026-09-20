(() => {
  "use strict";
  if (globalThis.__brewLabelLoaded) return;
  globalThis.__brewLabelLoaded = true;
  const B = BrewLabel;
  let config = null, busy = false, activePreview = null;
  const bindings = new Map();
  const uiCSS = `
    :host{font:13px Arial,sans-serif;color:#eee;display:inline-flex;align-items:center;margin:0 10px;vertical-align:middle}
    *{box-sizing:border-box}[hidden]{display:none!important}button,a{font:inherit}button{cursor:pointer;border:1px solid #756344;border-radius:6px;color:#f4d597;background:#302b22;padding:7px 10px;white-space:nowrap}
    button:hover{background:#49402e}button:focus-visible{outline:2px solid #ffcc67;outline-offset:2px}button:disabled{opacity:.5;cursor:wait}
    .group{display:flex;gap:5px}svg{width:15px;height:15px;vertical-align:-3px;margin-right:6px}
    @media(max-width:650px){.caption{display:none}svg{margin:0}:host{margin:0 5px}}
  `;
  const printIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6z"/><path d="M17 12h1"/></svg>';
  const panelHost = document.createElement("div");
  panelHost.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:2147483646;max-width:calc(100vw - 40px);display:none";
  const panel = panelHost.attachShadow({mode: "open"});
  panel.innerHTML = `<style>${uiCSS}
    :host{margin:0;display:block}.panel{width:440px;max-width:calc(100vw - 40px);padding:20px;border-radius:12px;border:1px solid #595044;background:#242322;box-shadow:0 12px 50px #0008}
    header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:14px}h3{font-size:16px;margin:0}p{line-height:1.5;margin:10px 0}button.close{border:0;background:none;font-size:22px;padding:0 4px}
    .paper{background:white;border-radius:6px;display:flex;align-items:center;justify-content:center;padding:8px 0;overflow:hidden}.paper canvas{display:block;width:100%;height:auto;image-rendering:pixelated}
    .muted{color:#b8b5af;font-size:12px}.status{white-space:pre-wrap;overflow-wrap:anywhere}.error{color:#ffb4a9}.actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
    .job-controls{display:flex;align-items:end;gap:10px;margin-top:14px}.copies-label{display:flex;flex-direction:column;gap:5px;color:#b8b5af;font-size:12px}.copies{width:84px;padding:8px 9px;border:1px solid #756344;border-radius:6px;color:#eee;background:#302b22;font:inherit}.copies:focus{outline:2px solid #ffcc67;outline-offset:1px}.qr-label{display:flex;align-items:center;gap:6px;height:35px;color:#eee;white-space:nowrap}.qr-label input{width:16px;height:16px;accent-color:#f0c76b}.print-now{min-width:92px}
    </style><section class="panel" role="region" aria-label="Brewfather label"><header><h3>Batch label</h3><button class="close" title="Close" aria-label="Close">×</button></header><div class="paper" hidden></div><p class="meta muted"></p><p class="status" role="status" aria-live="polite"></p><p class="notes muted"></p><div class="job-controls"><label class="copies-label" for="brewlabel-copies">Copies<input class="copies" id="brewlabel-copies" type="number" min="1" max="50" step="1" value="1" inputmode="numeric"></label><label class="qr-label"><input class="add-qr" type="checkbox">Add QR</label><button class="print-now">Print</button></div><div class="actions"><button class="settings">Label settings</button><button class="disconnect">Disconnect printer</button></div></section>`;
  const status = panel.querySelector(".status"), paper = panel.querySelector(".paper"), copiesInput = panel.querySelector(".copies"), qrInput = panel.querySelector(".add-qr");
  panel.querySelector(".close").onclick = () => { activePreview = null; panelHost.style.display = "none"; };
  qrInput.onchange = () => {
    if (busy || !activePreview) return;
    try {
      const copies = readCopies();
      const result = draw(activePreview.label, {...activePreview.settings, copies, addQr: qrInput.checked});
      showStatus(result.warnings.length ? "Preview updated. Resolve the note below or turn off Add QR, then click Print." : "Preview updated. Set the number of copies, then click Print.");
    } catch (error) { showError(error); }
  };
  panel.querySelector(".settings").onclick = () => rpc({type: "open-options"}).catch(showError);
  panel.querySelector(".disconnect").onclick = async () => {
    if (busy) return;
    await Niimbot.disconnect(); showStatus("Printer disconnected. You can choose a device on the next print.");
  };
  panel.querySelector(".print-now").onclick = e => {
    e.preventDefault();
    if (busy) return;
    try {
      if (!activePreview) throw new Error("Preview a batch first, then click Print.");
      run(activePreview.binding, true, readCopies(), qrInput.checked).catch(showError);
    } catch (error) { showError(error); }
  };

  async function rpc(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) throw new Error(response?.error || "Reload the page after updating the extension.");
    return response;
  }
  function showStatus(message, error = false) {
    if (!panelHost.isConnected) document.body.append(panelHost);
    panelHost.style.display = "block"; status.textContent = message;
    status.classList.toggle("error", error);
  }
  function showError(error) {
    let message = error.message || String(error);
    if (error.name === "NotFoundError") message = "Printer selection was cancelled or D11H was not found. Turn it on and close the NIIMBOT app on your phone.";
    if (error.name === "NetworkError") message = "The Bluetooth connection was interrupted. Check the printer and retry manually if no label came out.";
    if (error.name === "TimeoutError") message = "The operation timed out. Check the connection and printer status.";
    showStatus(message, true);
  }
  function setBusy(value) {
    busy = value;
    for (const {shadow} of bindings.values()) for (const btn of shadow.querySelectorAll("button")) btn.disabled = value;
    panel.querySelector(".print-now").disabled = value;
    panel.querySelector(".copies").disabled = value;
    panel.querySelector(".add-qr").disabled = value;
    panel.querySelector(".settings").disabled = value;
    panel.querySelector(".disconnect").disabled = value;
  }
  function readCopies() {
    const copies = Number(copiesInput.value);
    if (!Number.isInteger(copies) || copies < 1 || copies > 50) throw new Error("Copies must be a whole number from 1 to 50.");
    return copies;
  }
  function cardInfo(card) {
    const number = card.querySelector(".batch-number")?.textContent.trim().match(/^#(\d+)$/);
    const cardTitle = card.querySelector(".recipe-section .item-name .text-content")?.textContent.trim();
    return number && cardTitle ? {type: "card", batchNo: Number(number[1]), cardTitle} : null;
  }
  function requestFor(binding) {
    if (!binding.host.isConnected) throw new Error("The batch card is no longer visible.");
    if (binding.card) {
      const info = cardInfo(binding.card);
      if (!info) throw new Error("Could not read the batch card. Open the batch and try again.");
      return info;
    }
    const id = B.batchId(location.href);
    if (!id) throw new Error("Open a batch or the Batches list.");
    return {type: "batch", id};
  }
  function draw(label, settings) {
    const result = B.render(label, settings);
    paper.hidden = false; paper.replaceChildren(result.canvas);
    panel.querySelector("h3").textContent = `Batch label${label.batchNo === null ? "" : ` #${label.batchNo}`}`;
    panel.querySelector(".meta").textContent = `${settings.lengthMm} × ${settings.widthMm} mm · ${settings.copies} ${settings.copies === 1 ? "copy" : "copies"} · D11H${settings.addQr ? " · QR" : ""}`;
    panel.querySelector(".notes").textContent = [...label.warnings, ...result.warnings].join(" ");
    return result;
  }
  async function run(binding, print = false, requestedCopies = null, requestedQr = null) {
    if (busy) return;
    if (!print) activePreview = null;
    if (!config?.configured) {
      await rpc({type: "open-options"});
      showStatus("Save your Brewfather access details in the extension settings first."); return;
    }
    const snapshot = requestFor(binding), url = location.href;
    setBusy(true); paper.hidden = true; panel.querySelector(".notes").textContent = "";
    showStatus(print ? "Connecting to the printer and loading the batch…" : "Loading the batch…");
    try {
      await navigator.locks.request("brewfather-niimbot-d11h", {ifAvailable: true}, async lock => {
        if (!lock) throw new Error("A label is already printing from another tab. Wait for it to finish.");
        // Start requestDevice before awaiting network: the chooser needs the click gesture.
        const connect = print ? Niimbot.identify(B.MODEL) : Promise.resolve(null);
        const settled = await Promise.allSettled([connect, rpc(snapshot), rpc({type: "settings"})]);
        const failed = settled.find(r => r.status === "rejected");
        if (failed) throw failed.reason;
        const [printer, reply, fresh] = settled.map(r => r.value);
        config = fresh;
        if (location.href !== url || JSON.stringify(requestFor(binding)) !== JSON.stringify(snapshot)) {
          throw new Error("The card or page changed. Click print on the intended batch again.");
        }
        if (print && printer?.modelId !== B.MODEL.id) {
          await Niimbot.disconnect(); throw new Error(`Selected ${printer?.label || "an unidentified printer"}. Niimbot D11_H (300 dpi) is required.`);
        }
        const copies = print ? (requestedCopies ?? readCopies()) : 1;
        const addQr = print ? (requestedQr ?? qrInput.checked) : Boolean(fresh.settings.addQrDefault);
        const printSettings = {...fresh.settings, copies, addQr};
        const result = draw(reply.label, printSettings);
        if (!print) {
          copiesInput.value = "1";
          qrInput.checked = Boolean(fresh.settings.addQrDefault);
          activePreview = {binding, snapshot, url, label: reply.label, settings: fresh.settings};
          showStatus(result.warnings.length ? "Preview ready. Resolve the note below or turn off Add QR, then click Print." : "Preview ready. Set the number of copies, then click Print.");
          return;
        }
        if (result.warnings.length) throw new Error(result.warnings.join(" "));
        await Niimbot.printImage(result.output.toDataURL("image/png"), {
          model: B.MODEL, size: result.size, copies, density: fresh.settings.density,
          onProgress: p => showStatus(p === "ok" ? "The printer confirmed completion." : "Printing…")
        });
        showStatus(`The printer confirmed ${copies} ${copies === 1 ? "copy" : "copies"} · batch #${reply.label.batchNo ?? "—"}`);
      });
    } catch (error) { showError(error); }
    finally { setBusy(false); }
  }

  function addButtons(parent, card = null) {
    if (bindings.has(parent)) return;
    const host = document.createElement("span");
    host.className = "brewlabel-controls";
    const shadow = host.attachShadow({mode: "open"});
    shadow.innerHTML = `<style>${uiCSS}</style><span class="group"><button class="print" title="Preview and print a label on Niimbot D11H">${printIcon}<span class="caption">Print label</span></button></span>`;
    const binding = {host, shadow, card}; bindings.set(parent, binding);
    for (const event of ["click", "pointerdown", "keydown", "keyup"]) host.addEventListener(event, e => e.stopPropagation());
    shadow.querySelector(".print").onclick = e => { e.preventDefault(); e.stopPropagation(); if (e.isTrusted) run(binding, false).catch(showError); };
    for (const btn of shadow.querySelectorAll("button")) btn.disabled = busy;
    const badge = parent.querySelector(".day-badge");
    if (badge) parent.insertBefore(host, badge); else parent.append(host);
  }
  function visible(el) { return !el.closest(".ion-page-hidden") && el.getClientRects().length > 0; }
  function scan() {
    for (const [parent, binding] of bindings) {
      if (!parent.isConnected || !binding.host.isConnected) bindings.delete(parent);
    }
    if (!/^\/tabs\/batches(?:\/|$)/.test(location.pathname)) return;
    for (const card of document.querySelectorAll("bf-batch-card")) {
      const header = card.querySelector(".batch-title-row");
      if (header && visible(card) && cardInfo(card)) addButtons(header, card);
    }
    if (B.batchId(location.href)) {
      const parents = Array.from(document.querySelectorAll('ion-header[role="banner"] ion-buttons[slot="primary"]')).filter(visible);
      if (parents.length) addButtons(parents.at(-1));
    }
  }
  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true; requestAnimationFrame(() => { scheduled = false; scan(); });
  }).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ["class"]});
  window.addEventListener("popstate", scan);
  window.addEventListener("focus", () => { rpc({type: "settings"}).then(r => { config = r; }).catch(() => {}); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) rpc({type: "settings"}).then(r => { config = r; }).catch(() => {}); });
  rpc({type: "settings"}).then(r => { config = r; scan(); }).catch(showError);
})();
