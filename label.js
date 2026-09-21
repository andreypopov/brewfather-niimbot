(function (root) {
  "use strict";
  const DEFAULTS = Object.freeze({lengthMm: 40, widthMm: 14, copies: 1, density: 3, offsetMm: 0, rotate180: false, addQrDefault: false, addQr: false});
  const MODEL = Object.freeze({id: 528, dpi: 300, task: "v4", density: 3, label_type: 1, speed: 1, name_prefixes: ["D11"]});
  const number = value => typeof value === "number" && Number.isFinite(value) ? value : null;
  const text = value => typeof value === "string" ? value.replace(/[\u0000-\u001f]/g, " ").trim() : "";

  function batchId(url) {
    try {
      const u = new URL(url);
      if (u.origin !== "https://web.brewfather.app") return null;
      const path = u.hash.startsWith("#/") ? u.hash.slice(1) : u.pathname;
      return path.match(/^\/tabs\/batches\/batch\/([A-Za-z0-9_-]{1,128})(?:\/|$)/)?.[1] || null;
    } catch { return null; }
  }

  function recipeId(url) {
    try {
      const u = new URL(url);
      if (u.origin !== "https://web.brewfather.app") return null;
      const path = u.hash.startsWith("#/") ? u.hash.slice(1) : u.pathname;
      return path.match(/^\/tabs\/(?:recipes\/recipe\/|batches\/batch\/[A-Za-z0-9_-]{1,128}\/recipe\/)([A-Za-z0-9_-]{1,128})(?:\/|$)/)?.[1] || null;
    } catch { return null; }
  }

  function settings(input = {}) {
    const result = {...DEFAULTS};
    const limits = {lengthMm: [20, 100], widthMm: [8, 15], copies: [1, 50], density: [1, 5], offsetMm: [-1, 1]};
    for (const [key, [min, max]] of Object.entries(limits)) {
      if (input[key] !== undefined) {
        const n = number(input[key]);
        if (n === null || n < min || n > max || (["copies", "density"].includes(key) && !Number.isInteger(n))) {
          throw new Error(`Invalid ${key}: must be between ${min} and ${max}.`);
        }
        result[key] = n;
      }
    }
    for (const key of ["rotate180", "addQrDefault", "addQr"]) {
      if (input[key] !== undefined && typeof input[key] !== "boolean") throw new Error(`Invalid ${key} setting.`);
      result[key] = input[key] ?? DEFAULTS[key];
    }
    return result;
  }

  function geometry(input) {
    const s = settings(input), ppm = 300 / 25.4;
    return {w_px: Math.min(144, Math.round(s.widthMm * ppm)), h_px: Math.round(s.lengthMm * ppm),
      dpi: 300, offset_y_px: Math.round(s.offsetMm * ppm)};
  }

  function normalizeShareUrl(value) {
    if (typeof value !== "string") return "";
    const raw = value.replace(/[\u0000-\u001f]/g, " ").trim();
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:") return "";
      if (u.hostname === "share.brewfather.app" && /^\/[A-Za-z0-9_-]{4,160}$/.test(u.pathname)) {
        return `${u.origin}${u.pathname}`;
      }
      if (u.hostname === "web.brewfather.app" && /^\/share\/[A-Za-z0-9_-]{4,160}$/.test(u.pathname)) {
        return `${u.origin}${u.pathname}`;
      }
    } catch {}
    return "";
  }

  function findSharedRecipeUrl(recipe) {
    const visited = new Set();
    const visit = (value, path, depth) => {
      if (!value || typeof value !== "object" || depth > 4 || visited.has(value)) return "";
      visited.add(value);
      for (const [key, child] of Object.entries(value)) {
        const candidate = normalizeShareUrl(child);
        if (candidate) return candidate;
        const context = [...path, key].join(".").toLowerCase();
        if (typeof child === "string" && /(share|public|published)/.test(context) &&
            /^(?:[A-Za-z0-9_-]){4,160}$/.test(child.trim())) {
          return `https://share.brewfather.app/${child.trim()}`;
        }
        const nested = visit(child, [...path, key], depth + 1);
        if (nested) return nested;
      }
      return "";
    };
    return visit(recipe, [], 0);
  }

  function shareUrlFromText(value) {
    if (typeof value !== "string") return "";
    const match = value.match(/https:\/\/(?:share\.brewfather\.app\/[A-Za-z0-9_-]{4,160}|web\.brewfather\.app\/share\/[A-Za-z0-9_-]{4,160})/i);
    return normalizeShareUrl(match?.[0] || "");
  }

  function normalize(batch) {
    if (!batch || typeof batch !== "object" || !batch.recipe || !text(batch.recipe.name)) {
      throw new Error("The batch has no recipe name. The label was not created.");
    }
    const r = batch.recipe;
    const measured = (key, flag) => batch[flag] === false ? null : number(batch[key]);
    const og = measured("measuredOg", "measuredOgSet");
    const fg = measured("measuredFg", "measuredFgSet");
    const abv = number(batch.measuredAbv);
    const metrics = {
      abv: {value: abv ?? number(r.abv), estimated: abv === null || og === null || fg === null},
      og: {value: og ?? number(batch.estimatedOg) ?? number(r.og), estimated: og === null},
      fg: {value: fg ?? number(batch.estimatedFg) ?? number(r.fg), estimated: fg === null},
      ibu: {value: number(batch.estimatedIbu) ?? number(r.ibu), estimated: true}
    };
    const warnings = [];
    if (og === null) warnings.push("OG: the estimated value is used because no measured value is set.");
    if (fg === null) warnings.push("FG: the estimated value is used because final gravity is not set.");
    if (metrics.abv.estimated) warnings.push("ABV: estimated because measured OG and FG are incomplete; it is marked with ≈.");
    if (Object.values(metrics).some(m => m.value === null)) warnings.push("Missing metrics are shown as —.");
    const brewDate = number(batch.brewDate);
    const date = brewDate === null ? "" : new Intl.DateTimeFormat("ru-RU", {timeZone: "Europe/London"}).format(new Date(brewDate));
    return {id: text(batch._id), recipeId: text(r._id), name: text(r.name), batchName: text(batch.name),
      batchNo: number(batch.batchNo), style: text(r.style?.name), date, metrics, warnings,
      shareUrl: findSharedRecipeUrl(r)};
  }

  function metric(m, digits, mark = true) {
    if (m.value === null) return "—";
    return (m.estimated && mark ? "≈" : "") + m.value.toFixed(digits);
  }

  function lines(label) {
    const m = label.metrics;
    return [label.name, label.style,
      `ABV ${metric(m.abv, 1)}%   IBU ${metric(m.ibu, 0, false)}`,
      `OG ${metric(m.og, 3)}   FG ${metric(m.fg, 3)}`,
      [label.batchNo === null ? "" : `#${label.batchNo}`, label.date].filter(Boolean).join("  ·  ")];
  }

  function drawQr(ctx, label, x, y, size) {
    if (!label.shareUrl) return "QR code was requested, but this recipe has no Brewfather share link. Open the recipe, use Share, and preview it again.";
    const factory = root.qrcode;
    if (typeof factory !== "function") return "QR code generator is unavailable. Reload the extension and try again.";
    try {
      const qr = factory(0, "M");
      qr.addData(label.shareUrl, "Byte"); qr.make();
      // A three-module quiet zone leaves four printer dots per module on the
      // 144-dot tape height for the usual recipe URL, improving scan distance
      // while retaining a clean border around the code.
      const modules = qr.getModuleCount(), quiet = 3, cell = Math.floor(size / (modules + quiet * 2));
      if (cell < 2) return "QR code is too small for this tape width. Choose at least a 9 mm tape width or turn Add QR off.";
      const total = cell * (modules + quiet * 2), left = x + Math.floor((size - total) / 2), top = y + Math.floor((size - total) / 2);
      ctx.fillStyle = "#fff"; ctx.fillRect(x, y, size, size);
      ctx.fillStyle = "#000";
      for (let row = 0; row < modules; row++) for (let col = 0; col < modules; col++) {
        if (qr.isDark(row, col)) ctx.fillRect(left + (col + quiet) * cell, top + (row + quiet) * cell, cell, cell);
      }
      return "";
    } catch (error) {
      return `QR code could not be generated: ${error.message || "invalid share link"}.`;
    }
  }

  // Draw the same pixels for preview and print. The head axis is limited to 144 dots;
  // the horizontal reading direction runs along the feed axis, so rotate once for BLE.
  function render(label, input, makeCanvas = () => document.createElement("canvas")) {
    const s = settings(input), g = geometry(s), canvas = makeCanvas();
    canvas.width = g.h_px; canvas.height = g.w_px;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000"; ctx.textBaseline = "middle";
    // Give the QR code the complete tape height. The previous 108-dot cap left
    // a small code on 14 mm tape, which many phones could not scan reliably.
    // Keep the text margin and gap on the left/right, but let the QR quiet zone
    // run from the top edge to the bottom edge of the label.
    const margin = 14, qrGap = 12, qrSize = s.addQr ? canvas.height : 0;
    const qrX = canvas.width - margin - qrSize, available = canvas.width - 2 * margin - (qrSize ? qrSize + qrGap : 0);
    const rows = lines(label), sizes = [29, 20, 22, 20, 17];
    const weights = [700, 400, 700, 400, 400];
    const centers = [0.16, 0.37, 0.56, 0.74, 0.90];
    const overflow = [];
    rows.forEach((row, i) => {
      let size = Math.max(12, Math.round(sizes[i] * Math.min(1, canvas.height / 144)));
      const font = () => { ctx.font = `${weights[i]} ${size}px Arial, sans-serif`; };
      font();
      while (ctx.measureText(row).width > available && size > 14) { size--; font(); }
      let fitted = row;
      if (ctx.measureText(fitted).width > available) {
        while (fitted.length && ctx.measureText(fitted + "…").width > available) fitted = fitted.slice(0, -1);
        fitted += "…";
        overflow.push(`Line “${row}” was shortened; choose a longer label.`);
      }
      ctx.fillText(fitted, margin, Math.round(canvas.height * centers[i]));
    });
    const qrWarnings = s.addQr ? [drawQr(ctx, label, qrX, Math.round((canvas.height - qrSize) / 2), qrSize)].filter(Boolean) : [];
    const output = makeCanvas(); output.width = g.w_px; output.height = g.h_px;
    const out = output.getContext("2d");
    out.fillStyle = "#fff"; out.fillRect(0, 0, output.width, output.height);
    out.save();
    if (s.rotate180) { out.translate(0, output.height); out.rotate(-Math.PI / 2); }
    else { out.translate(output.width, 0); out.rotate(Math.PI / 2); }
    out.drawImage(canvas, 0, 0); out.restore();
    return {canvas, output, size: g, warnings: [...qrWarnings, ...overflow]};
  }

  const api = {DEFAULTS, MODEL, batchId, recipeId, normalizeShareUrl, shareUrlFromText, settings, geometry, normalize, findSharedRecipeUrl, lines, render};
  root.BrewLabel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
