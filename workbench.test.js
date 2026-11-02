const assert = require("node:assert/strict");
const fs = require("node:fs");
const { JSDOM } = require("jsdom");
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
(async () => {
  const dom = new JSDOM(fs.readFileSync("index.html", "utf8"), { runScripts: "outside-only", pretendToBeVisual: true, url: "https://lab.example" });
  const w = dom.window, $ = (id) => w.document.getElementById(id);
  const errors = [];
  w.addEventListener("error", (event) => errors.push(event.error));
  w.matchMedia = (media) => ({ matches: false, media, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  w.scrollTo = () => {}; w.alert = () => {};
  w.HTMLCanvasElement.prototype.getContext = () => ({});
  w.Chart = function (_, config) {
    this.type = config.type; this.data = config.data; this.options = config.options;
    this.update = () => {}; this.stop = () => {}; this.destroy = () => {};
    this.isPointInArea = ({ x }) => x >= 0 && x <= 100;
    this.scales = { x: { getValueForPixel: (x) => x / 10 } };
  };
  w.XLSX = {};
  for (const script of ["libs/gsap.min.js", "theme.js", "motion.js", "app.js", "workbench.js"]) w.eval(fs.readFileSync(script, "utf8"));
  await wait(10);
  const lab = w.NumericalLab;
  let count = 0;
  const ok = (message) => { count++; console.log("OK   " + message); };

  w.LabWorkbench.selectX(1.25);
  assert.equal($("evalX").value, "1.25");
  assert.equal(lab.state().params.xEval, 1.25);
  assert(lab.state().valid);
  lab.state().chart.options.onClick({ x: 15, y: 10 }, [], lab.state().chart);
  assert.equal(lab.state().params.xEval, 1.5);
  lab.state().chart.options.onClick({ x: 999, y: 10 }, [], lab.state().chart);
  assert.equal(lab.state().params.xEval, 1.5);
  ok("Elegir X enlaza gráfica, campo y cálculo; ignora clics fuera del área");

  $("nodeSlider").value = "4";
  $("nodeSlider").dispatchEvent(new w.Event("change"));
  assert.equal(lab.state().selected.xs.length, 4);
  assert.equal(lab.state().chart.data.datasets.find((s) => s.id === "tool-nodes").data.length, 4);
  $("allNodes").checked = true;
  $("allNodes").dispatchEvent(new w.Event("change"));
  assert(lab.state().selected.all);
  assert.equal($("nNodes").value, "0");
  assert($("nodeSlider").disabled);
  ok("El deslizador selecciona nodos reales y permite volver a todos");

  lab.update("evalX", "");
  assert.equal(lab.state().valid, false);
  assert.equal(lab.state().primary.value, null);
  assert.equal($("evalX").value, "");
  assert.equal($("evalX").getAttribute("aria-invalid"), "true");
  assert($("evalXError").textContent);
  assert($("saveExperiment").disabled);
  assert.throws(() => lab.capture());
  lab.update("evalX", "1.5");
  assert(lab.state().valid);
  assert.equal($("evalX").getAttribute("aria-invalid"), null);
  assert(!$("evalX").getAttribute("aria-describedby")?.includes("evalXError"));
  ok("La entrada inválida se conserva, detiene el cálculo y se recupera al corregirla");

  const snapshot = JSON.parse(JSON.stringify(lab.capture()));
  Object.assign(snapshot, { xs: [0, 1, 2, 3], ys: [0, 1, 4, 9], demo: null, method: "lagrange" });
  Object.assign(snapshot.params, { evalX: "1.5", nNodes: "3", rootA: "0", rootB: "3", rootTol: "0.000001", targetY: "2", fExpr: "x^2" });
  lab.restore(snapshot);
  const before = $("primaryValue").textContent;
  $("comparePanel").open = true;
  $("compareMethod").value = "newton_dd";
  $("compareMethod").dispatchEvent(new w.Event("change"));
  assert.equal(lab.compare("newton_dd").value, 2.25);
  assert.equal($("primaryValue").textContent, before);
  assert.equal(lab.state().method, "lagrange");
  assert(lab.state().chart.data.datasets.some((s) => s.id === "tool-comparison"));
  assert.throws(() => lab.compare("trapecio"));
  ok("La comparación usa el mismo cálculo y mantiene método, resultado y unidades");

  w.runMethod("trapecio");
  assert.equal(lab.compare("trapecio").value, 9.5);
  assert.equal(lab.compare("simpson").value, 9);
  assert.equal(lab.state().chart.data.datasets.filter((s) => s.id === "tool-comparison").length, 1);
  ok("Trapecio y Simpson se comparan sin acumular curvas ni alterar integrales");

  $("evalX").value = ""; // Hidden and irrelevant to roots.
  w.runMethod("biseccion");
  assert(lab.state().valid);
  assert(Math.abs(lab.state().primary.value - Math.SQRT2) < 1e-6);
  assert(Math.abs(lab.compare("newton_raphson").value - Math.SQRT2) < 1e-6);
  assert(Math.abs(lab.compare("secante").value - Math.SQRT2) < 1e-6);
  assert.equal($("evalX").getAttribute("aria-invalid"), null);
  ok("Solo se validan parámetros activos y las raíces comparten el algoritmo de comparación");

  const final = $("primaryValue").textContent;
  $("stepPanel").open = true;
  await wait(10);
  $("iterationSlider").value = "3";
  $("iterationSlider").dispatchEvent(new w.Event("input"));
  const step = lab.state().iterations[2];
  const rendered = lab.state().chart.data.datasets.find((s) => s.id === "tool-step-point");
  assert.equal(rendered.data[0].x, step.xr);
  assert.equal(rendered.data[0].y, step.fxr);
  assert.equal(w.document.querySelector('#methodTable tbody tr[aria-current="step"]').rowIndex, 3);
  assert.equal($("primaryValue").textContent, final);
  const retained = rendered;
  $("nextIteration").click();
  assert.equal(lab.state().chart.data.datasets.find((s) => s.id === "tool-step-point"), retained);
  ok("Cada paso reproduce la iteración registrada, destaca su fila y conserva el resultado final");

  w.gsap.globalTimeline.timeScale(50);
  $("playIterations").click();
  assert.equal($("playIterations").getAttribute("aria-pressed"), "true");
  await wait(50);
  $("playIterations").click();
  const paused = $("iterationSlider").value;
  await wait(40);
  assert.equal($("iterationSlider").value, paused);
  $("playIterations").click();
  lab.update("targetY", "3");
  assert.equal($("playIterations").getAttribute("aria-pressed"), "false");
  assert.equal($("iterationSlider").value, "1");
  ok("La reproducción se puede pausar y se cancela al recalcular parámetros");

  for (const method of ["newton_raphson", "secante"]) {
    w.runMethod(method);
    await wait(5);
    $("iterationSlider").value = "1";
    $("iterationSlider").dispatchEvent(new w.Event("input"));
    assert(lab.state().chart.data.datasets.find((s) => s.id === "tool-step-line"));
    assert(Number.isFinite(lab.state().iterations[0].y));
  }
  $("showFinalResult").click();
  assert(!lab.state().chart.data.datasets.some((s) => s.id?.startsWith("tool-step")));
  $("stepPanel").querySelector("summary").click();
  await wait(10);
  assert($("stepPanel").open);
  assert.equal($("stepPanel").querySelector("summary").getAttribute("aria-expanded"), "true");
  ok("Newton y Secante muestran sus rectas reales y permiten volver a la vista final");

  $("experimentName").value = "Ensayo <b>exacto</b>";
  $("saveExperiment").click();
  const savedValue = lab.state().primary.value;
  const savedData = JSON.stringify(lab.state().xs);
  assert.equal($("experimentList").options[0].textContent, "Ensayo <b>exacto</b>");
  assert.equal($("experimentList").querySelector("b"), null);
  assert.equal(JSON.parse(w.localStorage.getItem("numerical-lab-experiments-v1")).length, 1);
  lab.update("targetY", "4");
  $("restoreExperiment").click();
  assert.equal(lab.state().primary.value, savedValue);
  assert.equal(JSON.stringify(lab.state().xs), savedData);
  assert.equal($("targetY").value, "3");
  ok("Guardar y restaurar conserva datos, función, método y precisión numérica");

  for (let i = 0; i < 4; i++) $("saveExperiment").click();
  $("saveExperiment").click();
  assert.equal(JSON.parse(w.localStorage.getItem("numerical-lab-experiments-v1")).length, 5);
  assert($("workbenchNotice").textContent.includes("cinco"));
  $("deleteExperiment").click();
  assert.equal(JSON.parse(w.localStorage.getItem("numerical-lab-experiments-v1")).length, 4);
  ok("El límite de sesiones no sobrescribe experimentos y su eliminación es explícita");

  const corrupted = JSON.parse(JSON.stringify(lab.capture()));
  corrupted.xs[1] = corrupted.xs[0];
  const beforeCorrupt = JSON.stringify(lab.state().xs);
  assert.throws(() => lab.restore(corrupted));
  assert.equal(JSON.stringify(lab.state().xs), beforeCorrupt);
  ok("Una sesión corrupta se rechaza antes de modificar los datos actuales");

  lab.update("rootTol", "-1");
  assert(!lab.state().valid);
  assert.equal($("rootTol").value, "-1");
  $("resetParameters").click();
  assert(lab.state().valid);
  assert.equal($("rootTol").value, "0.0001");
  assert.equal($("fExpr").value, "");
  ok("Restablecer recupera parámetros válidos sin cambiar los datos");

  lab.update("fExpr", "window.alert(1)");
  assert(!lab.state().valid);
  assert.equal($("fExpr").getAttribute("aria-invalid"), "true");
  w.runMethod("trapecio");
  assert(lab.state().valid);
  assert.equal($("fExpr").getAttribute("aria-invalid"), null);
  assert.equal(errors.length, 0);
  ok("Una función inválida no se sustituye y no afecta a métodos que no la usan");
  w.gsap.globalTimeline.clear(); w.gsap.ticker.sleep(); w.close();
  console.log(`\n${count} escenarios de interacción correctos`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
