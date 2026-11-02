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

  const previousPreview = await fixture({ saved: "dark", palette: "lavanda" });
  assert.equal(previousPreview.w.LabTheme.chartPalette().curve, "#8cc8ff");
  assert.equal(previousPreview.w.document.querySelectorAll('input[name="darkPalette"]').length, 0);
  previousPreview.close();
  console.log("OK   La paleta definitiva reemplaza cualquier selección de la prueba temporal");

})().catch((error) => { console.error(error); process.exitCode = 1; });
