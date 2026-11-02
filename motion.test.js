// DOM-level regression checks for interrupted GSAP disclosures (no browser or network).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const dom = new JSDOM(
  fs.readFileSync(path.join(__dirname, "index.html"), "utf8"),
  { runScripts: "outside-only", pretendToBeVisual: true },
);
const w = dom.window;
let reduced = false;
const queries = new Map();
w.matchMedia = (query) => {
  if (!queries.has(query)) {
    const listeners = new Set();
    const media = {
      media: query,
      get matches() {
        return query.includes("no-preference")
          ? !reduced
          : query.includes("prefers-reduced-motion: reduce")
            ? reduced
            : true;
      },
      addListener(fn) {
        listeners.add(fn);
      },
      removeListener(fn) {
        listeners.delete(fn);
      },
      addEventListener(type, fn) {
        if (type === "change") listeners.add(fn);
      },
      removeEventListener(type, fn) {
        listeners.delete(fn);
      },
      notify() {
        listeners.forEach((fn) => fn({ matches: media.matches, media: query }));
      },
    };
    queries.set(query, media);
  }
  return queries.get(query);
};
w.eval(fs.readFileSync(path.join(__dirname, "libs/gsap.min.js"), "utf8"));
w.eval(fs.readFileSync(path.join(__dirname, "motion.js"), "utf8"));
const settle = () => w.gsap.globalTimeline.progress(1);
const source = w.document.getElementById("sourceControls");
w.LabMotion.disclosure(source, true);
w.LabMotion.disclosure(source, false);
w.LabMotion.disclosure(source, true);
settle();
assert.equal(source.hidden, false);
assert.equal(source.inert, false);
assert.equal(source.getAttribute("aria-hidden"), "false");
console.log("OK   Reabrir un panel interrumpe el cierre sin ocultarlo después");
w.LabMotion.disclosure(source, false);
settle();
assert.equal(source.hidden, true);
assert.equal(source.inert, true);
assert.equal(source.getAttribute("aria-hidden"), "true");
console.log(
  "OK   Cerrar el panel conserva estado visual y accesible coherente",
);
const detail = w.document.getElementById("howBox");
const summary = detail.querySelector("summary");
summary.click();
settle();
summary.click();
reduced = true;
queries.forEach((media) => media.notify());
assert.equal(detail.open, false);
assert.equal(summary.getAttribute("aria-expanded"), "false");
assert.equal(w.document.getElementById("howText").inert, true);
console.log(
  "OK   Cambiar movimiento reducido durante el cierre no deja details abierto",
);
summary.click();
settle();
summary.click();
summary.click();
settle();
assert.equal(detail.open, true);
assert.equal(summary.getAttribute("aria-expanded"), "true");
assert.equal(w.document.getElementById("howText").inert, false);
console.log(
  "OK   Aperturas rápidas de teoría terminan en el estado solicitado",
);
w.gsap.globalTimeline.clear();
w.gsap.ticker.sleep();
w.close();
