const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const html = fs.readFileSync("index.html", "utf8");
const script = fs.readFileSync("theme.js", "utf8");
async function fixture({ saved, dark = false, blocked = false, palette } = {}) {
  const dom = new JSDOM(html, { runScripts: "outside-only", url: "https://example.test" });
  const w = dom.window;
  let change;
  w.matchMedia = () => ({ matches: dark, addEventListener: (_, listener) => { change = listener; } });
  if (blocked) Object.defineProperty(w, "localStorage", { get() { throw new Error("Storage blocked"); } });
  else if (saved) w.localStorage.setItem("numerical-lab-theme", saved);
  if (palette && !blocked) w.localStorage.setItem("numerical-lab-dark-palette", palette);
  w.eval(script);
  const initial = w.document.documentElement.dataset.theme;
  await new Promise((resolve) => w.document.addEventListener("DOMContentLoaded", resolve, { once: true }));
  return { w, initial, change: (matches) => change({ matches }), close: () => w.close() };
}
(async () => {
  const first = await fixture({ dark: true });
  assert.equal(first.initial, "dark");
  assert.equal(first.w.document.getElementById("themeToggle").getAttribute("aria-pressed"), "true");
  first.w.document.getElementById("themeToggle").click();
  assert.equal(first.w.document.documentElement.dataset.theme, "light");
  assert.equal(first.w.localStorage.getItem("numerical-lab-theme"), "light");
  assert.equal(first.w.document.getElementById("themeToggle").getAttribute("aria-label"), "Activar modo oscuro");
  first.change(true);
  assert.equal(first.w.document.documentElement.dataset.theme, "light");
  first.close();
  console.log("OK   Sigue el sistema al inicio y guarda la elección manual con etiqueta accesible");

  const next = await fixture({ dark: true, saved: "light" });
  assert.equal(next.initial, "light");
  next.close();
  console.log("OK   La elección guardada prevalece en una visita posterior");

  const auto = await fixture({ saved: "invalid" });
  assert.equal(auto.initial, "light");
  auto.change(true);
  assert.equal(auto.w.document.documentElement.dataset.theme, "dark");
  auto.close();
  console.log("OK   Sin elección válida sigue los cambios del sistema");

  const privateVisit = await fixture({ blocked: true });
  privateVisit.w.document.getElementById("themeToggle").click();
  assert.equal(privateVisit.w.document.documentElement.dataset.theme, "dark");
  privateVisit.close();
  console.log("OK   El control funciona aunque el navegador bloquee el almacenamiento");

  const preview = await fixture();
  for (const id of ["pizarra", "grafito", "noche", "lavanda"]) {
    const input = preview.w.document.querySelector(`input[value="${id}"]`);
    input.click();
    assert.equal(preview.w.document.documentElement.dataset.theme, "dark");
    assert.equal(preview.w.document.documentElement.dataset.palette, id);
    assert.equal(preview.w.document.querySelectorAll('input[name="darkPalette"]:checked').length, 1);
    assert.equal(preview.w.localStorage.getItem("numerical-lab-dark-palette"), id);
  }
  preview.w.document.getElementById("themeToggle").click();
  assert.equal(preview.w.document.querySelectorAll('input[name="darkPalette"]:checked').length, 0);
  preview.w.document.getElementById("themeToggle").click();
  assert(preview.w.document.querySelector('input[value="lavanda"]').checked);
  preview.close();
  const savedPalette = await fixture({ saved: "dark", palette: "lavanda" });
  assert.equal(savedPalette.w.document.documentElement.dataset.palette, "lavanda");
  savedPalette.close();
  console.log("OK   Las cuatro paletas se seleccionan, se recuerdan y mantienen selección única");
})().catch((error) => { console.error(error); process.exitCode = 1; });
