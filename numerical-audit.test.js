const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const repo = __dirname;
const { JSDOM } = require(path.join(repo, "node_modules/jsdom"));
const dom = new JSDOM(fs.readFileSync(path.join(repo, "index.html"), "utf8"), { runScripts: "outside-only", pretendToBeVisual: true, url: "https://audit.example" });
const w = dom.window;
w.Chart = function (_, config) { this.data = config.data; this.options = config.options; this.update = () => {}; this.stop = () => {}; this.destroy = () => {}; };
w.XLSX = {}; w.scrollTo = () => {}; w.alert = () => {};
w.HTMLCanvasElement.prototype.getContext = () => ({});
w.eval(fs.readFileSync(path.join(repo, "app.js"), "utf8"));
const lab = w.NumericalLab;
const template = JSON.parse(JSON.stringify(lab.capture()));
const records = [];
function near(actual, expected, tolerance = 1e-9) {
  assert(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `observado ${actual}; esperado ${expected}; tolerancia ${tolerance}`);
}
function check(group, name, fn) {
  try { fn(); records.push({ group, name, pass: true }); }
  catch (error) { records.push({ group, name, pass: false, error: error.message }); console.log("FALLO", group, name, error.message); }
}
function load(method, xs, ys, params = {}) {
  lab.restore({ ...template, method, xs, ys, xLabel: "Tiempo (s)", yLabel: "Voltaje (V)", demo: null,
    params: { evalX: "0.75", nNodes: "0", targetY: "0", rootTol: "0.00000001", rootA: "", rootB: "", fExpr: "", ...params } });
  assert(lab.state().valid, "La entrada de prueba debería ser válida");
  return lab.state();
}
const grid = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => a + (b - a) * i / n);
const poly = (coefficients, x) => coefficients.reduceRight((value, coefficient) => value * x + coefficient, 0);

// Interpolation checks use small known polynomials, deliberately excluding high-degree instability.
for (const method of ["lagrange", "newton_dd", "matricial"]) {
  for (let degree = 1; degree <= 5; degree++) {
    const xs = [-1.4, -0.3, 0.45, 1.2, 2.1, 3.0].slice(0, degree + 1);
    const coefficients = [1, -2, 0.7, 1.1, -0.2, 0.03].slice(0, degree + 1);
    const ys = xs.map((x) => poly(coefficients, x));
    for (const x of [xs[0], (xs[0] + xs.at(-1)) / 2, xs.at(-1)]) {
      check(method, `Polinomio grado ${degree} en X=${x}`, () => near(load(method, xs, ys, { evalX: String(x) }).primary.value, poly(coefficients, x), 1e-8));
    }
  }
  check(method, "Dos puntos reproducen una recta", () => near(load(method, [2, 5], [7, 16], { evalX: "3" }).primary.value, 10));
}

check("splines", "Dos puntos forman una recta", () => near(load("splines", [2, 5], [7, 16], { evalX: "3" }).primary.value, 10));
check("splines", "Referencia exacta natural de tres nodos", () => near(load("splines", [0, 1, 2], [0, 1, 0], { evalX: "0.5" }).primary.value, 0.6875));
check("splines", "Integración de referencia natural", () => near(w.integrateSpline(w.buildNaturalCubicSplines([0, 1, 2], [0, 1, 0])), 1.25));
const splineX = [-1, -0.4, 0.8, 1.3, 2.5], splineY = [1, 0.3, 2, -1, 0.5];
const pieces = w.buildNaturalCubicSplines(splineX, splineY);
for (let i = 0; i < splineX.length; i++) check("splines", `Interpola nodo ${i}`, () => near(w.evaluateSpline(splineX[i], pieces), splineY[i]));
for (let i = 0; i < pieces.length - 1; i++) {
  const left = pieces[i], right = pieces[i + 1], h = left.x1 - left.x0;
  check("splines", `Continuidad C1 en unión ${i}`, () => near(left.b + 2 * left.c * h + 3 * left.d * h * h, right.b));
  check("splines", `Continuidad C2 en unión ${i}`, () => near(2 * left.c + 6 * left.d * h, 2 * right.c));
}
check("splines", "Condición natural en ambos extremos", () => {
  near(2 * pieces[0].c, 0);
  const last = pieces.at(-1); near(2 * last.c + 6 * last.d * (last.x1 - last.x0), 0);
});

for (const xs of [[0, 0.3, 0.8, 1.7, 3], [0, 0.5, 1, 1.5, 2]]) {
  const ys = xs.map((x) => 3 * x * x - x + 2);
  const derivatives = w.computeDerivatives(xs, ys);
  xs.forEach((x, i) => check("derivadas", `Parábola en nodo ${x} (${xs[1]})`, () => near(derivatives[i].dy, 6 * x - 1)));
}
check("derivadas", "Dos puntos usan pendiente de recta", () => {
  const values = w.computeDerivatives([1, 3], [4, 10]); near(values[0].dy, 3); near(values[1].dy, 3);
});
check("derivadas", "Interfaz selecciona nodo más cercano", () => near(load("derivadas", [0, 0.4, 1, 2], [2, 2.08, 4, 12], { evalX: "0.9" }).primary.value, 5));

for (const xs of [[0, 0.4, 1, 2], grid(-1, 2, 10)]) {
  check("trapecio", "Recta exacta en malla " + xs.length, () => {
    const ys = xs.map((x) => 2 * x + 1);
    near(load("trapecio", xs, ys).primary.value, (xs.at(-1) ** 2 + xs.at(-1)) - (xs[0] ** 2 + xs[0]));
  });
}
check("trapecio", "Error conocido para x² con n=10", () => near(load("trapecio", grid(0, 1, 10), grid(0, 1, 10).map((x) => x * x)).primary.value, 1 / 3 + 1 / 600));
check("trapecio", "Área con signo negativa", () => near(load("trapecio", [0, 1, 2], [-1, -1, -1]).primary.value, -2));
for (const n of [2, 3, 4, 5, 8, 9]) {
  const xs = grid(0, 2, n);
  check("simpson", `Cúbica exacta, ${n} intervalos (1/3 y 3/8)`, () => near(load("simpson", xs, xs.map((x) => x ** 3)).primary.value, 4, 1e-9));
}
check("simpson", "Malla irregular, parábola exacta", () => {
  const xs = [0, 0.2, 0.8, 1.3, 2.1]; near(load("simpson", xs, xs.map((x) => x * x)).primary.value, 2.1 ** 3 / 3);
});
check("simpson", "Cuatro nodos irregulares, cúbica integrada", () => {
  const xs = [0, 0.2, 0.8, 2]; near(load("simpson", xs, xs.map((x) => x ** 3)).primary.value, 4);
});
check("simpson", "Dos puntos usan trapecio identificado en tabla", () => {
  near(load("simpson", [0, 1], [0, 1]).primary.value, .5); assert(w.document.getElementById("methodTable").textContent.includes("Trapecio"));
});

for (const method of ["grafico", "biseccion", "newton_raphson", "secante"]) {
  const xs = grid(0, 2, 20);
  check(method, "Raíz simple conocida de función exacta", () => near(load(method, xs, xs.map((x) => x * x), { fExpr: "x^2", targetY: "2" }).primary.value, Math.SQRT2, method === "grafico" ? 1e-4 : 1e-7));
  check(method, "Raíz de spline lineal con objetivo distinto de cero", () => near(load(method, [0, 1, 2], [1, 3, 5], { targetY: "2.5" }).primary.value, .75, method === "grafico" ? 1e-4 : 1e-7));
  check(method, "Rechaza ausencia de raíz en x²+1", () => assert.equal(load(method, xs, xs.map((x) => x * x + 1), { fExpr: "x^2+1" }).primary.value, null));
  check(method, "Raíz en extremo izquierdo", () => near(load(method, [0, 1, 2], [0, 1, 2], { fExpr: "x" }).primary.value, 0, 1e-7));
  check(method, "Raíz en extremo derecho", () => near(load(method, [0, 1, 2], [-2, -1, 0], { fExpr: "x-2" }).primary.value, 2, 1e-7));
}
check("grafico", "Detecta dos raíces en dominio", () => near(load("grafico", [-2, -1, 0, 1, 2], [3, 0, -1, 0, 3], { fExpr: "x^2-1" }).primary.value, 2));
check("newton_raphson", "Informa no convergencia en ciclo de Newton", () => assert.equal(load("newton_raphson", [-2, -1, 0, 1, 2], [-2, 3, 2, 1, 6], { fExpr: "x^3-2*x+2" }).primary.value, null));

// Robustness findings are independent of Runge oscillations or high-degree conditioning.
for (const method of ["newton_raphson", "secante"]) {
  check("robustez", method + ": exp(20*x)+1 nunca vale cero", () => {
    const result = load(method, [0, .5, 1], [2, Math.exp(10) + 1, Math.exp(20) + 1], { fExpr: "exp(20*x)+1", rootTol: "0.000001" });
    assert.equal(result.primary.value, null, `Se anunció raíz ${result.primary.value}, residuo ${Math.exp(20 * result.primary.value) + 1}`);
  });
}
check("robustez", "Newton reconoce raíz inicial exacta aunque la pendiente sea cero", () => {
  near(load("newton_raphson", [0, 1, 2], [1, 0, 1], { fExpr: "(x-1)^2", rootTol: "0.000001" }).primary.value, 1);
});
for (const method of ["grafico", "biseccion", "newton_raphson", "secante"]) {
  check("robustez", method + ": no anuncia un polo como raíz", () => {
    const result = load(method, [0, .25, .75, 1], [-2, -4, 4, 2], { fExpr: "1/(x-0.5)", rootTol: "0.000001" });
    assert.equal(result.primary.value, null, `Se anunció raíz ${result.primary.value}; resumen: ${w.document.getElementById("methodSummary").textContent}`);
  });
}

for (const method of ["lagrange", "newton_dd", "matricial"]) {
  check("seleccion_nodos", method + ": dos nodos realmente más cercanos en malla irregular", () => {
    const result = load(method, [0, 1, 2, 100], [0, 1, 4, 10000], { evalX: "2.1", nNodes: "2" });
    assert.deepEqual(Array.from(result.selected.xs), [1, 2], "Nodos seleccionados: " + result.selected.xs.join(", ") + "; resultado: " + result.primary.value);
    near(result.primary.value, 4.3);
  });
}
check("referencia", "Una función escrita por el usuario no hereda el residuo analítico de la demo", () => {
  lab.restore({ ...template, method: "newton_raphson", params: { ...template.params, targetY: "2", rootTol: "0.000001", rootA: "", rootB: "", fExpr: "x+1" } });
  const text = w.document.getElementById("methodSummary").textContent;
  assert(!/solución analítica/i.test(text), "Se mostró una referencia de la demo para otra función: " + text);
});

const report = { date: new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }), sourceVersion: "working tree", tested: records.length, passed: records.filter((r) => r.pass).length, failed: records.filter((r) => !r.pass).length,
  scope: "Kernel matemático e interfaz de cálculo en DOM simulado; sin inspección de gráficas renderizadas. Excluye penalizaciones por grado alto y no convergencia didáctica esperada.", records };
fs.mkdirSync(path.join(__dirname, "output"), { recursive: true });
fs.writeFileSync(path.join(__dirname, "output", "numerical-audit-results.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ tested: report.tested, passed: report.passed, failed: report.failed, groups: Object.fromEntries([...new Set(records.map((r) => r.group))].map((group) => [group, { total: records.filter((r) => r.group === group).length, failed: records.filter((r) => r.group === group && !r.pass).length }])) }, null, 2));
w.close();
process.exit(report.failed ? 1 : 0);
