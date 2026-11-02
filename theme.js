/* Apply the saved theme before styles paint, including when storage is unavailable. */
(() => {
  const root = document.documentElement;
  const preference = window.matchMedia?.("(prefers-color-scheme: dark)");
  let chosen = null;
  const palette = { canvas: "#14171c", curve: "#8cc8ff", highlight: "#80d9d5", text: "#b0bac8", grid: "#3c4450" };
  try {
    const saved = localStorage.getItem("numerical-lab-theme");
    if (saved === "light" || saved === "dark") chosen = saved;
  } catch {}
  window.LabTheme = { chartPalette: () => palette };

  function apply(theme) {
    root.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute(
      "content", theme === "dark" ? palette.canvas : "#f5f7fa",
    );
    const toggle = document.getElementById("themeToggle");
    if (toggle) {
      const dark = theme === "dark";
      toggle.setAttribute("aria-pressed", String(dark));
      toggle.setAttribute("aria-label", dark ? "Activar modo claro" : "Activar modo oscuro");
      toggle.title = dark ? "Activar modo claro" : "Activar modo oscuro";
      document.getElementById("themeLabel").textContent = dark ? "Modo claro" : "Modo oscuro";
    }
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

  });
})();
