const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
(async () => {
  const dom = new JSDOM(fs.readFileSync(path.join(__dirname, "index.html"), "utf8"), { runScripts: "outside-only", pretendToBeVisual: true, url: "https://examples.test" });
  const w = dom.window, $ = (id) => w.document.getElementById(id);
  const failures = [];
  w.addEventListener("error", (event) => failures.push(event.error));
  w.matchMedia = (media) => ({ media, matches: false, addEventListener() {} });
  w.scrollTo = () => {}; w.alert = () => {};
  w.HTMLCanvasElement.prototype.getContext = function () {
    return this._ctx ||= { canvas: this, fillRect() {}, drawImage() {} };
  };
  const pixel = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aF5kAAAAASUVORK5CYII=";
  w.HTMLCanvasElement.prototype.toDataURL = () => pixel;
  w.Chart = function (context, config) { this.canvas = context.canvas; this.data = config.data; this.options = config.options; this.stop = () => {}; this.update = () => {}; };
  w.XLSX = {};
  const readers = [];
  w.FileReader = class {
    constructor() { this.readyState = 0; }
    readAsText() { this.readyState = 1; readers.push(this); }
    readAsArrayBuffer() { this.readAsText(); }
    abort() { this.readyState = 2; this.aborted = true; }
    complete(text) { this.readyState = 2; this.onload({ target: { result: text } }); }
  };
  let downloaded = null, downloadedBlob = null;
  w.URL.createObjectURL = (blob) => { downloadedBlob = blob; return "blob:report"; };
  w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { downloaded = this.download; };
  for (const script of ["theme.js", "app.js", "workbench.js", "report.js"]) w.eval(fs.readFileSync(path.join(__dirname, script), "utf8"));
  await new Promise((resolve) => setTimeout(resolve, 5));
  const lab = w.NumericalLab;
  let count = 0;
  const ok = (message) => { count++; console.log("OK   " + message); };
  const demo = (key) => { $("demoSelect").value = key; w.loadDemoCircuitData(); };

  demo("runge_uniform");
  assert.equal(lab.state().params.nNodes, 0);
  assert.equal(lab.state().xs.length, 21);
  lab.update("evalX", "0.95");
  const uniformError = lab.compare("lagrange").error;
  assert(uniformError > 1);
  assert($("demoObservation").textContent.includes("oscilaciones"));
  $("demoSelect").value = "runge_chebyshev";
  assert.equal(lab.capture().demo, "runge_uniform");
  demo("runge_chebyshev");
  lab.update("evalX", "0.95");
  assert(lab.compare("lagrange").error < uniformError / 10);
  assert.equal(lab.state().params.nNodes, 0);
  ok("Runge conserva las oscilaciones reales y Chebyshev cambia los nodos manteniendo función y grado");

  demo("irregular_cubic");
  assert.equal(lab.state().method, "simpson");
  assert.equal(lab.compare("simpson").exact, 4);
  assert($("howText").textContent.includes("no se garantiza"));
  assert(lab.state().xs.some((x, i, xs) => i > 1 && Math.abs((x - xs[i - 1]) - (xs[1] - xs[0])) > .01));
  ok("El ejemplo irregular usa la integral exacta y explica las condiciones de precisión");

  demo("newton_cycle");
  assert.equal(lab.state().primary.value, null);
  assert.equal(lab.state().iterations.length, 30);
  assert(Math.abs(lab.state().iterations[0].x - 1) < 1e-7);
  assert(Math.abs(lab.state().iterations[1].x) < 1e-7);
  $("comparePanel").open = true;
  $("compareMethod").value = "biseccion";
  $("compareMethod").dispatchEvent(new w.Event("change"));
  assert($("comparisonResult").textContent.includes("Sin convergencia"));
  assert(Number.isFinite(lab.compare("biseccion").value));
  assert(lab.state().chart.data.datasets.some((series) => series.id === "tool-comparison"));
  ok("La no convergencia didáctica se conserva y puede compararse con una solución convergente");

  let html = w.LabReport.build().html;
  let report = new JSDOM(html);
  assert(report.window.document.body.textContent.includes("Sin resultado"));
  assert(report.window.document.body.textContent.includes("La diferencia no se calcula"));
  assert(report.window.document.querySelectorAll('img[src^="data:image/png"]').length >= 1);
  assert(report.window.document.body.textContent.includes("Comparación de métodos"));
  assert(report.window.document.body.textContent.includes("Cálculos e iteraciones"));
  assert(report.window.document.body.textContent.includes("Datos originales"));
  report.window.close();
  ok("El informe incluye comparación, gráficas y tablas sin inventar un resultado para un método fallido");

  $("saveExperiment").click();
  const id = $("experimentList").value;
  $("deleteExperiment").click();
  assert.equal(JSON.parse(w.localStorage.getItem("numerical-lab-experiments-v1")).length, 0);
  assert(!$("undoDeleteExperiment").hidden);
  $("undoDeleteExperiment").click();
  assert.equal($("experimentList").value, id);
  assert.equal(JSON.parse(w.localStorage.getItem("numerical-lab-experiments-v1")).length, 1);
  assert($("undoDeleteExperiment").hidden);
  ok("Deshacer recupera el experimento eliminado y su identificador original");

  demo("runge_uniform");
  $("fExpr").value = "x+17"; $("rootTol").value = "0.000003";
  lab.reset();
  assert.equal($("fExpr").value, "x+17");
  assert.equal($("rootTol").value, "0.000003");
  assert.equal($("evalX").value, "0");
  assert.equal($("nNodes").value, "5");
  ok("Restablecer cambia solamente los parámetros del método activo");

  demo("rc_carga");
  const initialData = JSON.stringify(lab.capture());
  const exact = lab.compare("lagrange").exact;
  w.readDataFile({ name: "invalid.csv" });
  assert($("fileReadStatus").textContent.includes("Leyendo"));
  assert.equal($("excelFileInput").getAttribute("aria-busy"), "true");
  readers.at(-1).complete("bad,header\nnot,numeric\nstill,invalid");
  assert.equal(JSON.stringify(lab.capture()), initialData);
  assert.equal(lab.compare("lagrange").exact, exact);
  assert.equal($("excelFileInput").getAttribute("aria-busy"), "false");
  assert(!$("fileError").hidden);
  ok("Un archivo inválido conserva datos, fuente y referencia analítica del análisis anterior");

  w.readDataFile({ name: "first.csv" }); const first = readers.at(-1);
  w.readDataFile({ name: "latest.csv" }); const latest = readers.at(-1);
  assert(first.aborted);
  latest.complete("t,v\n0,2\n1,3\n2,4");
  first.complete("t,v\n0,99\n1,99\n2,99");
  assert.equal(lab.state().ys[0], 2);
  assert.equal($("sourceName").textContent, "latest.csv");
  assert.equal(lab.compare("lagrange").exact, null);
  assert.equal($("fileReadStatus").textContent, "");
  ok("La última selección de archivo gana aunque una lectura anterior termine después");

  w.readDataFile({ name: "late.csv" }); const late = readers.at(-1);
  demo("runge_chebyshev");
  late.complete("x,y\n0,999\n1,999");
  assert.equal(lab.capture().demo, "runge_chebyshev");
  assert.equal(lab.state().xs.length, 21);
  ok("Cargar un ejemplo cancela una importación pendiente sin sobrescribir el ejemplo");

  const snapshot = JSON.parse(JSON.stringify(lab.capture()));
  snapshot.source = '<img src=x onerror="alert(1)">';
  snapshot.xLabel = '<script>alert(2)</script>';
  snapshot.demo = null;
  snapshot.method = "trapecio";
  snapshot.xs = [0, 1, 2]; snapshot.ys = [0.123456789012345, 1, 2];
  lab.restore(snapshot);
  $("comparePanel").open = false;
  html = w.LabReport.build().html;
  report = new JSDOM(html);
  assert.equal(report.window.document.querySelector("script"), null);
  assert.equal(report.window.document.querySelector('img[src="x"]'), null);
  assert(report.window.document.body.textContent.includes("0.123456789012345"));
  assert.equal(report.window.document.querySelectorAll('link[href],img[src^="http"],script[src]').length, 0);
  assert(report.window.document.body.textContent.includes("guardar como PDF"));
  report.window.close();
  fs.mkdirSync(path.join(__dirname, "output"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "output", "report-regression.html"), html);
  ok("El informe conserva la precisión, escapa el contenido de archivos y funciona sin recursos externos");

  w.LabReport.download();
  assert.equal(downloaded, "informe_trapecio.html");
  assert(downloadedBlob.type.startsWith("text/html"));
  assert($("workbenchNotice").textContent.includes("guardar como PDF"));
  ok("La descarga entrega un informe HTML con opción de impresión o PDF");

  const originalImage = w.HTMLCanvasElement.prototype.toDataURL;
  w.HTMLCanvasElement.prototype.toDataURL = () => { throw new Error("Canvas unavailable"); };
  html = w.LabReport.build().html;
  assert(html.includes("no se pudo incluir la imagen"));
  assert(html.includes("0.123456789012345"));
  w.HTMLCanvasElement.prototype.toDataURL = originalImage;
  ok("Un fallo al capturar la gráfica se indica y no elimina los datos del informe");

  w.runMethod("lagrange");
  lab.update("evalX", "");
  assert.throws(() => w.LabReport.build());
  assert($("downloadReport").disabled);
  assert.equal(failures.length, 0);
  ok("El informe queda bloqueado si los parámetros aún no representan un cálculo válido");
  w.close();
  console.log(`\n${count} escenarios de aportes y correcciones correctos`);
})().catch((error) => { console.error(error); process.exitCode = 1; });
