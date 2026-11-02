/* Apply the saved theme before styles paint, including when storage is unavailable. */
(() => {
  const root = document.documentElement;
  const preference = window.matchMedia?.("(prefers-color-scheme: dark)");
  let chosen = null;
  const palettes = {
    pizarra: { canvas: "#101923", curve: "#8bb3ff", highlight: "#68ddb3", text: "#a7b8cc", grid: "#304153" },
    grafito: { canvas: "#14171c", curve: "#8cc8ff", highlight: "#80d9d5", text: "#b0bac8", grid: "#3c4450" },
    noche: { canvas: "#101b30", curve: "#93c5fd", highlight: "#f2cc86", text: "#b0bfd6", grid: "#354963" },
    lavanda: { canvas: "#19181f", curve: "#c4b5fd", highlight: "#8cdec1", text: "#bdb6ce", grid: "#443d53" },
  };
  let palette = "pizarra";
  try {
    const saved = localStorage.getItem("numerical-lab-theme");
    if (saved === "light" || saved === "dark") chosen = saved;
    const savedPalette = localStorage.getItem("numerical-lab-dark-palette");
    if (Object.hasOwn(palettes, savedPalette)) palette = savedPalette;
  } catch {}
  window.LabTheme = { chartPalette: () => palettes[palette] };

  function apply(theme) {
    root.dataset.theme = theme;
    root.dataset.palette = palette;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content", theme === "dark" ? palettes[palette].canvas : "#f5f7fa",
    );
    const toggle = document.getElementById("themeToggle");
    if (toggle) {
      const dark = theme === "dark";
      toggle.setAttribute("aria-pressed", String(dark));
      toggle.setAttribute("aria-label", dark ? "Activar modo claro" : "Activar modo oscuro");
      toggle.title = dark ? "Activar modo claro" : "Activar modo oscuro";
      document.getElementById("themeLabel").textContent = dark ? "Modo claro" : "Modo oscuro";
    }
    document.querySelectorAll('input[name="darkPalette"]').forEach((input) => {
      input.checked = input.value === palette && theme === "dark";
    });
    window.dispatchEvent(new CustomEvent("lab:themechange"));
  }

  apply(chosen || (preference?.matches ? "dark" : "light"));
  preference?.addEventListener("change", (event) => {
    if (!chosen) apply(event.matches ? "dark" : "light");
  });
  document.addEventListener("DOMContentLoaded", () => {
    apply(root.dataset.theme);
    document.getElementById("themeToggle").addEventListener("click", () => {
      chosen = root.dataset.theme === "dark" ? "light" : "dark";
      try { localStorage.setItem("numerical-lab-theme", chosen); } catch {}
      apply(chosen);
    });
    document.querySelectorAll('input[name="darkPalette"]').forEach((input) => {
      input.addEventListener("change", () => {
        if (!input.checked || !Object.hasOwn(palettes, input.value)) return;
        palette = input.value;
        chosen = "dark";
        try {
          localStorage.setItem("numerical-lab-theme", chosen);
          localStorage.setItem("numerical-lab-dark-palette", palette);
        } catch {}
        apply(chosen);
      });
    });
  });
})();
