/* Optional tools reuse structured numerical results and leave the primary flow compact. */
(() => {
  const lab = window.NumericalLab;
  if (!lab) return;
  const $ = (id) => document.getElementById(id);
  const interpolation = ["lagrange", "newton_dd", "matricial", "splines"];
  const polynomial = interpolation.slice(0, 3);
  const roots = ["biseccion", "newton_raphson", "secante"];
  const storageKey = "numerical-lab-experiments-v1";
  let state, comparison = null, currentStep = null, playback = null, timer = null;
  let saved = [];
  let deletedExperiment = null;
  let storageAvailable = true;
  const number = (value) => Number.isFinite(value) ? Number(value.toPrecision(7)).toString() : "—";
  const notice = (message) => { $("workbenchNotice").textContent = message; };
  function stopPlayback() {
    playback?.kill(); playback = null;
    clearInterval(timer); timer = null;
    $("playIterations").textContent = "Reproducir";
    $("playIterations").setAttribute("aria-pressed", "false");
  }
  function colours() {
    const dark = document.documentElement.dataset.theme === "dark";
    return { accent: dark ? "#8cc8ff" : "#285bc5", contrast: dark ? "#e1b57e" : "#a46b32" };
  }
  function decorations() {
    if (!state?.chart) return;
    const { accent, contrast } = colours();
    const chart = state.chart;
    const retained = new Map(chart.data.datasets.map((series) => [series.id, series]));
    chart.data.datasets = chart.data.datasets.filter((series) => !series.id?.startsWith("tool-"));
    if (comparison && Number.isFinite(comparison.value) && $("comparePanel").open && state.valid) {
      chart.data.datasets.push({ id: "tool-comparison", label: comparison.label,
        data: comparison.points.length ? comparison.points : [{ x: comparison.value, y: 0 }],
        borderColor: contrast, backgroundColor: contrast, borderDash: [5, 4],
        showLine: comparison.points.length > 0, pointRadius: comparison.points.length ? 0 : 6,
        borderWidth: 2, tension: 0 });
    }
    if (state.valid && polynomial.includes(state.method) && state.selected && !state.selected.all) {
      chart.data.datasets.push({ id: "tool-nodes", label: "Nodos usados (" + state.selected.xs.length + ")",
        data: state.selected.xs.map((x, i) => ({ x, y: state.selected.ys[i] })),
        borderColor: accent, backgroundColor: "transparent", pointRadius: 5.5, borderWidth: 2, showLine: false });
    }
    if (currentStep !== null && state.valid && $("stepPanel").open) {
      const step = state.iterations[currentStep];
      const segment = state.method === "biseccion" ? [{ x: step.a, y: 0 }, { x: step.b, y: 0 }]
        : state.method === "newton_raphson" ? [{ x: step.xk, y: step.fx }, { x: step.xNext, y: step.fx + step.dfx * (step.xNext - step.xk) }]
        : [{ x: step.x0, y: step.fx0 }, { x: step.x2, y: step.fx0 + (step.fx1 - step.fx0) / (step.x1 - step.x0) * (step.x2 - step.x0) }];
      chart.data.datasets.push({ id: "tool-step-line", label: state.method === "biseccion" ? "Intervalo del paso" : "Recta del paso",
        data: segment, borderColor: contrast, backgroundColor: contrast, pointRadius: 3, borderWidth: 3, showLine: true, tension: 0 });
      chart.data.datasets.push({ id: "tool-step-point", label: "Estimación del paso " + step.k,
        data: [{ x: step.x, y: step.y }], borderColor: contrast, backgroundColor: contrast, pointRadius: 6, showLine: false });
    }
    chart.data.datasets = chart.data.datasets.map((series) => retained.has(series.id) ? Object.assign(retained.get(series.id), series) : series);
    chart.update();
    const convergence = state.convergence;
    if (convergence) {
      const previous = new Map(convergence.data.datasets.map((series) => [series.id, series]));
      convergence.data.datasets = convergence.data.datasets.filter((series) => !series.id?.startsWith("tool-"));
      if (currentStep !== null && $("stepPanel").open) {
        const step = state.iterations[currentStep];
        convergence.data.datasets.push({ id: "tool-convergence-step", label: "Paso seleccionado", data: state.iterations.map((item, index) => index === currentStep ? Math.max(item.err, 1e-17) : null),
          backgroundColor: contrast, borderColor: contrast, pointRadius: 6, showLine: false });
      }
      convergence.data.datasets = convergence.data.datasets.map((series) => previous.has(series.id) ? Object.assign(previous.get(series.id), series) : series);
      convergence.update();
    }
  }
  function selectStep(index, manual = true) {
    if (!state?.valid || !state.iterations.length) return;
    if (manual) stopPlayback();
    currentStep = Math.max(0, Math.min(state.iterations.length - 1, index));
    const step = state.iterations[currentStep];
    $("iterationSlider").value = currentStep + 1;
    $("iterationPosition").textContent = step.k + " de " + state.iterations.length;
    $("previousIteration").disabled = currentStep === 0;
    $("nextIteration").disabled = currentStep === state.iterations.length - 1;
    $("iterationDescription").textContent = (state.method === "biseccion"
      ? "Intervalo [" + number(step.a) + ", " + number(step.b) + "]. Punto medio: "
      : "Nueva estimación: ") + number(step.x) + ". Residuo g(x): " + number(step.y) + ". "
      + (state.method === "biseccion" ? "Cota de error: " : "Cambio |Δx|: ") + number(step.err) + ".";
    document.querySelectorAll("#methodTable tbody tr").forEach((row, i) => {
      row.classList.toggle("selected-iteration", i === currentStep);
      if (i === currentStep) row.setAttribute("aria-current", "step"); else row.removeAttribute("aria-current");
      if (i === currentStep) {
        const container = row.closest(".table-scroll");
        const bounds = container.getBoundingClientRect(), cell = row.getBoundingClientRect();
        const header = $("methodTable").querySelector("thead").getBoundingClientRect().height;
        if (bounds.height && cell.bottom > bounds.bottom) container.scrollTop += cell.bottom - bounds.bottom;
        else if (bounds.height && cell.top < bounds.top + header) container.scrollTop -= bounds.top + header - cell.top;
      }
    });
    decorations();
  }
  function clearSteps() {
    stopPlayback(); currentStep = null;
    document.querySelectorAll("#methodTable tbody tr").forEach((row) => { row.classList.remove("selected-iteration"); row.removeAttribute("aria-current"); });
  }
  function play() {
    if (playback || timer) { stopPlayback(); return; }
    if (!state?.valid || !state.iterations.length) return;
    if (currentStep === null || currentStep >= state.iterations.length - 1) selectStep(0);
    const start = currentStep + 1;
    if (start >= state.iterations.length) return;
    $("playIterations").textContent = "Pausar";
    $("playIterations").setAttribute("aria-pressed", "true");
    if (window.gsap) {
      playback = window.gsap.timeline({ onComplete: stopPlayback });
      for (let i = start; i < state.iterations.length; i++) playback.call(() => selectStep(i, false), [], (i - start + 1) * 0.9);
    } else {
      timer = setInterval(() => { selectStep(currentStep + 1, false); if (currentStep >= state.iterations.length - 1) stopPlayback(); }, 900);
    }
  }
  function refreshComparison() {
    comparison = null;
    $("comparisonResult").replaceChildren();
    if (!state?.valid || !$("comparePanel").open || !$("compareMethod").value) { decorations(); return; }
    try {
      const first = lab.compare(state.method);
      comparison = lab.compare($("compareMethod").value);
      const result = document.createElement("dl"); result.className = "comparison-values";
      for (const item of [first, comparison]) {
        const title = document.createElement("dt"), value = document.createElement("dd");
        title.textContent = item.label;
        value.textContent = (Number.isFinite(item.value) ? number(item.value) + (state.primary?.unit ? " " + state.primary.unit : "") : "Sin convergencia: " + (item.reason || "No se confirmó una raíz."))
          + (item.iterations === null ? "" : " · " + item.iterations + " iteraciones · |g(x)| = " + number(item.residual));
        result.append(title, value);
      }
      const difference = document.createElement("p");
      difference.textContent = Number.isFinite(first.value) && Number.isFinite(comparison.value)
        ? "Diferencia absoluta: " + number(Math.abs(first.value - comparison.value)) + (state.primary?.unit ? " " + state.primary.unit : "") + "."
        : "La diferencia requiere dos resultados convergentes; se conserva el estado de cada método.";
      result.append(difference);
      if (first.exact !== null) {
        const error = document.createElement("p");
        error.textContent = "Error absoluto respecto a la solución analítica de la demo: " + first.label + " = " + number(first.error) + "; " + comparison.label + " = " + number(comparison.error) + ".";
        result.append(error);
      }
      $("comparisonResult").append(result);
    } catch (error) {
      comparison = null;
      const message = document.createElement("p"); message.className = "numeric-error"; message.textContent = error.message;
      $("comparisonResult").append(message);
    }
    decorations();
  }
  function onResult() {
    state = lab.state();
    clearSteps();
    const canExplore = [...interpolation, "derivadas"].includes(state.method);
    $("explorePanel").hidden = !canExplore;
    $("exploreX").disabled = !state.valid;
    $("exploreX").min = state.xs[0]; $("exploreX").max = state.xs.at(-1);
    $("exploreX").value = state.params?.xEval ?? state.xs[0];
    $("exploreXValue").textContent = number(state.params?.xEval);
    $("exploreHint").textContent = "Desliza o haz clic en la gráfica para elegir X. También puedes escribir el valor exacto en «Evaluar en X»." + (state.method === "derivadas" ? " La derivada se evalúa en el nodo de datos más cercano." : "");
    $("nodeSlider").max = state.xs.length;
    $("nodeSlider").disabled = !state.valid || !state.params?.nNodes;
    $("nodeSlider").value = state.params?.nNodes || state.xs.length;
    $("allNodes").checked = state.params?.nNodes === 0;
    $("nodesHint").textContent = state.params?.nNodes ? state.params.nNodes + " nodos · grado " + (state.params.nNodes - 1) : "Todos: " + state.xs.length + " nodos";
    const group = interpolation.includes(state.method) ? interpolation : ["trapecio", "simpson"].includes(state.method) ? ["trapecio", "simpson"] : roots.includes(state.method) ? roots : [];
    const selected = $("compareMethod").value;
    $("compareMethod").replaceChildren();
    for (const method of group.filter((method) => method !== state.method)) {
      const option = document.createElement("option"); option.value = method; option.textContent = lab.names[method]; $("compareMethod").append(option);
    }
    if (group.includes(selected) && selected !== state.method) $("compareMethod").value = selected;
    else if (polynomial.includes(state.method)) $("compareMethod").value = "splines";
    $("compareMethod").disabled = !state.valid || !group.length;
    $("comparisonHint").textContent = !group.length ? "La comparación está disponible en interpolación, integración y métodos iterativos de raíces."
      : "Mismos datos y objetivo. La diferencia entre métodos no es el error real."
        + (interpolation.includes(state.method) ? " Lagrange y Newton con los mismos nodos representan el mismo polinomio; el spline utiliza todos los datos." : "");
    $("stepPanel").hidden = !state.valid || !state.iterations.length;
    $("iterationSlider").max = Math.max(1, state.iterations.length);
    $("saveExperiment").disabled = !state.valid || !storageAvailable;
    $("resetParameters").disabled = ["trapecio", "simpson"].includes(state.method);
    if ($("stepPanel").open && state.valid && state.iterations.length) selectStep(0);
    refreshComparison();
  }
  function selectX(x, deferred = false) {
    const snapshot = lab.state();
    if (![...interpolation, "derivadas"].includes(snapshot.method) || !Number.isFinite(x)) return;
    const bounded = Math.max(snapshot.xs[0], Math.min(snapshot.xs.at(-1), x));
    $("exploreXValue").textContent = number(bounded);
    lab.update("evalX", String(Number(bounded.toPrecision(12))), deferred);
  }
  function renderSaved(selected) {
    $("experimentList").replaceChildren();
    for (const item of saved) {
      const option = document.createElement("option"); option.value = item.id; option.textContent = item.name; $("experimentList").append(option);
    }
    if (selected) $("experimentList").value = selected;
    if (!saved.length) {
      const option = document.createElement("option"); option.textContent = "Todavía no hay experimentos"; option.value = ""; $("experimentList").append(option);
    }
    $("restoreExperiment").disabled = $("deleteExperiment").disabled = !saved.length;
  }
  function persist(next) {
    localStorage.setItem(storageKey, JSON.stringify(next));
    saved = next;
  }
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (!Array.isArray(parsed) || parsed.length > 5 || !parsed.every((item) => item && typeof item.id === "string" && typeof item.name === "string" && item.snapshot)) throw new Error("Formato no válido");
      saved = parsed;
    }
  } catch {
    storageAvailable = false;
    notice("No se pudieron abrir los experimentos guardados. El análisis sigue disponible; comprueba el almacenamiento del navegador.");
  }
  $("saveExperiment").addEventListener("click", () => {
    try {
      if (saved.length >= 5) throw new Error("Ya hay cinco experimentos. Elimina uno antes de guardar otro.");
      const snapshot = lab.capture();
      const id = String(Date.now()) + "-" + Math.random().toString(36).slice(2, 7);
      const item = { id, name: $("experimentName").value.trim() || lab.names[snapshot.method] + " · " + new Date().toLocaleString("es-CO"), snapshot };
      persist([...saved, item]); renderSaved(id);
      notice("Experimento guardado en este navegador.");
    } catch (error) { notice(error.message.includes("quota") ? "No hay espacio disponible para guardar más datos." : "No se pudo guardar: " + error.message); }
  });
  $("restoreExperiment").addEventListener("click", () => {
    try { const item = saved.find((item) => item.id === $("experimentList").value); if (!item) return; lab.restore(item.snapshot); notice("Restaurado: " + item.name + "."); }
    catch (error) { notice(error.message); }
  });
  $("deleteExperiment").addEventListener("click", () => {
    try {
      const index = saved.findIndex((item) => item.id === $("experimentList").value);
      if (index < 0) return;
      const removed = { item: saved[index], index };
      persist(saved.filter((_, i) => i !== index)); deletedExperiment = removed;
      renderSaved(); $("undoDeleteExperiment").hidden = false;
      notice("Experimento eliminado. Puedes deshacer la eliminación.");
    }
    catch { notice("No se pudo eliminar el experimento del almacenamiento."); }
  });
  $("undoDeleteExperiment").addEventListener("click", () => {
    if (!deletedExperiment) return;
    try {
      if (saved.length >= 5) throw new Error("Ya hay cinco experimentos. Libera un espacio para recuperar el eliminado.");
      const next = [...saved]; next.splice(Math.min(deletedExperiment.index, next.length), 0, deletedExperiment.item);
      persist(next); renderSaved(deletedExperiment.item.id); deletedExperiment = null;
      $("undoDeleteExperiment").hidden = true; notice("Experimento recuperado.");
    } catch (error) { notice(error.message); }
  });
  $("resetParameters").addEventListener("click", () => { lab.reset(); notice("Parámetros restablecidos para los datos actuales."); });
  $("exploreX").addEventListener("input", () => selectX(Number($("exploreX").value), true));
  $("exploreX").addEventListener("change", () => selectX(Number($("exploreX").value)));
  $("nodeSlider").addEventListener("input", () => { $("nodesHint").textContent = $("nodeSlider").value + " nodos"; lab.update("nNodes", $("nodeSlider").value, true); });
  $("nodeSlider").addEventListener("change", () => lab.update("nNodes", $("nodeSlider").value));
  $("allNodes").addEventListener("change", () => lab.update("nNodes", $("allNodes").checked ? "0" : String(Math.min(5, state.xs.length))));
  $("comparePanel").addEventListener("toggle", refreshComparison);
  $("compareMethod").addEventListener("change", refreshComparison);
  $("stepPanel").addEventListener("toggle", () => {
    if ($("stepPanel").open) selectStep(currentStep ?? 0); else { clearSteps(); decorations(); }
  });
  $("previousIteration").addEventListener("click", () => selectStep((currentStep ?? 0) - 1));
  $("nextIteration").addEventListener("click", () => selectStep((currentStep ?? -1) + 1));
  $("iterationSlider").addEventListener("input", () => selectStep(Number($("iterationSlider").value) - 1));
  $("playIterations").addEventListener("click", play);
  $("showFinalResult").addEventListener("click", () => {
    if (window.LabMotion) window.LabMotion.closeDetail($("stepPanel")); else $("stepPanel").open = false;
    clearSteps(); decorations(); $("stepPanel").querySelector("summary").focus();
  });
  $("stepPanel").querySelector("summary").addEventListener("click", () => {
    if ($("stepPanel").dataset.open === "false") { clearSteps(); decorations(); }
  });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stopPlayback(); });
  window.addEventListener("lab:themechange", () => { if (state) decorations(); });
  window.LabWorkbench = {
    selectX, onResult,
    reportContext: () => {
      stopPlayback();
      return {
        comparison: $("comparePanel").open && state?.valid && $("compareMethod").value ? [lab.compare(state.method), lab.compare($("compareMethod").value)] : [],
        step: currentStep !== null && $("stepPanel").open ? $("iterationDescription").textContent : null,
      };
    },
    beforeRun: () => { clearSteps(); comparison = null; notice(""); },
    pending: () => {
      clearSteps(); comparison = null;
      if (state) state.valid = false;
      $("saveExperiment").disabled = true;
      $("comparisonResult").replaceChildren();
      document.querySelectorAll(".export-bar button").forEach((button) => { button.disabled = true; });
      decorations();
    },
  };
  renderSaved(); onResult();
})();
