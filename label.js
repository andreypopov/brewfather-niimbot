(function (root) {
  "use strict";
  const DEFAULTS = Object.freeze({lengthMm: 40, widthMm: 14, copies: 1, density: 3, offsetMm: 0, rotate180: false});
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
    if (input.rotate180 !== undefined && typeof input.rotate180 !== "boolean") throw new Error("Invalid rotation setting.");
    result.rotate180 = input.rotate180 ?? DEFAULTS.rotate180;
    return result;
  }

  function geometry(input) {
    const s = settings(input), ppm = 300 / 25.4;
    return {w_px: Math.min(144, Math.round(s.widthMm * ppm)), h_px: Math.round(s.lengthMm * ppm),
      dpi: 300, offset_y_px: Math.round(s.offsetMm * ppm)};
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
    return {id: text(batch._id), name: text(r.name), batchName: text(batch.name),
      batchNo: number(batch.batchNo), style: text(r.style?.name), date, metrics, warnings};
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

  // Draw the same pixels for preview and print. The head axis is limited to 144 dots;
  // the horizontal reading direction runs along the feed axis, so rotate once for BLE.
  function render(label, input, makeCanvas = () => document.createElement("canvas")) {
    const s = settings(input), g = geometry(s), canvas = makeCanvas();
    canvas.width = g.h_px; canvas.height = g.w_px;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000"; ctx.textBaseline = "middle";
    const margin = 14, available = canvas.width - 2 * margin;
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
    const output = makeCanvas(); output.width = g.w_px; output.height = g.h_px;
    const out = output.getContext("2d");
    out.fillStyle = "#fff"; out.fillRect(0, 0, output.width, output.height);
    out.save();
    if (s.rotate180) { out.translate(0, output.height); out.rotate(-Math.PI / 2); }
    else { out.translate(output.width, 0); out.rotate(Math.PI / 2); }
    out.drawImage(canvas, 0, 0); out.restore();
    return {canvas, output, size: g, warnings: overflow};
  }

  const api = {DEFAULTS, MODEL, batchId, settings, geometry, normalize, lines, render};
  root.BrewLabel = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
