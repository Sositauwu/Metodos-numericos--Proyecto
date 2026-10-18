// Pruebas automáticas de los métodos numéricos. Uso:  npm i jsdom && node tests/test.js
const { JSDOM } = require('jsdom');
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8')
  .replace(/<script src="[^"]*"><\/script>/g, '')
  .replace(/<script>if \(typeof (XLSX|Chart)[^<]*<\/script>/g, '')
  .replace(/<link[^>]*stylesheet[^>]*>/g, '');
const dom = new JSDOM(html, {
  runScripts: 'outside-only', pretendToBeVisual: true,
});
const w = dom.window;
w.Chart = function () { this.destroy = () => {}; };
w.XLSX = {};
w.HTMLCanvasElement.prototype.getContext = () => ({});
w.scrollTo = () => {}; w.alert = () => {};
w.eval(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));

let pass = 0, fail = 0;
const ev = code => w.eval(code);
function check(name, got, want, tol = 1e-9) {
  const ok = typeof want === 'boolean' ? got === want : Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  console.log((ok ? 'OK   ' : 'FAIL ') + name + (ok ? '' : `  → obtenido ${got}, esperado ${want}`));
  ok ? pass++ : fail++;
}
const mesh = (f, a, b, n) => { const xs = [], ys = []; for (let i = 0; i <= n; i++) { const x = a + (b - a) * i / n; xs.push(x); ys.push(f(x)); } return { xs, ys }; };
w.__m = mesh;

// Integración
ev(`var Q = __m(x => x*x, 0, 1, 10)`);
check('Trapecio ∫x² [0,1] (n=10) ≈ 1/3 (error O(h²))', ev('computeTrapezoidalRule(Q.xs, Q.ys).totalArea'), 1/3, 2e-3);
check('Simpson 1/3 exacto para x² (n=10)', ev('computeSimpson(Q.xs, Q.ys, buildNaturalCubicSplines(Q.xs, Q.ys)).discreteIntegral'), 1/3, 1e-12);
ev(`var Q3 = __m(x => x*x*x, 0, 2, 9)`);   // n=9 impar → usa Simpson 3/8 al final
check('Simpson (1/3 + 3/8) exacto para x³ (n impar)', ev('computeSimpson(Q3.xs, Q3.ys, buildNaturalCubicSplines(Q3.xs, Q3.ys)).discreteIntegral'), 4, 1e-12);
check('Se usó Simpson 3/8 con n impar', ev('computeSimpson(Q3.xs, Q3.ys, buildNaturalCubicSplines(Q3.xs, Q3.ys)).used38'), true);
ev(`var QN = { xs: [0, 0.3, 0.5, 1.1, 1.4], ys: [0, 0.3, 0.5, 1.1, 1.4].map(x => x*x) }`);
check('Simpson generalizado en malla no uniforme, x² exacto', ev('computeSimpson(QN.xs, QN.ys, buildNaturalCubicSplines(QN.xs, QN.ys)).discreteIntegral') , 1.4 ** 3 / 3, 1e-9);

// Interpolación (cúbica exacta con 4 nodos)
ev(`var C = { xs: [0, 1, 2.5, 4], ys: [0, 1, 2.5, 4].map(x => x*x*x - 2*x + 1) }`);
const fc = x => x*x*x - 2*x + 1;
check('Lagrange reproduce una cúbica en x=1.7', ev('evaluateLagrange(1.7, C.xs, C.ys)'), fc(1.7), 1e-10);
check('Newton (dif. divididas) = Lagrange', ev('evaluateNewtonPoly(1.7, C.xs, computeNewtonDividedDiffTable(C.xs, C.ys))'), fc(1.7), 1e-10);
check('Matricial (Vandermonde) = Lagrange', ev('evaluateMatrixPoly(1.7, computeMatrixPolynomial(C.xs, C.ys))'), fc(1.7), 1e-10);
check('Spline pasa por un nodo', ev('evaluateSpline(2.5, buildNaturalCubicSplines(C.xs, C.ys))'), fc(2.5), 1e-12);

// Derivación (3 puntos, malla no uniforme, exacta para parábolas)
ev(`var D = { xs: [0, 0.4, 0.5, 1.2, 2], ys: [0, 0.4, 0.5, 1.2, 2].map(x => 3*x*x - x) }`);
const dd = ev('computeDerivatives(D.xs, D.ys)');
check('Derivada centrada exacta en nodo interior (6x−1 en 0.5)', dd[2].dy, 2, 1e-10);
check('Derivada unilateral 3 pts exacta en el extremo izq. (−1)', dd[0].dy, -1, 1e-10);
check('Derivada unilateral 3 pts exacta en el extremo der. (11)', dd[4].dy, 11, 1e-10);

// Función del usuario
check('f(x) = x^2 + 1 en x=3', ev(`compileUserFunction('x^2 + 1').fn(3)`), 10);
check('f(x) con notación 1e-3', ev(`compileUserFunction('1e-3*x').fn(2)`), 0.002, 1e-12);
check('f(x) con sen() y pi', ev(`compileUserFunction('sen(pi/2)*x').fn(4)`), 4, 1e-12);
check('Rechaza código arbitrario (process/window)', ev(`compileUserFunction('window.alert(1)').fn === null`), true);
check('Rechaza constructor/llamadas ajenas', ev(`compileUserFunction('constructor("return 1")()').fn === null`), true);
check('Expresión vacía → usa spline (fn null, sin error)', ev(`var r = compileUserFunction('  '); r.fn === null && r.error === null`), true);

// Métodos de raíces vía interfaz (demo carga RC: f(x) = 5(1 − e^(−x/1.2)), raíz de f=3 en x = 1.1001...)
ev(`loadDemoCircuitData()`);
const exact = -1.2 * Math.log(1 - 3 / 5);
for (const m of ['biseccion', 'newton_raphson', 'secante']) {
  ev(`runMethod('${m}')`);
  const txt = w.document.getElementById('methodSummary').textContent;
  const x = parseFloat((txt.match(/x = ([0-9.]+)/) || [])[1]);
  check(`${m}: raíz sobre el spline ≈ ${exact.toFixed(4)}`, x, exact, 5e-3);
}
ev(`document.getElementById('fExpr').value = '5*(1-exp(-x/1.2))'; document.getElementById('rootTol').value = '1e-10'`);
for (const m of ['biseccion', 'newton_raphson', 'secante']) {
  ev(`runMethod('${m}')`);
  const txt = w.document.getElementById('methodSummary').textContent;
  const x = parseFloat((txt.match(/x = ([0-9.]+)/) || [])[1]);
  check(`${m}: raíz con f(x) exacta = ${exact.toFixed(6)}`, x, exact, 1e-6);
}
ev(`document.getElementById('fExpr').value = 'x^2'; document.getElementById('targetY').value = '2'; runMethod('biseccion')`);
check('Bisección con f(x)=x² y Yref=2 → √2', parseFloat((w.document.getElementById('methodSummary').textContent.match(/x = ([0-9.]+)/) || [])[1]), Math.SQRT2, 1e-5);

console.log(`\n${pass} correctas, ${fail} fallidas`);
process.exit(fail ? 1 : 0);
