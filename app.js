const $ = (id) => document.getElementById(id);

if (typeof Chart !== "undefined" && Chart.defaults) {
  Chart.defaults.font.family = "Manrope, Segoe UI, sans-serif";
  Chart.defaults.font.size = 11;
  Chart.defaults.color = "#52647a";
  Chart.defaults.borderColor = "#e8edf4";
  // Cada instancia define su duración sin desactivar los interpoladores globales.
}

let primaryResult = null;
function resultUnit(kind = "value") {
  const unitOf = (name) => /\(([^)]+)\)/.exec(name)?.[1] || "";
  const x = unitOf(colXName),
    y = unitOf(colYName);
  return kind === "root"
    ? x
    : kind === "derivative"
      ? x && y
        ? `${y}/${x}`
        : ""
      : kind === "integral"
        ? x && y
          ? `${y}·${x}`
          : ""
        : y;
}
function setPrimaryResult(value, label, context = "", kind = "value") {
  const valid = Number.isFinite(value);
  const fixed = valid ? value.toFixed(6) : "";
  const scientific =
    valid &&
    kind !== "count" &&
    (fixed.length > 9 || (value !== 0 && Math.abs(value) < 1e-5));
  primaryResult = {
    value: valid ? value : null,
    label,
    context,
    unit: valid && kind !== "count" ? resultUnit(kind) : "",
  };
  $("primaryLabel").textContent = label;
  $("primaryValue").textContent = valid
    ? kind === "count"
      ? String(value)
      : scientific
        ? value.toExponential(5)
        : fixed
    : kind === "root"
      ? "Sin raíz"
      : "Sin resultado";
  $("primaryValue").classList.toggle("scientific", scientific);
  $("primaryValue").dataset.value = valid ? String(value) : "";
  $("primaryUnit").textContent = primaryResult.unit;
  $("primaryContext").textContent = context;
  $("primarySign").hidden = !valid || kind === "count" || scientific;
  $("primaryResult").dataset.status = valid ? "success" : "error";
}

function showFileError(message) {
  $("fileError").textContent = message;
  $("fileError").hidden = !message;
  if (message) window.LabMotion?.reveal($("fileError"));
}

let xData = [];
let yData = [];
let colXName = "X (Variable Indep.)";
let colYName = "Y (Variable Dep.)";
let chartInstance = null;
let convChartInstance = null;
let currentMethod = "lagrange";
let lastRows = null; // filas crudas del último archivo / demo (para re-elegir columnas)
let colIdxX = 0,
  colIdxY = 1; // columnas elegidas
let currentDemoKey = null;
let currentAnalytic = null; // solución analítica del demo activo (null si se cargó un archivo)
let lastTable = null; // tabla del método (valores crudos, sin redondear) para exportar a Excel
let P = null; // parámetros validados de la última ejecución
let lastIterations = [];
let lastRunValid = false;

// =========================================================================
// 1. LECTURA DE ARCHIVO EXCEL / CSV
// =========================================================================
// Convierte una celda a número (acepta coma decimal). Devuelve NaN si no es numérica.
function toNum(v) {
  if (typeof v === "number") return v;
  if (v === undefined || v === null) return NaN;
  let s = String(v).trim().replace(/\s/g, "");
  if (s === "") return NaN;
  if (s.includes(",") && !s.includes(".")) s = s.replace(",", ".");
  else s = s.replace(/,/g, "");
  return Number(s);
}

function splitCSVLine(line, d) {
  const out = [];
  let cur = "",
    q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === d && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

// Parser CSV propio: detecta el separador (tab, ; o ,) para que "1,5;2,5" se lea con coma decimal
function parseCSVText(text) {
  text = String(text).replace(/^\uFEFF/, "");
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const head = lines.slice(0, 10);
  let delim = ",";
  for (const d of ["\t", ";", ","]) {
    const counts = head.map((l) => splitCSVLine(l, d).length - 1);
    if (counts[0] > 0 && counts.every((c) => c === counts[0])) {
      delim = d;
      break;
    }
  }
  return lines.map((l) => splitCSVLine(l, delim));
}

// Limpia el input al hacer clic para que se pueda volver a elegir el mismo archivo
$("excelFileInput").addEventListener("click", function () {
  this.value = "";
});
let importTicket = 0;
let pendingReader = null;
function finishImport(message = "") {
  $("fileReadStatus").textContent = message;
  $("excelFileInput").setAttribute("aria-busy", "false");
}
function cancelPendingImport() {
  importTicket++;
  if (pendingReader?.readyState === 1) pendingReader.abort();
  pendingReader = null;
  finishImport();
}
function readDataFile(file) {
  if (!file) return;
  cancelPendingImport();
  const ticket = importTicket;
  showFileError("");
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) { showFileError("Elige un archivo .xlsx, .xls o .csv con dos columnas numéricas."); return; }
  $("fileReadStatus").textContent = "Leyendo «" + file.name + "»…";
  $("excelFileInput").setAttribute("aria-busy", "true");
  const isCsv = /\.csv$/i.test(file.name);
  const reader = new FileReader(); pendingReader = reader;
  reader.onload = function (evt) {
    if (ticket !== importTicket) return;
    try {
      let rows;
      if (isCsv) rows = parseCSVText(evt.target.result);
      else {
        const workbook = XLSX.read(new Uint8Array(evt.target.result), { type: "array" });
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1 });
      }
      processRawRows(rows, { resetColumns: true, analytic: null, demoKey: null, source: file.name });
    } catch {
      showFileError("No se pudo leer el archivo. Verifica que tenga al menos dos columnas numéricas (X, Y).");
    } finally { pendingReader = null; finishImport(); }
  };
  reader.onerror = () => { if (ticket === importTicket) { pendingReader = null; finishImport(); showFileError("No se pudo abrir el archivo. Vuelve a seleccionarlo."); } };
  if (isCsv) reader.readAsText(file); else reader.readAsArrayBuffer(file);
}
$("excelFileInput").addEventListener("change", (e) =>
  readDataFile(e.target.files[0]),
);

function setupColumnSelectors(rows, ncols) {
  const box = $("colSelector");
  if (ncols <= 2) {
    box.style.display = "none";
    return;
  }
  const first = rows[0] || [];
  const opts = Array.from({ length: ncols }, (_, i) => {
    const h = first[i];
    const txt =
      h !== undefined && String(h).trim() !== "" && isNaN(toNum(h))
        ? ` — ${String(h)}`
        : "";
    return `<option value="${i}">${escapeHTML("Col " + (i + 1) + txt)}</option>`;
  }).join("");
  $("colXSel").innerHTML = opts;
  $("colYSel").innerHTML = opts;
  $("colXSel").value = colIdxX;
  $("colYSel").value = colIdxY;
  box.style.display = "flex";
}

function onColumnChange() {
  const nx = parseInt($("colXSel").value, 10);
  const ny = parseInt($("colYSel").value, 10);
  if (nx === ny) {
    alert("X e Y deben ser columnas distintas.");
    $("colXSel").value = colIdxX;
    $("colYSel").value = colIdxY;
    return;
  }
  if (lastRows && !processRawRows(lastRows, { columns: [nx, ny], analytic: null, demoKey: null })) {
    $("colXSel").value = colIdxX; $("colYSel").value = colIdxY;
  }
}
$("hdrMode").addEventListener("change", () => {
  if (lastRows) processRawRows(lastRows, { analytic: null, demoKey: null });
});
$("colXSel").addEventListener("change", onColumnChange);
$("colYSel").addEventListener("change", onColumnChange);

function processRawRows(rows, context = {}) {
  if (!rows || rows.length < 2) {
    showFileError(
      "El archivo debe contener al menos 2 filas de datos numéricos.",
    );
    return;
  }
  const ncols = rows
    .slice(0, 200)
    .reduce((m, r) => Math.max(m, r ? r.length : 0), 0);
  if (ncols < 2) {
    showFileError("El archivo necesita al menos dos columnas (X, Y).");
    return;
  }
  let selectedX = context.resetColumns ? 0 : context.columns?.[0] ?? colIdxX;
  let selectedY = context.resetColumns ? 1 : context.columns?.[1] ?? colIdxY;
  if (selectedX >= ncols) selectedX = 0;
  if (selectedY >= ncols || selectedY === selectedX) selectedY = selectedX === 0 ? 1 : 0;

  // Detectar si la primera fila tiene encabezados de texto (en las columnas elegidas)
  const first = rows[0] || [];
  const hdrMode = context.headerMode || $("hdrMode").value;
  const hasHeader =
    hdrMode === "yes"
      ? true
      : hdrMode === "no"
        ? false
        : isNaN(toNum(first[selectedX])) || isNaN(toNum(first[selectedY]));
  const startIdx = hasHeader ? 1 : 0;
  const nameOf = (idx, fallback) =>
    hasHeader && first[idx] !== undefined && String(first[idx]).trim() !== ""
      ? String(first[idx])
      : fallback;
  const nextXName = nameOf(selectedX, "X"), nextYName = nameOf(selectedY, "Y");

  let pairs = [];
  let ignored = 0;
  for (let i = startIdx; i < rows.length; i++) {
    const r = rows[i];
    if (
      !r ||
      !r.some((c) => c !== undefined && c !== null && String(c).trim() !== "")
    )
      continue; // fila vacía
    const xv = toNum(r[selectedX]);
    const yv = toNum(r[selectedY]);
    if (isFinite(xv) && isFinite(yv)) pairs.push({ x: xv, y: yv });
    else ignored++;
  }

  // Ordenar por X ascendente y eliminar X duplicados para evitar división por cero
  pairs.sort((a, b) => a.x - b.x);
  let uniquePairs = [];
  let dups = 0;
  for (let p of pairs) {
    if (
      uniquePairs.length === 0 ||
      Math.abs(p.x - uniquePairs[uniquePairs.length - 1].x) > 1e-12
    )
      uniquePairs.push(p);
    else dups++;
  }

  if (uniquePairs.length < 2) {
    showFileError(
      "No se encontraron suficientes pares numéricos (X, Y) válidos.",
    );
    return;
  }

  lastRows = rows; colIdxX = selectedX; colIdxY = selectedY;
  colXName = nextXName; colYName = nextYName;
  if (Object.hasOwn(context, "analytic")) currentAnalytic = context.analytic;
  if (Object.hasOwn(context, "demoKey")) currentDemoKey = context.demoKey;
  if (context.headerMode) $("hdrMode").value = context.headerMode;
  if (context.source) $("sourceName").textContent = context.source;
  $("demoObservation").textContent = currentDemoKey ? DEMO_SETS[currentDemoKey]?.guide || "" : "";
  setupColumnSelectors(rows, ncols);
  xData = uniquePairs.map((p) => p.x);
  yData = uniquePairs.map((p) => p.y);

  // Ajustar valores sugeridos de prueba dentro del dominio de los datos
  if (Number($("nNodes").value) > xData.length) $("nNodes").value = xData.length;
  const xLo = xData[0],
    xHi = xData[xData.length - 1];
  const yLo = Math.min(...yData),
    yHi = Math.max(...yData);
  const midX = Number(((xLo + xHi) / 2).toFixed(4));
  const midY = Number(((yLo + yHi) / 2).toFixed(4));
  const curX = parseOr("evalX", NaN);
  const curY = parseOr("targetY", NaN);
  if (isNaN(curX) || curX < xLo || curX > xHi) $("evalX").value = midX;
  if (isNaN(curY) || curY < yLo || curY > yHi) $("targetY").value = midY;

  showFileError("");
  const badge = $("dataStatus");
  badge.style.display = "inline-block";
  let extra = [];
  if (dups) extra.push(`${dups} X repetido(s) eliminado(s)`);
  if (ignored) extra.push(`${ignored} fila(s) no numérica(s) ignorada(s)`);
  badge.textContent =
    `${xData.length} puntos · X: ${xData[0]} a ${xData[xData.length - 1]} · ${colXName} / ${colYName}` +
    (extra.length ? ` · ${extra.join(", ")}` : "");

  renderRawDataTable();
  runMethod(currentMethod);
  window.LabMotion?.reveal(document.querySelector(".data-context"), {
    distance: 4,
    duration: 0.3,
  });
  return true;
}

// =========================================================================
// 2. DATOS DEMO (con solución analítica para comparar errores)
// =========================================================================
function buildDemoRows(hx, hy, t0, t1, dt, f) {
  const rows = [[hx, hy]];
  const n = Math.round((t1 - t0) / dt);
  for (let i = 0; i <= n; i++) {
    const t = +(t0 + i * dt).toFixed(4);
    rows.push([t, +f(t).toFixed(4)]);
  }
  return rows;
}

// f: función exacta, df: derivada exacta, F: primitiva (para la integral exacta)
const A_RC_CARGA = {
  label: "Vc(t) = 5·(1 − e^(−t/1.2))",
  f: (t) => 5 * (1 - Math.exp(-t / 1.2)),
  df: (t) => (5 / 1.2) * Math.exp(-t / 1.2),
  F: (t) => 5 * t + 6 * Math.exp(-t / 1.2),
};
const A_RC_DESCARGA = {
  label: "Vc(t) = 5·e^(−t/1.2)",
  f: (t) => 5 * Math.exp(-t / 1.2),
  df: (t) => -(5 / 1.2) * Math.exp(-t / 1.2),
  F: (t) => -6 * Math.exp(-t / 1.2),
};
const A_RLC = {
  label: "Vc(t) = 5·e^(−0.8t)·cos(4t)",
  f: (t) => 5 * Math.exp(-0.8 * t) * Math.cos(4 * t),
  df: (t) =>
    5 * Math.exp(-0.8 * t) * (-0.8 * Math.cos(4 * t) - 4 * Math.sin(4 * t)),
  F: (t) =>
    (5 * Math.exp(-0.8 * t) * (-0.8 * Math.cos(4 * t) + 4 * Math.sin(4 * t))) /
    16.64,
};
const A_RC_RUIDO = {
  label: "Vc(t) = 5·(1 − e^(−t/1.2)) + 0.03·sen(37t+1)",
  f: (t) => 5 * (1 - Math.exp(-t / 1.2)) + 0.03 * Math.sin(37 * t + 1),
  df: (t) => (5 / 1.2) * Math.exp(-t / 1.2) + 0.03 * 37 * Math.cos(37 * t + 1),
  F: (t) => 5 * t + 6 * Math.exp(-t / 1.2) - (0.03 * Math.cos(37 * t + 1)) / 37,
};

const DEMO_SETS = {
  rc_carga: {
    analytic: A_RC_CARGA,
    rows: [
      ["Tiempo (s)", "Voltaje Vc (V)"],
      [0.0, 0.0],
      [0.4, 1.4173],
      [0.8, 2.4329],
      [1.2, 3.1606],
      [1.6, 3.682],
      [2.0, 4.0556],
      [2.4, 4.3233],
      [2.8, 4.5151],
      [3.2, 4.6526],
      [3.6, 4.7511],
      [4.0, 4.8216],
    ],
  },
  rc_descarga: {
    analytic: A_RC_DESCARGA,
    rows: buildDemoRows(
      "Tiempo (s)",
      "Voltaje Vc (V)",
      0,
      4,
      0.4,
      A_RC_DESCARGA.f,
    ),
  },
  rlc: {
    analytic: A_RLC,
    rows: buildDemoRows("Tiempo (s)", "Voltaje Vc (V)", 0, 4, 0.2, A_RLC.f),
  },
  rc_ruido: {
    analytic: A_RC_RUIDO,
    rows: buildDemoRows(
      "Tiempo (s)",
      "Voltaje Vc (V)",
      0,
      5.6,
      0.2,
      A_RC_RUIDO.f,
    ),
  },
};

const A_RUNGE = {
  label: "f(x) = 1/(1+25x²)", f: (x) => 1 / (1 + 25 * x * x),
  df: (x) => -50 * x / (1 + 25 * x * x) ** 2, F: (x) => Math.atan(5 * x) / 5,
};
const A_CUBIC = { label: "f(x) = x³", f: (x) => x ** 3, df: (x) => 3 * x * x, F: (x) => x ** 4 / 4 };
const A_CYCLE = { label: "f(x) = x³−2x+2", f: (x) => x ** 3 - 2 * x + 2, df: (x) => 3 * x * x - 2, F: (x) => x ** 4 / 4 - x * x + 2 * x };
const exampleRows = (xs, fn) => [["X", "f(X)"], ...xs.map((x) => [x, fn(x)])];
Object.assign(DEMO_SETS, {
  runge_uniform: {
    analytic: A_RUNGE, rows: exampleRows(Array.from({ length: 21 }, (_, i) => -1 + i / 10), A_RUNGE.f),
    method: "lagrange", params: { evalX: 0.95, nNodes: 0, targetY: 0.5 },
    guide: "Qué observar: interpola los 21 nodos uniformes con un polinomio de grado 20 y explora cerca de los extremos. Las oscilaciones de Runge son parte del experimento. Contrasta después con los nodos de Chebyshev o con un spline.",
  },
  runge_chebyshev: {
    analytic: A_RUNGE, rows: exampleRows(Array.from({ length: 21 }, (_, i) => Math.cos(Math.PI * i / 20)).sort((a, b) => a - b), A_RUNGE.f),
    method: "lagrange", params: { evalX: 0.95, nNodes: 0, targetY: 0.5 },
    guide: "Qué observar: la función y el grado son los mismos que en Runge uniforme. Estos 21 nodos de Chebyshev-Lobatto se concentran cerca de los extremos; observa cómo cambia el error sin cambiar de método.",
  },
  irregular_cubic: {
    analytic: A_CUBIC, rows: exampleRows([0, 0.1, 0.4, 0.9, 1.3, 2], A_CUBIC.f),
    method: "simpson", params: { evalX: 0.8, targetY: 2 },
    guide: "Qué observar: los puntos de x³ no están igualmente espaciados. Compara Trapecio y Simpson con la integral exacta, 4. Simpson generalizado admite esta malla, pero no conserva automáticamente el orden de error de una malla uniforme.",
  },
  newton_cycle: {
    analytic: A_CYCLE, rows: exampleRows(Array.from({ length: 17 }, (_, i) => -2 + i / 4), A_CYCLE.f),
    method: "newton_raphson", params: { fExpr: "x^3-2*x+2", targetY: 0, rootA: -2, rootB: 2, rootTol: 0.000001 },
    guide: "Qué observar: Newton comienza en 0 y alterna entre 0 y 1. Recorre los pasos para ver el ciclo; aquí informar «sin convergencia» es correcto. Compara con Bisección sobre el mismo intervalo para encontrar la raíz negativa.",
  },
});

function currentDemo() {
  const sel = $("demoSelect");
  return DEMO_SETS[sel ? sel.value : "rc_carga"] || DEMO_SETS.rc_carga;
}

function loadDemoCircuitData() {
  cancelPendingImport();
  const demo = currentDemo();
  const defaults = { evalX: 1, targetY: 3, rootTol: 0.0001, rootA: "", rootB: "", fExpr: "", nNodes: Math.min(5, demo.rows.length - 1), ...demo.params };
  Object.entries(defaults).forEach(([id, value]) => { $(id).value = value; });
  if (demo.method) currentMethod = demo.method;
  const label = $("demoSelect").selectedOptions[0].textContent;
  processRawRows(demo.rows, { resetColumns: true, headerMode: "auto", analytic: demo.analytic, demoKey: $("demoSelect").value, source: (demo.guide ? "Ejemplo: " : "Simulación: ") + label });
}

function downloadSampleExcel() {
  const ws = XLSX.utils.aoa_to_sheet(currentDemo().rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Simulacion_Multisim");
  XLSX.writeFile(wb, "datos_simulacion_fiee.xlsx");
}

// Escapa texto proveniente del archivo antes de insertarlo con innerHTML
function escapeHTML(str) {
  return String(str).replace(
    /[&<>"']/g,
    (ch) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        ch
      ],
  );
}

function renderRawDataTable() {
  const tbl = $("rawDataTable");
  let html = `<thead><tr><th>Índice i</th><th>${escapeHTML(colXName)} (x<sub>i</sub>)</th><th>${escapeHTML(colYName)} (y<sub>i</sub>)</th></tr></thead><tbody>`;
  for (let i = 0; i < xData.length; i++) {
    html += `<tr><td>${i}</td><td>${xData[i].toFixed(5)}</td><td>${yData[i].toFixed(5)}</td></tr>`;
  }
  html += `</tbody>`;
  tbl.innerHTML = html;
}

// Error absoluto / relativo contra el valor analítico
function errText(approx, exact) {
  const abs = Math.abs(approx - exact);
  const rel = exact !== 0 ? (abs / Math.abs(exact)) * 100 : NaN;
  return (
    `error abs. = ${abs.toExponential(3)}` +
    (isFinite(rel) ? `, error rel. = ${rel.toExponential(3)} %` : "")
  );
}
function analyticNote(html) {
  return currentAnalytic ? `<div class="analytic-note">${html}</div>` : "";
}

// =========================================================================
// 3. NÚCLEO MATEMÁTICO
// =========================================================================

// --- 3.1 INTERPOLACIÓN DE LAGRANGE ---
function evaluateLagrange(xVal, xs, ys) {
  let sum = 0;
  const n = xs.length;
  for (let i = 0; i < n; i++) {
    let Li = 1;
    for (let j = 0; j < n; j++) {
      if (i !== j) Li *= (xVal - xs[j]) / (xs[i] - xs[j]);
    }
    sum += ys[i] * Li;
  }
  return sum;
}

// --- 3.2 DIFERENCIAS DIVIDIDAS DE NEWTON ---
function computeNewtonDividedDiffTable(xs, ys) {
  const n = xs.length;
  let F = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) F[i][0] = ys[i];
  for (let j = 1; j < n; j++) {
    for (let i = 0; i < n - j; i++) {
      F[i][j] = (F[i + 1][j - 1] - F[i][j - 1]) / (xs[i + j] - xs[i]);
    }
  }
  return F;
}

function evaluateNewtonPoly(xVal, xs, F) {
  const n = xs.length;
  let sum = F[0][0];
  let prod = 1;
  for (let j = 1; j < n; j++) {
    prod *= xVal - xs[j - 1];
    sum += F[0][j] * prod;
  }
  return sum;
}

// --- 3.3 SISTEMAS LINEALES (Gauss con pivoteo parcial). El resultado lleva la marca .singular ---
function solveLinearSystem(A, b) {
  const n = b.length;
  let M = A.map((row, i) => [...row, b[i]]);
  let singular = false;

  for (let k = 0; k < n; k++) {
    let maxRow = k;
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(M[i][k]) > Math.abs(M[maxRow][k])) maxRow = i;
    }
    [M[k], M[maxRow]] = [M[maxRow], M[k]];

    if (Math.abs(M[k][k]) < 1e-14) {
      singular = true;
      continue;
    }

    for (let i = k + 1; i < n; i++) {
      let factor = M[i][k] / M[k][k];
      for (let j = k; j <= n; j++) M[i][j] -= factor * M[k][j];
    }
  }

  let x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let sum = M[i][n];
    for (let j = i + 1; j < n; j++) sum -= M[i][j] * x[j];
    if (Math.abs(M[i][i]) > 1e-14) x[i] = sum / M[i][i];
    else {
      x[i] = 0;
      singular = true;
    }
  }
  x.singular = singular;
  return x;
}

// Número de condición en norma 1 (solo si n <= 40, por costo)
function conditionNumber1(M) {
  const n = M.length;
  if (n > 40) return NaN;
  const norm1 = (A) => {
    let m = 0;
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += Math.abs(A[i][j]);
      m = Math.max(m, s);
    }
    return m;
  };
  const inv = Array.from({ length: n }, () => Array(n).fill(0));
  for (let col = 0; col < n; col++) {
    const e = Array(n).fill(0);
    e[col] = 1;
    const x = solveLinearSystem(M, e);
    if (x.singular) return Infinity;
    for (let i = 0; i < n; i++) inv[i][col] = x[i];
  }
  return norm1(M) * norm1(inv);
}

// Vandermonde con la variable centrada y escalada t = (x - x̄)/s para mejorar el condicionamiento
function computeMatrixPolynomial(xs, ys) {
  const n = xs.length;
  const xm = xs.reduce((a, b) => a + b, 0) / n;
  const s = (Math.max(...xs) - Math.min(...xs)) / 2 || 1;
  const t = xs.map((x) => (x - xm) / s);
  const V = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (__, j) => Math.pow(t[i], j)),
  );
  const coeffs = solveLinearSystem(V, ys);
  return { coeffs, xm, s, V, singular: coeffs.singular === true };
}

function evaluateMatrixPoly(xVal, mp) {
  const t = (xVal - mp.xm) / mp.s;
  let acc = 0;
  for (let j = mp.coeffs.length - 1; j >= 0; j--) acc = acc * t + mp.coeffs[j];
  return acc;
}

// --- 3.4 SPLINES CÚBICOS NATURALES ---
function buildNaturalCubicSplines(xs, ys) {
  const n = xs.length - 1;
  let a = [...ys];
  let h = Array(n);
  for (let i = 0; i < n; i++) h[i] = xs[i + 1] - xs[i];

  let alpha = Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    alpha[i] =
      (3 / h[i]) * (a[i + 1] - a[i]) - (3 / h[i - 1]) * (a[i] - a[i - 1]);
  }

  let l = Array(n + 1).fill(1);
  let mu = Array(n + 1).fill(0);
  let z = Array(n + 1).fill(0);

  for (let i = 1; i < n; i++) {
    l[i] = 2 * (xs[i + 1] - xs[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }

  let b = Array(n).fill(0);
  let c = Array(n + 1).fill(0);
  let d = Array(n).fill(0);

  for (let j = n - 1; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (a[j + 1] - a[j]) / h[j] - (h[j] * (c[j + 1] + 2 * c[j])) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }

  let splines = [];
  for (let i = 0; i < n; i++) {
    splines.push({
      x0: xs[i],
      x1: xs[i + 1],
      a: a[i],
      b: b[i],
      c: c[i],
      d: d[i],
    });
  }
  return splines;
}

function findSegment(xVal, splines) {
  let s = splines[0];
  for (let seg of splines) {
    if (xVal >= seg.x0 && xVal <= seg.x1) {
      s = seg;
      break;
    }
  }
  if (xVal > splines[splines.length - 1].x1) s = splines[splines.length - 1];
  return s;
}

function evaluateSpline(xVal, splines) {
  const s = findSegment(xVal, splines);
  const dx = xVal - s.x0;
  return s.a + s.b * dx + s.c * dx * dx + s.d * dx * dx * dx;
}

function evaluateSplineDerivative(xVal, splines) {
  const s = findSegment(xVal, splines);
  const dx = xVal - s.x0;
  return s.b + 2 * s.c * dx + 3 * s.d * dx * dx;
}

// Integral exacta del spline (suma de las integrales de cada cúbica)
function integrateSpline(splines) {
  return splines.reduce((acc, s) => {
    const h = s.x1 - s.x0;
    return (
      acc +
      s.a * h +
      (s.b * h * h) / 2 +
      (s.c * h * h * h) / 3 +
      (s.d * h * h * h * h) / 4
    );
  }, 0);
}

// --- 3.6 DERIVACIÓN NUMÉRICA ---
// Derivada del polinomio de 2º grado que pasa por 3 puntos, evaluada en x (válida con malla no uniforme)
function deriv3(x, xa, xb, xc, ya, yb, yc) {
  return (
    (ya * (2 * x - xb - xc)) / ((xa - xb) * (xa - xc)) +
    (yb * (2 * x - xa - xc)) / ((xb - xa) * (xb - xc)) +
    (yc * (2 * x - xa - xb)) / ((xc - xa) * (xc - xb))
  );
}

// Derivada centrada de 3 puntos, O(h²). Extremos: fórmula unilateral de 3 puntos (también O(h²)).
function computeDerivatives(xs, ys) {
  const n = xs.length;
  const three = (i0, at) =>
    deriv3(
      xs[at],
      xs[i0],
      xs[i0 + 1],
      xs[i0 + 2],
      ys[i0],
      ys[i0 + 1],
      ys[i0 + 2],
    );
  const out = [];
  for (let i = 0; i < n; i++) {
    let dy, tipo;
    if (n < 3) {
      if (i === 0) {
        dy = (ys[1] - ys[0]) / (xs[1] - xs[0]);
        tipo = "Progresiva 2 pts, O(h) (solo hay 2 datos)";
      } else {
        dy = (ys[1] - ys[0]) / (xs[1] - xs[0]);
        tipo = "Regresiva 2 pts, O(h) (solo hay 2 datos)";
      }
    } else if (i === 0) {
      dy = three(0, 0);
      tipo = "Progresiva 3 pts, O(h²) (extremo izq.)";
    } else if (i === n - 1) {
      dy = three(n - 3, i);
      tipo = "Regresiva 3 pts, O(h²) (extremo der.)";
    } else {
      dy = three(i - 1, i);
      tipo = "Centrada, O(h²)";
    }
    out.push({ x: xs[i], y: ys[i], dy, tipo });
  }
  return out;
}

// --- 3.7 INTEGRACIÓN ---
function isUniform(xs) {
  if (xs.length < 3) return true;
  const h0 = xs[1] - xs[0];
  return xs.every(
    (x, i) =>
      i === 0 ||
      Math.abs(x - xs[i - 1] - h0) <= 1e-9 * Math.max(1, Math.abs(h0)),
  );
}

function computeTrapezoidalRule(xs, ys) {
  let totalArea = 0;
  let segments = [];
  for (let i = 0; i < xs.length - 1; i++) {
    let h = xs[i + 1] - xs[i];
    let area = (h / 2) * (ys[i] + ys[i + 1]);
    totalArea += area;
    segments.push({
      idx: i + 1,
      x0: xs[i],
      x1: xs[i + 1],
      h,
      area,
      cumArea: totalArea,
    });
  }
  return { totalArea, segments };
}

// Richardson (h vs 2h): solo malla uniforme con número par de subintervalos
function trapezoidRichardson(xs, ys, Th) {
  const n = xs.length - 1;
  if (n < 2 || n % 2 !== 0 || !isUniform(xs)) return null;
  const x2 = xs.filter((_, i) => i % 2 === 0),
    y2 = ys.filter((_, i) => i % 2 === 0);
  const T2h = computeTrapezoidalRule(x2, y2).totalArea;
  return { T2h, errEst: (Th - T2h) / 3, improved: Th + (Th - T2h) / 3 };
}

// Simpson 1/3 para dos subintervalos h1, h2 (fórmula generalizada para malla no uniforme)
function simpsonPanel13(x0, x1, x2, y0, y1, y2) {
  const h1 = x1 - x0,
    h2 = x2 - x1;
  return (
    ((h1 + h2) / 6) *
    ((2 - h2 / h1) * y0 +
      (((h1 + h2) * (h1 + h2)) / (h1 * h2)) * y1 +
      (2 - h1 / h2) * y2)
  );
}

// Integral exacta del polinomio interpolador de los nodos dados (Simpson 3/8 si son 4 nodos)
function integrateInterpPoly(px, py) {
  const n = px.length;
  const x0 = px[0],
    s = px[n - 1] - px[0];
  const t = px.map((x) => (x - x0) / s);
  const V = t.map((ti) => Array.from({ length: n }, (_, j) => Math.pow(ti, j)));
  const c = solveLinearSystem(V, py);
  return s * c.reduce((acc, cj, j) => acc + cj / (j + 1), 0);
}

function computeSimpson(xs, ys, splines) {
  const n = xs.length - 1; // número de subintervalos
  const use38 = n % 2 === 1 && n >= 3; // impar: los últimos 3 subintervalos con Simpson 3/8
  const end13 = use38 ? n - 3 : n;
  let total = 0;
  let rows = [];
  let i = 0;

  while (i + 2 <= end13) {
    const area = simpsonPanel13(
      xs[i],
      xs[i + 1],
      xs[i + 2],
      ys[i],
      ys[i + 1],
      ys[i + 2],
    );
    total += area;
    rows.push({
      tramo: `[${xs[i].toFixed(3)}, ${xs[i + 2].toFixed(3)}]`,
      regla: "Simpson 1/3 (3 nodos)",
      h: (xs[i + 2] - xs[i]) / 2,
      area,
      acum: total,
      i0: i,
      i1: i + 2,
    });
    i += 2;
  }
  if (use38) {
    const area = integrateInterpPoly(xs.slice(i, i + 4), ys.slice(i, i + 4));
    total += area;
    rows.push({
      tramo: `[${xs[i].toFixed(3)}, ${xs[i + 3].toFixed(3)}]`,
      regla: "Simpson 3/8 (4 nodos)",
      h: (xs[i + 3] - xs[i]) / 3,
      area,
      acum: total,
      i0: i,
      i1: i + 3,
    });
    i += 3;
  } else if (n === 1) {
    const h = xs[1] - xs[0];
    const area = (h / 2) * (ys[0] + ys[1]);
    total += area;
    rows.push({
      tramo: `[${xs[0].toFixed(3)}, ${xs[1].toFixed(3)}]`,
      regla: "Trapecio (único subintervalo)",
      h,
      area,
      acum: total,
      i0: 0,
      i1: 1,
    });
  }

  // Estimación de error de Richardson (h vs 2h): malla uniforme y n múltiplo de 4
  let richardson = null;
  if (n >= 4 && n % 4 === 0 && isUniform(xs)) {
    const x2 = xs.filter((_, k) => k % 2 === 0),
      y2 = ys.filter((_, k) => k % 2 === 0);
    let S2 = 0;
    for (let k = 0; k + 2 < x2.length; k += 2)
      S2 += simpsonPanel13(
        x2[k],
        x2[k + 1],
        x2[k + 2],
        y2[k],
        y2[k + 1],
        y2[k + 2],
      );
    richardson = { S2h: S2, errEst: (total - S2) / 15 };
  }

  return {
    discreteIntegral: total,
    splineIntegral: integrateSpline(splines),
    rows,
    richardson,
    uniform: isUniform(xs),
    used38: use38,
  };
}

// --- 3.8 BÚSQUEDA DE RAÍCES: cruces de signo en una malla fina ---
function changesSign(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && (a === 0 || b === 0 || Math.sign(a) !== Math.sign(b));
}
// A small local/reference residual is required in addition to a small X step.
// A far-away large derivative must never turn a nonzero residual into a root.
function rootResidualCheck(g, a, b, tol, yRef = 0) {
  const samples = [a, a + (b - a) / 2, b].map((x) => Math.abs(g(x))).filter((v) => Number.isFinite(v) && v > 0);
  const reference = samples.length ? Math.min(...samples) : Number.MIN_VALUE;
  return (x) => {
    if (!Number.isFinite(x)) return false;
    const value = g(x);
    const roundoff = 32 * Number.EPSILON * (Math.abs(yRef) + Math.abs(value));
    return Number.isFinite(value) && Math.abs(value) <= Math.max(Math.max(tol, 1e-12) * reference, roundoff);
  };
}
function validRootBracket(g, a, b, tol = 1e-8, yRef = 0) {
  let fa = g(a), fb = g(b);
  if (!changesSign(fa, fb)) return false;
  if (fa === 0 || fb === 0) return true;
  const accepted = rootResidualCheck(g, a, b, tol, yRef);
  for (let i = 0; i < 64; i++) {
    const x = a + (b - a) / 2, fx = g(x);
    if (!Number.isFinite(fx)) return false;
    if (fx === 0 || accepted(x)) return true;
    if (x === a || x === b) return false;
    if (changesSign(fa, fx)) { b = x; fb = fx; } else { a = x; fa = fx; }
  }
  return false;
}
function findBrackets(g, a, b, N, { tol = 1e-8, yRef = 0 } = {}) {
  const res = [];
  const pts = Array.from({ length: N + 1 }, (_, i) => a + ((b - a) * i) / N);
  const values = pts.map(g);
  for (let i = 0; i < N; i++) {
    if (values[i] === 0) res.push({ a: pts[i], b: pts[i] });
    else if (values[i + 1] !== 0 && changesSign(values[i], values[i + 1]) && validRootBracket(g, pts[i], pts[i + 1], tol, yRef))
      res.push({ a: pts[i], b: pts[i + 1] });
  }
  if (values[N] === 0) res.push({ a: pts[N], b: pts[N] });
  return res;
}

// =========================================================================
// 4. CONTROLADOR DE EJECUCIÓN Y RENDERIZADO
// =========================================================================
// Compila una expresión f(x) escrita por el usuario. Solo admite números, x, operadores, paréntesis
// y una lista blanca de funciones: nada de acceso a window, document ni a otras variables.
const FN_OK = {
  sin: "Math.sin",
  cos: "Math.cos",
  tan: "Math.tan",
  asin: "Math.asin",
  acos: "Math.acos",
  atan: "Math.atan",
  sinh: "Math.sinh",
  cosh: "Math.cosh",
  tanh: "Math.tanh",
  exp: "Math.exp",
  ln: "Math.log",
  log: "Math.log10",
  sqrt: "Math.sqrt",
  abs: "Math.abs",
};
function compileUserFunction(expr) {
  const src = String(expr)
    .trim()
    .replace(/\bsen\b/gi, "sin");
  if (src === "") return { fn: null, error: null };
  const tok =
    /\s+|(\d+\.?\d*(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)|([A-Za-z_]\w*)|(\*\*|[-+*\/^(),])/y;
  let out = "",
    pos = 0,
    m;
  while (pos < src.length) {
    tok.lastIndex = pos;
    m = tok.exec(src);
    if (!m)
      return {
        fn: null,
        error: `carácter no permitido en la posición ${pos + 1}: "${src[pos]}"`,
      };
    pos = tok.lastIndex;
    if (m[1] !== undefined) out += m[1];
    else if (m[2] !== undefined) {
      const id = m[2].toLowerCase();
      if (id === "x") out += "x";
      else if (id === "pi") out += "Math.PI";
      else if (id === "e") out += "Math.E";
      else if (FN_OK[id]) out += FN_OK[id];
      else
        return {
          fn: null,
          error: `"${m[2]}" no es una función ni constante conocida`,
        };
    } else if (m[3] !== undefined) out += m[3] === "^" ? "**" : m[3];
  }
  try {
    const fn = new Function("x", '"use strict"; return (' + out + ");");
    const probe = fn(1);
    if (typeof probe !== "number")
      return { fn: null, error: "la expresión no devuelve un número" };
    return { fn, error: null };
  } catch (err) {
    return { fn: null, error: "sintaxis inválida (" + err.message + ")" };
  }
}

// Lee un número de un input; si está vacío/no válido usa def (así el 0 sí es un valor válido)
function parseOr(id, def) {
  const v = parseFloat($(id).value);
  return isNaN(v) ? def : v;
}

// Lee y valida los parámetros; los problemas se muestran en pantalla (nada se corrige en silencio)
const METHOD_NAMES = {
  lagrange: "Lagrange", newton_dd: "Diferencias de Newton", matricial: "Método matricial",
  splines: "Splines cúbicos", derivadas: "Diferencias centradas", trapecio: "Regla del trapecio",
  simpson: "Simpson 1/3 y 3/8", grafico: "Método gráfico", biseccion: "Bisección",
  newton_raphson: "Newton-Raphson", secante: "Secante",
};
const PARAM_IDS = ["evalX", "nNodes", "targetY", "rootTol", "rootA", "rootB", "fExpr"];
function activeParamIds(method) {
  if (["lagrange", "newton_dd", "matricial"].includes(method)) return ["evalX", "nNodes"];
  if (["splines", "derivadas"].includes(method)) return ["evalX"];
  if (["grafico", "biseccion", "newton_raphson", "secante"].includes(method)) return ["targetY", "rootTol", "rootA", "rootB", "fExpr"];
  return [];
}
function getParams() {
  const errors = [];
  PARAM_IDS.forEach((id) => {
    $(id).removeAttribute("aria-invalid");
    const described = ($(id).getAttribute("aria-describedby") || "").split(/\s+/).filter((v) => v && v !== id + "Error");
    if (described.length) $(id).setAttribute("aria-describedby", described.join(" "));
    else $(id).removeAttribute("aria-describedby");
    const hint = $(id + "Error");
    if (hint) hint.remove();
  });
  const reject = (id, message) => {
    errors.push(message);
    const input = $(id);
    input.setAttribute("aria-invalid", "true");
    let hint = $(id + "Error");
    if (!hint) {
      hint = document.createElement("small");
      hint.id = id + "Error";
      hint.className = "field-error";
      input.insertAdjacentElement("afterend", hint);
    }
    hint.textContent = message;
    input.setAttribute("aria-describedby", [input.getAttribute("aria-describedby") || "", hint.id].join(" ").trim());
  };
  const read = (id, label, fallback) => {
    const raw = $(id).value.trim();
    if (!raw && fallback !== undefined) return fallback;
    const number = Number(raw);
    if (!raw || !Number.isFinite(number)) { reject(id, label + ": introduce un número válido."); return NaN; }
    return number;
  };
  const root = ["grafico", "biseccion", "newton_raphson", "secante"].includes(currentMethod);
  const polynomial = ["lagrange", "newton_dd", "matricial"].includes(currentMethod);
  const evaluation = polynomial || ["splines", "derivadas"].includes(currentMethod);
  const xEval = evaluation ? read("evalX", "X") : xData[0];
  const nNodes = polynomial ? read("nNodes", "Nodos", 0) : 0;
  if (polynomial && Number.isFinite(nNodes) && (!Number.isInteger(nNodes) || nNodes < 0 || nNodes === 1 || nNodes > xData.length))
    reject("nNodes", "Usa 0 para todos o un entero entre 2 y " + xData.length + ".");
  const yRef = root ? read("targetY", "Valor objetivo") : 0;
  const tol = root ? read("rootTol", "Tolerancia") : 0.0001;
  if (root && Number.isFinite(tol) && tol <= 0) reject("rootTol", "La tolerancia debe ser mayor que cero.");
  const rA = root ? read("rootA", "Inicio del intervalo", xData[0]) : xData[0];
  const rB = root ? read("rootB", "Fin del intervalo", xData.at(-1)) : xData.at(-1);
  if (root && Number.isFinite(rA) && Number.isFinite(rB)) {
    if (rA >= rB) reject("rootB", "El final del intervalo debe ser mayor que el inicio.");
    if (rA < xData[0] || rA > xData.at(-1)) reject("rootA", "El inicio debe estar dentro del dominio de los datos.");
    if (rB < xData[0] || rB > xData.at(-1)) reject("rootB", "El final debe estar dentro del dominio de los datos.");
  }
  const userFText = root ? $("fExpr").value.trim() : "";
  const compiled = root ? compileUserFunction(userFText) : { fn: null };
  if (compiled.error) reject("fExpr", "Revisa la función: " + compiled.error + ".");
  return { xEval, yRef, tol, nNodes, rA, rB, userF: compiled.fn, userFText, warnings: errors, valid: !errors.length };
}

// Muestra los avisos de validación en la caja amarilla (la validación en sí no toca el DOM)
function showParamWarnings(list) {
  const box = $("paramWarn");
  if (list.length) {
    box.innerHTML = list.map(escapeHTML).join("<br>");
    box.style.display = "block";
    window.LabMotion?.reveal(box, { distance: 5, duration: 0.3 });
  } else {
    box.style.display = "none";
    box.innerHTML = "";
  }
}

// Elegir por distancia y ordenar después por X conserva los pares de datos.
function pickNodes(xEval, count = P.nNodes) {
  if (!(count >= 2) || count >= xData.length) return { xs: xData, ys: yData, all: true };
  const indices = xData.map((_, i) => i)
    .sort((i, j) => Math.abs(xData[i] - xEval) - Math.abs(xData[j] - xEval) || i - j)
    .slice(0, count).sort((i, j) => i - j);
  return { xs: indices.map((i) => xData[i]), ys: indices.map((i) => yData[i]), all: false };
}

// Resumen teórico de cada método (panel "¿Cómo funciona?")
const NOTE_SPLINE =
  " Aquí f(x) es el spline cúbico natural de tus datos, o la función que escribas en «f(x) opcional».";
const THEORY = {
  lagrange:
    "Polinomio <code>P(x) = Σ yᵢ·Lᵢ(x)</code>, con <code>Lᵢ(x) = Π (x − xⱼ)/(xᵢ − xⱼ)</code> para j ≠ i. Pasa exactamente por los nodos usados. Con muchos nodos puede oscilar (fenómeno de Runge), por eso conviene usar pocos nodos cercanos.",
  newton_dd:
    "Polinomio <code>P(x) = f[x₀] + f[x₀,x₁](x−x₀) + f[x₀,x₁,x₂](x−x₀)(x−x₁) + …</code>, con <code>f[xᵢ..xᵢ₊ₖ] = (f[xᵢ₊₁..xᵢ₊ₖ] − f[xᵢ..xᵢ₊ₖ₋₁]) / (xᵢ₊ₖ − xᵢ)</code>. Es el mismo polinomio que el de Lagrange, calculado de forma incremental.",
  matricial:
    "Se resuelve el sistema <code>V·a = y</code> con <code>Vᵢⱼ = tᵢʲ</code> (Vandermonde) para obtener <code>P = a₀ + a₁t + … + aₙtⁿ</code>, donde <code>t = (x − x̄)/s</code> está centrada y escalada (así el sistema queda mejor condicionado que con x crudo). Se usa eliminación gaussiana con pivoteo parcial y se informa el número de condición κ₁(V); si κ es muy grande el resultado pierde cifras.",
  splines:
    "En cada tramo <code>Sᵢ(x) = aᵢ + bᵢ(x−xᵢ) + cᵢ(x−xᵢ)² + dᵢ(x−xᵢ)³</code>, con S, S' y S'' continuas y S'' = 0 en los extremos (spline natural). Evita las oscilaciones del polinomio de grado alto.",
  derivadas:
    "Derivada del polinomio de 2º grado que pasa por 3 puntos consecutivos, evaluada en el nodo central: <code>f'(xᵢ) ≈ (yᵢ₊₁ − yᵢ₋₁)/(2h)</code> con paso constante. Error O(h²). Los extremos usan la fórmula unilateral de 3 puntos (también O(h²)). Vale para malla no uniforme. Si solo hay dos datos, se usa la pendiente de la recta y el esquema es O(h).",
  trapecio:
    "<code>I ≈ Σ (h/2)·(yᵢ + yᵢ₊₁)</code>: se reemplaza la curva por segmentos rectos en cada subintervalo. Error de orden O(h²). Con malla uniforme y n par se estima el error por Richardson comparando paso h y 2h: <code>E ≈ (T_h − T_2h)/3</code>.",
  simpson:
    "Por cada par de subintervalos <code>[h₁, h₂]</code>: <code>I ≈ (h₁+h₂)/6·[(2 − h₂/h₁)y₀ + (h₁+h₂)²/(h₁h₂)·y₁ + (2 − h₁/h₂)y₂]</code>, que con h₁ = h₂ = h se reduce a <code>(h/3)(y₀ + 4y₁ + y₂)</code> y vale también en malla no uniforme. Si el número de subintervalos es impar, los últimos 3 se integran con Simpson 3/8 (cúbica por 4 nodos). En malla uniforme y para funciones suficientemente suaves, el error compuesto es O(h⁴); ese orden no se garantiza en una malla irregular arbitraria.",
  grafico:
    "Se grafica <code>g(x) = f(x) − Yref</code> y se buscan <strong>todos</strong> los cruces por cero (cambios de signo en una malla de 400 puntos). Cada raíz se estima con una interpolación lineal en su subintervalo. Es una aproximación visual." +
    NOTE_SPLINE,
  biseccion:
    "Si <code>g(a)·g(b) < 0</code>, se toma <code>xᵣ = (a+b)/2</code> y se conserva la mitad donde g cambia de signo. El error máximo es <code>(b−a)/2</code> y se reduce a la mitad en cada iteración. Si g no cambia de signo entre a y b pero hay cruces internos, se usa el primero." +
    NOTE_SPLINE,
  newton_raphson:
    "<code>xₖ₊₁ = xₖ − g(xₖ)/g'(xₖ)</code>. Converge de forma cuadrática si el punto inicial es bueno; falla si g'(x) ≈ 0 (el método se detiene y lo informa). Se detiene cuando <code>|xₖ₊₁ − xₖ|</code> es menor que la tolerancia y además |g(x)| es pequeño; si no hay raíz lo indica." +
    NOTE_SPLINE +
    " La derivada g' se obtiene del spline; si escribes f(x), se aproxima con diferencias centradas. Arranca en el centro del intervalo de cambio de signo encontrado.",
  secante:
    "<code>xₖ₊₁ = xₖ − g(xₖ)·(xₖ − xₖ₋₁)/(g(xₖ) − g(xₖ₋₁))</code>. Como Newton-Raphson pero sin derivada; converge más rápido que bisección (orden ≈ 1.618). Parte de los extremos del cambio de signo. Se detiene cuando <code>|xₖ₊₁ − xₖ|</code> es menor que la tolerancia y |g| es pequeño; informa si no converge." +
    NOTE_SPLINE,
};

const METHOD_GUIDES = {
  lagrange: "Construye una sola curva que pasa exactamente por los puntos elegidos. Después lee en esa curva el valor que corresponde a la X que quieres consultar. Con muchos puntos, la curva puede oscilar demasiado entre ellos.",
  newton_dd: "Parte de un punto y va añadiendo correcciones para que la curva pase por los demás. Con los mismos nodos produce el mismo polinomio que Lagrange, pero lo construye paso a paso usando diferencias divididas.",
  matricial: "Busca los coeficientes de un polinomio resolviendo un sistema de ecuaciones: cada punto aporta una condición que la curva debe cumplir. Con muchos puntos, el cálculo puede ser sensible al redondeo.",
  splines: "Une cada par de puntos con una pequeña curva cúbica y suaviza las uniones. Así evita depender de un único polinomio de grado alto y suele reducir las oscilaciones entre los datos.",
  derivadas: "Estima qué tan rápido cambia Y cuando cambia X, usando tres puntos cercanos. Un resultado positivo indica que la curva sube; uno negativo, que baja. En los extremos usa los puntos disponibles de un solo lado.",
  trapecio: "Aproxima el área con signo entre la curva y el eje X. Une los puntos con líneas rectas, forma trapecios y suma sus áreas; los tramos bajo el eje restan.",
  simpson: "Aproxima el área con signo usando pequeñas parábolas en lugar de líneas rectas. Puede dar más precisión que el trapecio cuando la curva es suave. Si sobra un grupo de tres intervalos, lo completa con la regla de Simpson 3/8.",
  grafico: "Busca dónde la curva alcanza el valor objetivo. Revisa una malla de puntos, detecta los tramos que cruzan ese nivel y estima la posición del cruce. Es una aproximación que puede omitir cruces sin cambio de signo o muy cercanos entre sí.",
  biseccion: "Busca dónde la curva alcanza el valor objetivo dividiendo un intervalo por la mitad una y otra vez. En cada paso conserva la mitad que encierra el cruce. Es un proceso seguro si la función es continua y los extremos quedan a lados opuestos del objetivo.",
  newton_raphson: "Parte de una estimación y usa la pendiente de la curva para proponer una mejor. Repite los saltos hasta acercarse al valor objetivo. Puede avanzar muy rápido, pero una pendiente casi nula o un punto inicial poco adecuado puede hacer que falle.",
  secante: "Usa dos estimaciones y traza una recta entre sus puntos para proponer la siguiente. Repite el proceso hasta acercarse al valor objetivo, sin calcular la derivada. Suele avanzar rápido, aunque no garantiza encontrar la solución.",
};

function showTheory(methodName) {
  const explanation = methodName === "derivadas" && xData.length === 2
    ? "Con dos datos, estima el cambio de Y por cada unidad de X usando la pendiente de la recta que los une. La misma pendiente se muestra en ambos extremos."
    : METHOD_GUIDES[methodName] || "";
  $("howText").innerHTML = `<p class="simple-explanation">${explanation}</p><h4>Detalle matemático</h4><div>${THEORY[methodName] || ""}</div>`;
}

// Construye la tabla del método a partir de valores crudos (la exportación a Excel usa los valores sin redondear)
function stripTags(h) {
  const d = document.createElement("div");
  d.innerHTML = h;
  return d.textContent;
}
const F0 = (v) => String(v);
const F3 = (v) => v.toFixed(3);
const F4 = (v) => v.toFixed(4);
const F5 = (v) => v.toFixed(5);
const F6 = (v) => v.toFixed(6);
const F7 = (v) => v.toFixed(7);
const FE = (v) => v.toExponential(3);
const B6 = (v) => "<strong>" + v.toFixed(6) + "</strong>";
const BE = (v) => "<strong>" + v.toExponential(4) + "</strong>";

function setTable(headers, rows, fmts = []) {
  let html =
    "<thead><tr>" +
    headers.map((h) => `<th>${h}</th>`).join("") +
    "</tr></thead><tbody>";
  rows.forEach((r) => {
    html +=
      "<tr>" +
      r
        .map((v, j) => {
          if (typeof v === "number") {
            const f = fmts[j] || F6;
            return `<td>${isFinite(v) ? f(v) : String(v)}</td>`;
          }
          return `<td>${v}</td>`;
        })
        .join("") +
      "</tr>";
  });
  html += "</tbody>";
  $("methodTable").innerHTML = html;
  lastTable = [
    headers.map(stripTags),
    ...rows.map((r) =>
      r.map((v) => (typeof v === "string" ? stripTags(v) : v)),
    ),
  ];
}

function downloadChartPNG() {
  const src = $("mainChart");
  if (!src || !chartInstance) {
    alert("Primero ejecuta un método para generar la gráfica.");
    return;
  }
  // Exportar siempre la posición final, aunque la transición siga en curso.
  chartInstance.stop();
  chartInstance.update("none");
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const ctx = c.getContext("2d");
  // El canvas es transparente: conservar el contraste del tema al exportarlo.
  ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#ffffff";
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  const fileName = `grafica_${currentMethod}.png`;
  c.toBlob((blob) => {
    if (!blob) {
      showFileError("No se pudo guardar la gráfica. Vuelve a intentarlo.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

function downloadResultsExcel() {
  if (!lastTable) {
    alert("Primero ejecuta un método para generar resultados.");
    return;
  }
  const wb = XLSX.utils.book_new();
  const resumen = [
    ["Método", $("methodTitle").textContent],
    ["Resultado", $("methodSummary").textContent],
    ["Resultado principal", primaryResult?.value ?? "Sin resultado"],
    ["Magnitud", primaryResult?.label ?? ""],
    ["Unidad", primaryResult?.unit ?? ""],
    ["X de interpolación", parseOr("evalX", "")],
    ["Yref", parseOr("targetY", "")],
    ["Tolerancia |Δx|", parseOr("rootTol", "")],
    ["Nodos cercanos (n)", parseOr("nNodes", "")],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(resumen), "Resumen");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(lastTable),
    "Tabla del método",
  );
  if (xData.length) {
    const datos = [[colXName, colYName], ...xData.map((x, i) => [x, yData[i]])];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(datos), "Datos");
  }
  XLSX.writeFile(wb, `resultados_${currentMethod}.xlsx`);
}

function scrollToWorkspace() {
  // Cerrar antes de medir evita calcular la posición con el menú abierto.
  setMenuOpen(false);
  const ws = $("workspace");
  const top = ws.getBoundingClientRect().top;
  if (window.innerWidth <= 1050 || top < 0) {
    window.scrollTo({
      top: window.scrollY + top - 20,
      // Cambiar de método es navegación frecuente: no animar el desplazamiento.
      behavior: "auto",
    });
  }
  if (window.innerWidth <= 1050) {
    $("methodTitle").setAttribute("tabindex", "-1");
    $("methodTitle").focus({ preventScroll: true });
  }
}

// Ejecuta el método y añade avisos (extrapolación, grado alto, nodos usados)
function runMethod(methodName, btnElement) {
  if (xData.length < 2) {
    // Sin datos: se cargan los de demo (processRawRows vuelve a llamar a runMethod con este método)
    currentMethod = methodName;
    loadDemoCircuitData();
    if (btnElement) scrollToWorkspace();
    return;
  }
  window.LabWorkbench?.beforeRun();
  const valid = runMethodCore(methodName);
  showTheory(methodName);
  if (valid === false) { window.LabWorkbench?.onResult(); return; }
  {
    const xEval = P.xEval;
    const xMin = xData[0],
      xMax = xData[xData.length - 1];
    const poly = ["lagrange", "newton_dd", "matricial"].includes(methodName);
    const notes = [];
    if ((poly || methodName === "splines") && (xEval < xMin || xEval > xMax)) {
      notes.push(
        `X = ${xEval} está fuera del dominio de los datos [${xMin}, ${xMax}]: es una <strong>extrapolación</strong> y el resultado no es confiable.`,
      );
    }
    if (poly) {
      const sel = pickNodes(xEval);
      if (!sel.all) {
        notes.push(
          `Se usaron los <strong>${sel.xs.length} nodos más cercanos</strong> a X, [${sel.xs[0]}, ${sel.xs[sel.xs.length - 1]}] (grado ${sel.xs.length - 1}). Pon n = 0 para usar todos.`,
        );
      } else if (xData.length > 10) {
        notes.push(
          `Se usan los ${xData.length} nodos (grado ${xData.length - 1}): con datos ruidosos el polinomio puede oscilar mucho. Prueba con "Nodos cercanos (n)" = 4 o 5.`,
        );
      }
    }
    if (
      ["grafico", "biseccion", "newton_raphson", "secante"].includes(methodName)
    ) {
      notes.push(
        P.userF
          ? `Las raíces se calculan sobre tu función <strong>f(x) = ${escapeHTML(P.userFText)}</strong> (no sobre los datos).`
          : `Las raíces se calculan sobre el <strong>spline cúbico</strong> de tus datos; su precisión depende de qué tan bien lo represente. Para usar la función exacta escribe f(x) en «f(x) opcional».`,
      );
    }
    if (methodName === "derivadas") {
      notes.push(
        "La derivada se calcula directamente sobre los datos: con datos ruidosos amplifica el ruido (la curva de fondo es el spline, solo como referencia visual).",
      );
    }
    if (notes.length) {
      $("methodSummary").innerHTML +=
        `<div class="method-notes">${notes.join("<br>")}</div>`;
    }
  }
  if (btnElement) scrollToWorkspace();
  window.LabMotion?.results();
  window.LabWorkbench?.onResult();
}

// Conservar el lienzo y cada serie permite interpolar desde su posición visible.
// easeOutCubic equivale a power2.out en GSAP (400 ms).
function chartAnimation() {
  return { duration: 400, easing: "easeOutCubic" };
}
function applyChartTheme(config) {
  const dark = document.documentElement.dataset.theme === "dark";
  const palette = window.LabTheme?.chartPalette();
  const text = dark ? palette?.text || "#b0bac8" : "#52647a";
  const grid = dark ? palette?.grid || "#3c4450" : "#e8edf4";
  const blue = dark ? palette?.curve || "#8cc8ff" : "#285bc5";
  config.options.color = text;
  for (const scale of Object.values(config.options.scales || {})) {
    scale.ticks = { ...scale.ticks, color: text };
    scale.grid = { ...scale.grid, color: grid };
    scale.border = { ...scale.border, color: grid };
    if (scale.title) scale.title.color = text;
  }
  const plugins = config.options.plugins || {};
  if (plugins.legend) {
    plugins.legend.labels = { ...plugins.legend.labels, color: text };
  }
  if (plugins.title) plugins.title.color = text;
  for (const series of config.data.datasets) {
    switch (series.id) {
      case "convergence":
        series.borderColor = series.backgroundColor = blue;
        break;
      case "approximation":
        series.borderColor = blue;
        series.backgroundColor = series.fill
          ? dark ? blue + "20" : "rgba(36,89,189,0.10)"
          : "transparent";
        break;
      case "observations":
        series.borderColor = series.backgroundColor = dark ? "#ef9690" : "#bd5853";
        break;
      case "panels":
        series.borderColor = dark ? "#648bc4" : "rgba(24,104,219,0.55)";
        break;
      case "secondary":
        series.borderColor = series.backgroundColor = dark ? "#69d5cb" : "#0d9488";
        break;
      case "highlight":
        series.backgroundColor = dark ? palette?.highlight || "#80d9d5" : "#087e5b";
        series.borderColor = dark ? "#e7edf5" : "#111827";
        break;
      default:
        if (series.id?.startsWith("reference-")) {
          series.borderColor = series.backgroundColor = dark ? "#e1b57e" : "#a46b32";
        }
    }
  }
}
window.addEventListener("lab:themechange", () => {
  for (const chart of [chartInstance, convChartInstance].filter(Boolean)) {
    applyChartTheme({ data: chart.data, options: chart.options });
    chart.update("none");
  }
});
function updatePersistentChart(instance, context, config) {
  applyChartTheme(config);
  if (!instance) return new Chart(context, config);
  const existing = new Map(
    instance.data.datasets.map((series) => [series.id, series]),
  );
  instance.data.datasets = config.data.datasets.map((series) => {
    const retained = existing.get(series.id);
    return retained ? Object.assign(retained, series) : series;
  });
  // Keep optional series alive until the workbench updates them in this same run.
  // Preserving dataset identity lets comparison and iteration points morph too.
  instance.data.datasets.push(...[...existing.values()].filter((series) => series.id?.startsWith("tool-")));
  if (config.data.labels) instance.data.labels = config.data.labels;
  instance.options = config.options;
  instance.update();
  return instance;
}

function setConvergence(errs, label) {
  const cont = $("convContainer");
  cont.style.display = "block";
  const ctx = $("convChart").getContext("2d");
  convChartInstance = updatePersistentChart(convChartInstance, ctx, {
    type: "line",
    data: {
      labels: errs.map((_, i) => i + 1),
      datasets: [
        {
          id: "convergence",
          label,
          data: errs.map((e) => Math.max(e, 1e-17)),
          borderColor: "#285bc5",
          backgroundColor: "#285bc5",
          pointRadius: 3,
          tension: 0,
        },
      ],
    },
    options: {
      animation: chartAnimation(),
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { title: { display: true, text: "Iteración k" } },
        y: {
          type: "logarithmic",
          title: { display: true, text: label + " (escala log)" },
        },
      },
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: "Convergencia: " + label + " por iteración",
        },
      },
    },
  });
}

function runMethodCore(methodName) {
  currentMethod = methodName;
  lastIterations = [];
  lastRunValid = false;
  setPrimaryResult(
    null,
    "Resultado del método",
    "Revisa los parámetros del cálculo.",
  );
  document.querySelectorAll(".method-btn").forEach((b) => {
    const active = b.dataset.method === methodName;
    b.classList.toggle("active-btn", active);
    b.setAttribute("aria-pressed", String(active));
  });
  const polynomial = ["lagrange", "newton_dd", "matricial"].includes(
    methodName,
  );
  const interpolation = polynomial || methodName === "splines";
  const roots = ["grafico", "biseccion", "newton_raphson", "secante"].includes(
    methodName,
  );
  const visibility = {
    polynomial,
    interpolation,
    evaluation: interpolation || methodName === "derivadas",
    roots,
  };
  document.querySelectorAll("[data-params]").forEach((group) => {
    group.hidden = !visibility[group.dataset.params];
  });
  $("domainNote").hidden = interpolation || roots || methodName === "derivadas";
  $("recalculate").hidden =
    !interpolation && !roots && methodName !== "derivadas";
  $("methodCategory").textContent = interpolation
    ? "Interpolación"
    : roots
      ? "Búsqueda de raíces"
      : methodName === "derivadas"
        ? "Derivación numérica"
        : "Integración numérica";

  $("workspace").style.display = "block";
  $("convContainer").style.display = "none";
  $("methodFormula").style.display = "none";

  P = getParams();
  showParamWarnings(P.warnings);
  document.querySelectorAll(".export-bar button").forEach((button) => { button.disabled = !P.valid; });
  document.querySelector(".chart-panel").dataset.stale = String(!P.valid);
  if (!P.valid) {
    $("methodTitle").textContent = METHOD_NAMES[methodName];
    $("methodSummary").textContent = "Corrige los campos señalados para calcular con tus parámetros.";
    $("methodTable").replaceChildren();
    lastTable = null;
    return false;
  }
  const { xEval, yRef, tol, rA, rB } = P;

  const splines = buildNaturalCubicSplines(xData, yData);
  const xMin = xData[0];
  const xMax = xData[xData.length - 1];

  // Generar malla densa para graficar curvas suaves
  const N_PLOT = 140;
  let denseX = [];
  for (let i = 0; i <= N_PLOT; i++)
    denseX.push(xMin + (i / N_PLOT) * (xMax - xMin));

  const titleEl = $("methodTitle");
  const summaryEl = $("methodSummary");
  const formulaEl = $("methodFormula");
  const methodTableTitle = $("methodTableTitle");

  // Nodos usados por Lagrange / Newton / Matricial (los n más cercanos a X)
  const sel = pickNodes(xEval);
  const xN = sel.xs,
    yN = sel.ys;
  const lo = Math.min(xN[0], xEval),
    hi = Math.max(xN[xN.length - 1], xEval);
  const denseN = Array.from(
    { length: N_PLOT + 1 },
    (_, i) => lo + (i / N_PLOT) * (hi - lo),
  );

  const interpNote = (yHat) => {
    if (!currentAnalytic) return "";
    const ex = currentAnalytic.f(xEval);
    return analyticNote(
      `Solución analítica ${currentAnalytic.label}: f(${xEval}) = ${ex.toFixed(6)} · ${errText(yHat, ex)}`,
    );
  };

  // --- EJECUCIÓN SEGÚN MÉTODO ---
  const methods = {
    lagrange() {
      const yInterp = evaluateLagrange(xEval, xN, yN);
      setPrimaryResult(
        yInterp,
        "Valor interpolado",
        `P(${xEval}) · ${colYName}`,
      );
      const curvePoints = denseN.map((x) => ({
        x,
        y: evaluateLagrange(x, xN, yN),
      }));

      titleEl.textContent = "Interpolación Polinómica de Lagrange";
      summaryEl.innerHTML =
        `Para <strong>X = ${xEval}</strong>, el valor interpolado mediante el polinomio de Lagrange de grado ${xN.length - 1} es <strong>P(${xEval}) = ${yInterp.toFixed(6)}</strong>.` +
        interpNote(yInterp);

      methodTableTitle.textContent = `Evaluación de los Polinomios Base Lᵢ(x) en x = ${xEval}`;
      const rows = [];
      for (let i = 0; i < xN.length; i++) {
        let Li = 1;
        for (let j = 0; j < xN.length; j++)
          if (i !== j) Li *= (xEval - xN[j]) / (xN[i] - xN[j]);
        rows.push([i, xN[i], yN[i], Li, yN[i] * Li]);
      }
      setTable(
        [
          "Nodo i",
          "xᵢ",
          "yᵢ",
          `Base Lᵢ(${xEval})`,
          `Término yᵢ · Lᵢ(${xEval})`,
        ],
        rows,
        [F0, F4, F4, F6, F6],
      );

      drawChart({
        curveLabel: "Polinomio de Lagrange P(x)",
        curvePoints,
        highlightPoint: {
          x: xEval,
          y: yInterp,
          label: `P(${xEval}) = ${yInterp.toFixed(4)}`,
        },
      });
    },

    newton_dd() {
      const F = computeNewtonDividedDiffTable(xN, yN);
      const yInterp = evaluateNewtonPoly(xEval, xN, F);
      setPrimaryResult(
        yInterp,
        "Valor interpolado",
        `P(${xEval}) · ${colYName}`,
      );
      const curvePoints = denseN.map((x) => ({
        x,
        y: evaluateNewtonPoly(x, xN, F),
      }));

      titleEl.textContent = "Interpolación por Diferencias Divididas de Newton";
      summaryEl.innerHTML =
        `Resultado en <strong>X = ${xEval}</strong>: <strong>P(${xEval}) = ${yInterp.toFixed(6)}</strong>. A continuación se muestra el polinomio progresivo de Newton y la matriz triangular de diferencias divididas.` +
        interpNote(yInterp);

      let polyTerms = [`${F[0][0].toFixed(5)}`];
      for (let j = 1; j < Math.min(xN.length, 6); j++) {
        let factors = xN
          .slice(0, j)
          .map((xj) => `(x - ${xj.toFixed(2)})`)
          .join("");
        polyTerms.push(
          `${F[0][j] >= 0 ? "+ " : ""}${F[0][j].toFixed(5)}${factors}`,
        );
      }
      formulaEl.style.display = "block";
      formulaEl.textContent =
        `P(x) ≈ ` + polyTerms.join(" ") + (xN.length > 6 ? " + ..." : "");

      methodTableTitle.textContent =
        "Tabla de Diferencias Divididas de Newton f[xᵢ, ..., xᵢ₊ₖ]";
      const maxCols = Math.min(xN.length, 7);
      const headers = ["i", "xᵢ", "f[xᵢ]"];
      for (let j = 1; j < maxCols; j++) headers.push(`Orden ${j}`);
      const rows = [];
      for (let i = 0; i < xN.length; i++) {
        const r = [i, xN[i]];
        for (let j = 0; j < maxCols; j++)
          r.push(i + j < xN.length ? F[i][j] : "-");
        rows.push(r);
      }
      setTable(headers, rows, [F0, F4, F5, F5, F5, F5, F5, F5]);

      drawChart({
        curveLabel: "Polinomio de Newton P(x)",
        curvePoints,
        highlightPoint: {
          x: xEval,
          y: yInterp,
          label: `P(${xEval}) = ${yInterp.toFixed(4)}`,
        },
      });
    },

    matricial() {
      const mp = computeMatrixPolynomial(xN, yN);
      const yInterp = evaluateMatrixPoly(xEval, mp);
      setPrimaryResult(
        yInterp,
        "Valor interpolado",
        `P(${xEval}) · ${colYName}`,
      );
      const curvePoints = denseN.map((x) => ({
        x,
        y: evaluateMatrixPoly(x, mp),
      }));
      const cond = conditionNumber1(mp.V);

      titleEl.textContent =
        "Interpolación por Método Matricial (Sistema de Vandermonde V · a = Y)";
      let condTxt = isNaN(cond)
        ? "κ₁(V) no calculado (más de 40 nodos)"
        : `κ₁(V) ≈ ${isFinite(cond) ? cond.toExponential(2) : "∞ (matriz singular)"}`;
      let warn = "";
      if (mp.singular || !isFinite(cond))
        warn = `<div class="numeric-warning">La matriz es numéricamente singular: algunos coeficientes se forzaron a 0 y el polinomio <strong>no es confiable</strong>. Reduce el número de nodos.</div>`;
      else if (cond > 1e10)
        warn = `<div class="numeric-warning">Sistema muy mal condicionado (κ > 10¹⁰): se pierden más de 10 cifras. Reduce el número de nodos.</div>`;
      else if (cond > 1e6)
        warn = `<div class="method-notes">Sistema mal condicionado (κ > 10⁶): el resultado puede perder precisión.</div>`;
      summaryEl.innerHTML =
        `Resolviendo el sistema matricial (variable centrada y escalada, Gauss con pivoteo parcial), para <strong>X = ${xEval}</strong> se obtiene <strong>P(${xEval}) = ${yInterp.toFixed(6)}</strong>. ${condTxt}.` +
        warn +
        interpNote(yInterp);

      let polyStr = mp.coeffs
        .map((c, j) => `${c >= 0 && j > 0 ? "+ " : ""}${c.toFixed(5)}·t^${j}`)
        .join(" ");
      formulaEl.style.display = "block";
      formulaEl.textContent = `P(x) = ${polyStr}\ncon t = (x − ${mp.xm.toFixed(5)}) / ${mp.s.toFixed(5)}`;

      methodTableTitle.textContent =
        "Vector Solución de Coeficientes del Sistema Matricial (V · a = Y), en la variable t";
      setTable(
        ["Coeficiente", "Potencia", "Valor Numérico (aⱼ)"],
        mp.coeffs.map((c, j) => [`a<sub>${j}</sub>`, `t<sup>${j}</sup>`, c]),
        [F0, F0, F7],
      );

      drawChart({
        curveLabel: "Polinomio Matricial P(x)",
        curvePoints,
        highlightPoint: {
          x: xEval,
          y: yInterp,
          label: `P(${xEval}) = ${yInterp.toFixed(4)}`,
        },
      });
    },

    splines() {
      const yInterp = evaluateSpline(xEval, splines);
      setPrimaryResult(
        yInterp,
        "Valor interpolado",
        `S(${xEval}) · ${colYName}`,
      );
      const curvePoints = denseX.map((x) => ({
        x,
        y: evaluateSpline(x, splines),
      }));

      titleEl.textContent = "Interpolación por Splines Cúbicos Naturales S(x)";
      summaryEl.innerHTML =
        `Para <strong>X = ${xEval}</strong>, el trazador cúbico natural evalúa <strong>S(${xEval}) = ${yInterp.toFixed(6)}</strong>, garantizando continuidad en primera y segunda derivada sin oscilaciones espurias.` +
        interpNote(yInterp);

      methodTableTitle.textContent =
        "Ecuaciones por Tramos: Sᵢ(x) = aᵢ + bᵢ(x - xᵢ) + cᵢ(x - xᵢ)² + dᵢ(x - xᵢ)³";
      setTable(
        ["Tramo i", "Intervalo [xᵢ, xᵢ₊₁]", "aᵢ", "bᵢ", "cᵢ", "dᵢ"],
        splines.map((s, idx) => [
          `S<sub>${idx}</sub>(x)`,
          `[${s.x0.toFixed(3)}, ${s.x1.toFixed(3)}]`,
          s.a,
          s.b,
          s.c,
          s.d,
        ]),
        [F0, F0, F5, F5, F5, F5],
      );

      drawChart({
        curveLabel: "Spline Cúbico Natural S(x)",
        curvePoints,
        highlightPoint: {
          x: xEval,
          y: yInterp,
          label: `S(${xEval}) = ${yInterp.toFixed(4)}`,
        },
      });
    },

    derivadas() {
      const derivs = computeDerivatives(xData, yData);
      const nearest = derivs.reduce((best, node) =>
        Math.abs(node.x - xEval) < Math.abs(best.x - xEval) ? node : best,
      );
      setPrimaryResult(
        nearest.dy,
        "Derivada calculada",
        `f′(${nearest.x}) · nodo más cercano a X = ${xEval}`,
        "derivative",
      );
      const splinePoints = denseX.map((x) => ({
        x,
        y: evaluateSpline(x, splines),
      }));
      const derivPoints = derivs.map((d) => ({ x: d.x, y: d.dy }));

      titleEl.textContent =
        xData.length < 3 ? "Derivación Numérica: Pendiente de dos puntos, O(h)" : "Derivación Numérica: Diferencias Finitas Centradas, O(h²)";
      let txt = xData.length < 3 ? "Solo hay dos puntos: se usa la pendiente de la recta en ambos extremos, con error O(h) bajo las hipótesis usuales de suavidad." : `Se calculó la tasa de cambio <strong>dy/dx</strong> en cada nodo con diferencias <strong>centradas</strong> de 3 puntos (orden h²); en los extremos se usa la fórmula unilateral de 3 puntos.`;
      const headers = [
        "Nodo i",
        "xᵢ",
        "yᵢ",
        "Derivada f'(xᵢ)",
        "Esquema Aplicado",
      ];
      let rows = derivs.map((d, i) => [i, d.x, d.y, d.dy, d.tipo]);
      let extra = [];
      if (currentAnalytic) {
        let maxErr = 0;
        rows = rows.map((r, i) => {
          const ex = currentAnalytic.df(derivs[i].x);
          const e = Math.abs(derivs[i].dy - ex);
          maxErr = Math.max(maxErr, e);
          return [...r, ex, e];
        });
        headers.push("f'(x) analítica", "Error abs.");
        const exCurve = denseX.map((x) => ({ x, y: currentAnalytic.df(x) }));
        extra = [
          {
            label: "f'(x) analítica",
            points: exCurve,
            color: "#a46b32",
            dash: [2, 3],
            yAxisID: "y2",
          },
        ];
        txt += analyticNote(
          `Derivada analítica de ${currentAnalytic.label}. Error absoluto máximo en los nodos = ${maxErr.toExponential(3)}.`,
        );
      }
      summaryEl.innerHTML = txt;

      methodTableTitle.textContent =
        "Tabla de Derivadas Numéricas en cada Nodo";
      setTable(headers, rows, [F0, F4, F4, B6, F0, F6, FE]);

      drawChart({
        curveLabel: "Función Original S(x)",
        curvePoints: splinePoints,
        secondaryCurveLabel: "Derivada Numérica f'(x)",
        secondaryPoints: derivPoints,
        secondaryAxis: true,
        extraCurves: extra,
      });
    },

    trapecio() {
      const trap = computeTrapezoidalRule(xData, yData);
      const curvePoints = xData.map((x, i) => ({ x, y: yData[i] }));
      const rich = trapezoidRichardson(xData, yData, trap.totalArea);
      setPrimaryResult(
        trap.totalArea,
        "Integral calculada",
        `Intervalo [${xMin}, ${xMax}] · trapecio compuesto`,
        "integral",
      );

      titleEl.textContent =
        "Integración Numérica: Regla del Trapecio Compuesta";
      let txt = `La integral (con signo) de f en <strong>[${xMin.toFixed(3)}, ${xMax.toFixed(3)}]</strong> es <strong>I ≈ ${trap.totalArea.toFixed(6)}</strong>.`;
      if (Math.min(...yData) < 0)
        txt += ` <em>Como f toma valores negativos, esto es una integral con signo, no un área geométrica.</em>`;
      if (rich)
        txt += `<div class="analytic-note info-note">Estimación de error (Richardson, h vs 2h): E ≈ ${rich.errEst.toExponential(3)} · T<sub>2h</sub> = ${rich.T2h.toFixed(6)} · valor extrapolado = ${rich.improved.toFixed(6)}.</div>`;
      if (currentAnalytic) {
        const ex = currentAnalytic.F(xMax) - currentAnalytic.F(xMin);
        txt += analyticNote(
          `Integral analítica de ${currentAnalytic.label} = ${ex.toFixed(6)} · ${errText(trap.totalArea, ex)}`,
        );
      }
      summaryEl.innerHTML = txt;

      methodTableTitle.textContent =
        "Desglose de Áreas por Subintervalo Trapezoidal";
      setTable(
        [
          "Subintervalo",
          "[xᵢ, xᵢ₊₁]",
          "Paso hᵢ",
          "Integral del Trapecio",
          "Integral Acumulada",
        ],
        trap.segments.map((s) => [
          s.idx,
          `[${s.x0.toFixed(4)}, ${s.x1.toFixed(4)}]`,
          s.h,
          s.area,
          s.cumArea,
        ]),
        [F0, F0, F4, F6, B6],
      );

      drawChart({
        curveLabel: "Trapecios de Integración",
        curvePoints,
        fillArea: true,
        verticals: xData.map((x, i) => ({ x, y: yData[i] })),
        verticalsLabel: "Divisiones (nodos)",
      });
    },

    simpson() {
      const simp = computeSimpson(xData, yData, splines);
      setPrimaryResult(
        simp.discreteIntegral,
        "Integral calculada",
        `Intervalo [${xMin}, ${xMax}] · Simpson`,
        "integral",
      );
      const trap = computeTrapezoidalRule(xData, yData);
      const curvePoints = [];
      simp.rows.forEach((r) => {
        const px = xData.slice(r.i0, r.i1 + 1),
          py = yData.slice(r.i0, r.i1 + 1);
        for (let k = 0; k <= 16; k++) {
          const xv = px[0] + ((px[px.length - 1] - px[0]) * k) / 16;
          curvePoints.push({ x: xv, y: evaluateLagrange(xv, px, py) });
        }
      });
      const nodeIdx = [simp.rows[0].i0, ...simp.rows.map((r) => r.i1)];

      titleEl.textContent =
        "Integración Numérica: Regla de Simpson 1/3" +
        (simp.used38 ? " (con 3/8 en el último tramo)" : "");
      let txt = `La integral por paneles de Simpson sobre los datos es <strong>I ≈ ${simp.discreteIntegral.toFixed(6)}</strong>. Como referencia, la integral exacta del spline cúbico que pasa por los datos es ${simp.splineIntegral.toFixed(6)}.`;
      const notes = [];
      if (!simp.uniform)
        notes.push(
          "La malla es <strong>no uniforme</strong>: se usó la fórmula de Simpson generalizada para pasos h₁ ≠ h₂.",
        );
      if (simp.used38)
        notes.push(
          "El número de subintervalos es impar: los últimos 3 se integraron con <strong>Simpson 3/8</strong>.",
        );
      if (simp.richardson)
        notes.push(
          `Estimación de error (Richardson, h vs 2h): E ≈ ${simp.richardson.errEst.toExponential(3)}.`,
        );
      else
        notes.push(
          `Indicador: |I<sub>Simpson</sub> − I<sub>Trapecio</sub>| = ${Math.abs(simp.discreteIntegral - trap.totalArea).toExponential(3)} (el Trapecio es el menos preciso de los dos).`,
        );
      txt += `<div class="analytic-note info-note">${notes.join("<br>")}</div>`;
      if (currentAnalytic) {
        const ex = currentAnalytic.F(xMax) - currentAnalytic.F(xMin);
        txt += analyticNote(
          `Integral analítica de ${currentAnalytic.label} = ${ex.toFixed(6)} · Simpson: ${errText(simp.discreteIntegral, ex)} · Trapecio: ${errText(trap.totalArea, ex)}`,
        );
      }
      summaryEl.innerHTML = txt;

      methodTableTitle.textContent = "Cálculo por Paneles de Simpson";
      setTable(
        [
          " # ",
          "Tramo Evaluado",
          "Regla del Panel",
          "Paso h Promedio",
          "Integral del Panel",
          "Integral Acumulada",
        ],
        simp.rows.map((r, idx) => [
          idx + 1,
          r.tramo,
          r.regla,
          r.h,
          r.area,
          r.acum,
        ]),
        [F0, F0, F0, F4, F6, B6],
      );

      drawChart({
        curveLabel:
          "Arcos de Simpson (parábola por 3 nodos; cúbica por 4 en el panel 3/8)",
        curvePoints,
        fillArea: true,
        verticals: nodeIdx.map((i) => ({ x: xData[i], y: yData[i] })),
        verticalsLabel: "Límites de panel",
      });
    },
  };

  // --- MÉTODOS DE BÚSQUEDA DE RAÍCES: g(x) = S(x) - yRef = 0 ---
  const solveRoot = (m) => {
    const useUser = !!P.userF;
    const fSrc = useUser
      ? (x) => P.userF(x)
      : (x) => evaluateSpline(x, splines);
    const g = (x) => fSrc(x) - yRef;
    const dg = useUser
      ? (x) => {
          const hh = 1e-6 * Math.max(1, Math.abs(x));
          return (P.userF(x + hh) - P.userF(x - hh)) / (2 * hh);
        }
      : (x) => evaluateSplineDerivative(x, splines);

    const curvePoints = denseX.map((x) => ({ x, y: g(x) }));
    const zeroLine = [
      { x: xMin, y: 0 },
      { x: xMax, y: 0 },
    ];
    const gVals = curvePoints.map((p) => p.y).filter(Number.isFinite);
    const fMin = Math.min(...gVals) + yRef,
      fMax = Math.max(...gVals) + yRef;

    const allBr = findBrackets(g, xMin, xMax, 400, { tol, yRef }); // todos los cruces del dominio
    const intBr = findBrackets(g, rA, rB, 400, { tol, yRef }); // cruces dentro de [a, b]
    const acceptableResidual = rootResidualCheck(g, rA, rB, tol, yRef);
    const refine = (br) =>
      br.a === br.b
        ? br.a
        : br.a - (g(br.a) * (br.b - br.a)) / (g(br.b) - g(br.a));

    const noRootMsg =
      allBr.length === 0
        ? yRef < fMin || yRef > fMax
          ? `Y<sub>ref</sub> = ${yRef} está fuera del rango de f(x) en el dominio de los datos [${fMin.toFixed(4)}, ${fMax.toFixed(4)}]: no se detectó una raíz en el muestreo.`
          : `No se confirmó un cruce continuo y finito de Y<sub>ref</sub> = ${yRef}. Un cambio de signo en una discontinuidad no es una raíz.`
        : "";

    // Intervalo de trabajo: [a, b] del usuario si g cambia de signo en sus extremos; si no, el primer cruce interno
    let br = null;
    if (validRootBracket(g, rA, rB, tol, yRef)) br = { a: rA, b: rB, own: true };
    else if (intBr.length) br = { a: intBr[0].a, b: intBr[0].b, own: false };

    let rootNote = "";
    if (br && !br.own)
      rootNote = `g no cambia de signo entre a y b, pero hay ${intBr.length} cruce(s) dentro; se usó el primero: [${br.a.toFixed(4)}, ${br.b.toFixed(4)}].`;
    else if (intBr.length > 1)
      rootNote = `Hay ${intBr.length} cruces en [a, b]; el método converge a uno de ellos. Acota [a, b] para elegir cuál.`;
    const rootNoteHtml = rootNote
      ? `<div class="method-notes">${rootNote}</div>`
      : "";

    const rootAnalytic = (xr) => {
      if (!currentAnalytic || P.userF) return "";
      const r = currentAnalytic.f(xr) - yRef;
      return analyticNote(
        `Con la solución analítica ${currentAnalytic.label}: f(x<sub>r</sub>) − Y<sub>ref</sub> = ${r.toExponential(3)} (residuo de la raíz encontrada).`,
      );
    };

    const failHtml = (reason, xLast) =>
      `<span class="numeric-error"><strong>No convergió:</strong> ${reason}</span> <em>Prueba acotar [a, b] alrededor de un cruce visible en la gráfica, o cambia Y<sub>ref</sub>.</em>` +
      (xLast !== undefined
        ? ` Último iterado: x = ${xLast.toFixed(6)}, g(x) = ${g(xLast).toExponential(3)}.`
        : "");

    const rootChart = (xr, ok, errs, errLabel) => {
      setPrimaryResult(
        ok ? xr : null,
        ok ? "Raíz encontrada" : "Sin convergencia",
        ok
          ? `f(x) = ${yRef} · tolerancia ${tol}`
          : "Ajusta el intervalo [a, b] o el valor de Yref.",
        "root",
      );
      drawChart({
        curveLabel: `Función Objetivo g(x) = f(x) - ${yRef}`,
        curvePoints,
        secondaryCurveLabel: "Nivel g(x) = 0",
        secondaryPoints: zeroLine,
        highlightPoint: ok
          ? { x: xr, y: 0, label: `Raíz x = ${xr.toFixed(5)}` }
          : null,
        hideRawY: true,
      });
      if (errs && errs.length) setConvergence(errs, errLabel);
    };

    // ¿el iterado final es realmente una raíz? (evita dar por buena una parada en el borde o un punto sin raíz)
    const verifyRoot = (x, conv, reasonIn, clamped) => {
      if (!conv) return { ok: false, reason: reasonIn };
      if (!acceptableResidual(x)) {
        return {
          ok: false,
          reason: clamped
            ? `el iterado quedó detenido en el borde del dominio con |g(x)| = ${Math.abs(g(x)).toExponential(2)} (no hay raíz alcanzable desde ese punto). ${noRootMsg}`
            : `se cumplió |Δx| < tolerancia pero |g(x)| = ${Math.abs(g(x)).toExponential(2)} sigue siendo grande (posible estancamiento o ausencia de raíz). ${noRootMsg}`,
        };
      }
      return { ok: true, reason: "" };
    };

    if (m === "grafico") {
      const rts = allBr.map(refine);
      if (rts.length === 1)
        setPrimaryResult(
          rts[0],
          "Raíz estimada",
          `Cruce gráfico de f(x) = ${yRef}`,
          "root",
        );
      else if (rts.length > 1)
        setPrimaryResult(
          rts.length,
          "Raíces detectadas",
          rts.map((x) => x.toFixed(6)).join(" · "),
          "count",
        );
      else
        setPrimaryResult(
          null,
          "No se detectó una raíz",
          "Prueba otro valor de Yref o una función distinta.",
          "root",
        );
      let scanRows = [];
      for (let i = 0; i < denseX.length; i += 5) {
        const xv = denseX[i];
        scanRows.push([xv, fSrc(xv), g(xv)]);
      }

      titleEl.textContent = `Método Gráfico para Raíces: f(x) - ${yRef} = 0`;
      if (rts.length === 0)
        summaryEl.innerHTML = `${noRootMsg} Cambia el valor de Y<sub>ref</sub> arriba para intersectar la curva.`;
      else if (rts.length === 1)
        summaryEl.innerHTML =
          `Inspeccionando el cruce por el eje cero de <strong>g(x) = f(x) - ${yRef}</strong>, se detecta cambio de signo en <strong>[${allBr[0].a.toFixed(4)}, ${allBr[0].b.toFixed(4)}]</strong> con raíz visual en <strong>x ≈ ${rts[0].toFixed(4)}</strong>.` +
          rootAnalytic(rts[0]);
      else
        summaryEl.innerHTML =
          `Se detectan <strong>${rts.length} cruces</strong> de g(x) = f(x) - ${yRef} con el eje cero, en <strong>x ≈ ${rts.map((r) => r.toFixed(4)).join(", ")}</strong>. Usa [a, b] para refinar una de ellas con los otros métodos.` +
          rootAnalytic(rts[0]);

      methodTableTitle.textContent = "Barrido de Inspección del Método Gráfico";
      setTable(["x", "f(x)", "g(x) = f(x) - Y<sub>ref</sub>"], scanRows, [
        F4,
        F5,
        F5,
      ]);

      drawChart({
        curveLabel: `g(x) = f(x) - ${yRef}`,
        curvePoints,
        secondaryCurveLabel: "Eje Cero (g(x) = 0)",
        secondaryPoints: zeroLine,
        highlightPoints: rts.map((x) => ({ x, y: 0 })),
        highlightLabel: rts.length
          ? `Raíces detectadas (${rts.length}): ${rts.map((r) => r.toFixed(3)).join(", ")}`
          : "",
        hideRawY: true,
      });
    } else if (m === "biseccion") {
      const { iters, x: xr, converged, reason } = iterateRoot(m, { g, dg, br, rA, rB, xMin, xMax, tol, yRef });

      titleEl.textContent = `Método de Bisección (f(x) - ${yRef} = 0)`;
      if (!br) {
        summaryEl.innerHTML = `En [${rA.toFixed(4)}, ${rB.toFixed(4)}] g(x) no cambia de signo y no hay cruces internos, así que Bisección no puede garantizar una raíz. ${noRootMsg || "Ajusta el intervalo [a, b] o Y<sub>ref</sub>."}`;
      } else if (!converged) {
        summaryEl.innerHTML =
          failHtml(reason || "no se alcanzó una raíz con residuo válido", xr) + rootNoteHtml;
      } else {
        summaryEl.innerHTML =
          `Partiendo de [${br.a.toFixed(4)}, ${br.b.toFixed(4)}], la raíz converge en <strong>x = ${xr.toFixed(6)}</strong> tras <strong>${iters.length} iteraciones</strong> (donde f(x) alcanza el valor ${yRef}).` +
          rootNoteHtml +
          rootAnalytic(xr);
      }

      methodTableTitle.textContent =
        "Tabla de Iteraciones del Método de Bisección";
      setTable(
        [
          "Iteración k",
          "x<sub>inf</sub> (a)",
          "x<sub>sup</sub> (b)",
          "Raíz x<sub>r</sub>",
          "g(x<sub>r</sub>)",
          "Error máx. (b−a)/2",
        ],
        iters.map((it) => [it.k, it.a, it.b, it.xr, it.fxr, it.err]),
        [F0, F6, F6, B6, FE, FE],
      );
      lastIterations = iters.map((it) => ({ ...it, x: it.xr, y: it.fxr }));
      rootChart(
        xr,
        br && converged,
        iters.map((i) => i.err),
        "Error máx. (b−a)/2",
      );
    } else if (m === "newton_raphson") {
      const { iters, x: xk, converged, reason, clamped } = iterateRoot(m, { g, dg, br, rA, rB, xMin, xMax, tol, yRef });
      const v = verifyRoot(xk, converged, reason, clamped);

      titleEl.textContent = `Método de Newton-Raphson (f(x) - ${yRef} = 0)`;
      if (!v.ok) summaryEl.innerHTML = failHtml(v.reason, xk) + rootNoteHtml;
      else
        summaryEl.innerHTML =
          `Con convergencia cuadrática, la raíz se encontró en <strong>x = ${xk.toFixed(6)}</strong> en solo <strong>${iters.length} iteraciones</strong>.` +
          rootNoteHtml +
          rootAnalytic(xk);

      methodTableTitle.textContent =
        "Tabla de Iteraciones de Newton-Raphson: xₖ₊₁ = xₖ - g(xₖ)/g'(xₖ)";
      setTable(
        ["Iter k", "xₖ", "g(xₖ)", "Derivada g'(xₖ)", "xₖ₊₁", "Error |Δx|"],
        iters.map((it) => [it.k, it.xk, it.fx, it.dfx, it.xNext, it.err]),
        [F0, F6, FE, F5, B6, FE],
      );
      lastIterations = iters.map((it) => ({ ...it, x: it.xNext, y: g(it.xNext) }));
      rootChart(
        xk,
        v.ok,
        iters.map((i) => i.err),
        "Error |Δx|",
      );
    } else if (m === "secante") {
      const { iters, x: x1, converged, reason, clamped } = iterateRoot(m, { g, dg, br, rA, rB, xMin, xMax, tol, yRef });
      const v = verifyRoot(x1, converged, reason, clamped);

      titleEl.textContent = `Método de la Secante (f(x) - ${yRef} = 0)`;
      if (!v.ok) summaryEl.innerHTML = failHtml(v.reason, x1) + rootNoteHtml;
      else
        summaryEl.innerHTML =
          `Aproximando la derivada mediante rectas secantes, la raíz convergió a <strong>x = ${x1.toFixed(6)}</strong> en <strong>${iters.length} iteraciones</strong>.` +
          rootNoteHtml +
          rootAnalytic(x1);

      methodTableTitle.textContent =
        "Tabla de Iteraciones del Método de la Secante";
      setTable(
        ["Iter k", "xₖ₋₁", "xₖ", "g(xₖ)", "xₖ₊₁", "Error |Δx|"],
        iters.map((it) => [it.k, it.x0, it.x1, it.fx1, it.x2, it.err]),
        [F0, F6, F6, FE, B6, FE],
      );
      lastIterations = iters.map((it) => ({ ...it, x: it.x2, y: g(it.x2), fx0: g(it.x0) }));
      rootChart(
        x1,
        v.ok,
        iters.map((i) => i.err),
        "Error |Δx|",
      );
    }
  };
  ["grafico", "biseccion", "newton_raphson", "secante"].forEach((k) => {
    methods[k] = () => solveRoot(k);
  });

  if (methods[methodName]) methods[methodName]();
  lastRunValid = true;
}

// =========================================================================
// 5. MOTOR DE GRAFICACIÓN INTERACTIVA CON CHART.JS
// =========================================================================
function drawChart(options) {
  const canvas = $("mainChart");
  const ctx = canvas.getContext("2d");
  canvas.setAttribute("aria-label", "Gráfica: " + $("methodTitle").textContent);

  let datasets = [];

  // Puntos discretos del Excel (si no es gráfico de g(x) desplazado)
  if (!options.hideRawY) {
    datasets.push({
      id: "observations",
      label: `Datos Experimentales / Simulados (${colYName})`,
      data: xData.map((x, i) => ({ x, y: yData[i] })),
      backgroundColor: "#bd5853",
      borderColor: "#bd5853",
      pointRadius: 3.5,
      pointHoverRadius: 7,
      showLine: false,
      type: "scatter",
    });
  }

  // Divisiones verticales (Trapecio / Simpson)
  if (options.verticals && options.verticals.length) {
    const pts = [];
    options.verticals.forEach((v) => {
      pts.push({ x: v.x, y: 0 }, { x: v.x, y: v.y }, { x: v.x, y: NaN });
    });
    datasets.push({
      id: "panels",
      label: options.verticalsLabel || "Divisiones",
      data: pts,
      borderColor: "rgba(24, 104, 219, 0.55)",
      borderWidth: 1,
      pointRadius: 0,
      showLine: true,
      spanGaps: false,
      tension: 0,
    });
  }

  // Curva principal del método numérico (tension 0: los tramos rectos se dibujan rectos)
  datasets.push({
    id: "approximation",
    label: options.curveLabel,
    data: options.curvePoints,
    borderColor: "#285bc5",
    backgroundColor: options.fillArea
      ? "rgba(36, 89, 189, 0.10)"
      : "transparent",
    borderWidth: 2.5,
    pointRadius: 0,
    fill: !!options.fillArea,
    showLine: true,
    tension: 0,
  });

  // Curva secundaria (Derivada o Eje Cero)
  if (options.secondaryPoints) {
    datasets.push({
      id: "secondary",
      label: options.secondaryCurveLabel,
      data: options.secondaryPoints,
      borderColor: "#0d9488",
      backgroundColor: "#0d9488",
      borderDash: [6, 4],
      borderWidth: 2,
      pointRadius: options.hideRawY ? 0 : 3,
      yAxisID: options.secondaryAxis ? "y2" : "y",
      showLine: true,
      tension: 0,
    });
  }

  // Curvas adicionales (solución analítica de la derivada)
  (options.extraCurves || []).forEach((c, index) => {
    datasets.push({
      id: `reference-${index}`,
      label: c.label,
      data: c.points,
      borderColor: c.color || "#a46b32",
      backgroundColor: c.color || "#a46b32",
      borderDash: c.dash || [],
      borderWidth: 2,
      pointRadius: 0,
      yAxisID: c.yAxisID || "y",
      showLine: true,
      tension: 0,
    });
  });

  // Punto(s) destacado(s) (valor interpolado o raíces encontradas)
  const hp =
    options.highlightPoints && options.highlightPoints.length
      ? {
          points: options.highlightPoints,
          label: options.highlightLabel || "Raíces",
        }
      : options.highlightPoint
        ? {
            points: [options.highlightPoint],
            label: options.highlightPoint.label,
          }
        : null;
  if (hp) {
    datasets.push({
      id: "highlight",
      label: hp.label,
      data: hp.points.map((p) => ({ x: p.x, y: p.y })),
      backgroundColor: "#087e5b",
      borderColor: "#111827",
      borderWidth: 2,
      pointRadius: 6,
      pointStyle: "circle",
      showLine: false,
      type: "scatter",
    });
  }

  chartInstance = updatePersistentChart(chartInstance, ctx, {
    type: "scatter",
    data: { datasets },
    options: {
      animation: chartAnimation(),
      onClick: (event, elements, chart) => {
        if (!lastRunValid || !["lagrange", "newton_dd", "matricial", "splines", "derivadas"].includes(currentMethod)) return;
        if (!chart.isPointInArea({ x: event.x, y: event.y })) return;
        window.LabWorkbench?.selectX(chart.scales.x.getValueForPixel(event.x));
      },
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: {
          type: "linear",
          position: "bottom",
          title: {
            display: true,
            text: options.xTitle || colXName,
            font: { weight: "bold" },
          },
        },
        y: {
          title: {
            display: true,
            text: options.yTitle || colYName,
            font: { weight: "bold" },
          },
        },
        ...(options.secondaryAxis
          ? {
              y2: {
                position: "right",
                grid: { drawOnChartArea: false },
                title: {
                  display: true,
                  text: "f'(x) (derivada)",
                  font: { weight: "bold" },
                },
              },
            }
          : {}),
      },
      plugins: {
        legend: {
          position: "bottom",
          labels: {
            usePointStyle: true,
            boxWidth: 6,
            boxHeight: 6,
            padding: 15,
            font: { size: 11 },
          },
        },
        tooltip: {
          callbacks: {
            label: (context) =>
              `(${context.parsed.x.toFixed(4)}, ${context.parsed.y.toFixed(4)})`,
          },
        },
      },
    },
  });
}

// Al cambiar un parámetro se vuelve a ejecutar el método activo (con retardo para no recalcular en cada tecla)
let debounceTimer = null;
function onParamChange() {
  lastRunValid = false;
  window.LabWorkbench?.pending();
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    if ($("workspace").style.display !== "block" || xData.length < 2) return;
    runMethod(currentMethod);
  }, 350);
}
["evalX", "targetY", "rootTol", "nNodes", "rootA", "rootB", "fExpr"].forEach(
  (id) => {
    $(id).addEventListener("input", onParamChange);
    $(id).addEventListener("change", onParamChange);
  },
);

// El teclado siempre responde sin animación. El puntero permite movimientos
// breves únicamente al desplegar controles, nunca durante los cálculos.
document.documentElement.dataset.inputModality = "pointer";
document.addEventListener(
  "keydown",
  () => {
    document.documentElement.dataset.inputModality = "keyboard";
  },
  { capture: true },
);
document.addEventListener(
  "pointerdown",
  () => {
    document.documentElement.dataset.inputModality = "pointer";
  },
  { capture: true },
);

function setMenuOpen(open, { immediate = false } = {}) {
  const nav = $("methodNav");
  const mobile = window.innerWidth <= 1050;
  document
    .querySelector(".sidebar")
    .classList.toggle("menu-open", mobile && open);
  $("menuToggle").setAttribute("aria-expanded", String(mobile && open));
  if (!mobile) {
    window.LabMotion?.clear(nav);
    nav.hidden = false;
    nav.inert = false;
    nav.removeAttribute("aria-hidden");
    nav.dataset.open = "true";
  } else if (window.LabMotion)
    window.LabMotion.disclosure(nav, open, { immediate, menu: true });
  else {
    nav.hidden = !open;
    nav.inert = !open;
  }
}

// Controles de presentación. Los métodos numéricos permanecen independientes.
$("menuToggle").addEventListener("click", (event) => {
  if (event.detail === 0)
    document.documentElement.dataset.inputModality = "keyboard";
  const open = $("menuToggle").getAttribute("aria-expanded") !== "true";
  setMenuOpen(open);
});
document
  .querySelector(".brand")
  .addEventListener("click", () => setMenuOpen(false));
$("sourceToggle").addEventListener("click", (event) => {
  if (event.detail === 0)
    document.documentElement.dataset.inputModality = "keyboard";
  const open = $("sourceToggle").getAttribute("aria-expanded") !== "true";
  if (window.LabMotion) window.LabMotion.disclosure($("sourceControls"), open);
  else {
    $("sourceControls").hidden = !open;
    $("sourceControls").inert = !open;
  }
  $("sourceToggle").setAttribute("aria-expanded", String(open));
  $("sourceToggle").textContent = open ? "Ocultar opciones" : "Cambiar datos";
});
document.addEventListener("pointerdown", (event) => {
  if (!document.querySelector(".sidebar").contains(event.target))
    setMenuOpen(false);
});
document.querySelector(".sidebar").addEventListener("focusout", (event) => {
  if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget))
    setMenuOpen(false);
});
window.addEventListener("resize", () =>
  setMenuOpen(false, { immediate: true }),
);
setMenuOpen(false, { immediate: true });
$("sourceControls").inert = $("sourceControls").hidden;
const dropArea = $("fileDrop");
["dragenter", "dragover"].forEach((event) =>
  dropArea.addEventListener(event, (e) => {
    e.preventDefault();
    dropArea.classList.add("drag-over");
  }),
);
["dragleave", "drop"].forEach((event) =>
  dropArea.addEventListener(event, (e) => {
    e.preventDefault();
    dropArea.classList.remove("drag-over");
  }),
);
dropArea.addEventListener("drop", (e) => readDataFile(e.dataTransfer.files[0]));
document.addEventListener("keydown", (e) => {
  if (
    e.key === "Escape" &&
    document.querySelector(".sidebar").classList.contains("menu-open")
  ) {
    setMenuOpen(false);
    $("menuToggle").focus();
  }
});

// Structured calculation and session services shared by the interactive workbench.
function iterateRoot(method, { g, dg, br, rA, rB, xMin, xMax, tol, yRef = 0 }) {
  const iters = [];
  let x = NaN, converged = false, reason = "", clamped = false;
  const accepted = rootResidualCheck(g, rA, rB, tol, yRef);
  const done = () => ({ iters, x, converged, reason, clamped });
  if (br) {
    for (const endpoint of [br.a, br.b]) if (g(endpoint) === 0) { x = endpoint; converged = true; return done(); }
  }
  if (method === "biseccion") {
    if (br) {
      let a = br.a, b = br.b;
      for (let k = 1; k <= 60; k++) {
        x = a + (b - a) / 2;
        const fxr = g(x), fxa = g(a), err = (b - a) / 2;
        if (!Number.isFinite(fxr) || !Number.isFinite(fxa)) { reason = "la función no es finita dentro del intervalo"; break; }
        iters.push({ k, a, b, xr: x, fxr, err });
        if (fxr === 0 || (err < tol && accepted(x))) { converged = true; break; }
        if (x === a || x === b) { reason = "el intervalo dejó de reducirse sin alcanzar un residuo válido"; break; }
        if (changesSign(fxa, fxr)) b = x; else a = x;
      }
    }
    if (!converged && !reason) reason = br ? "se agotaron las 60 iteraciones sin alcanzar el residuo requerido" : "no se confirmó un cruce continuo y finito en el intervalo";
  } else if (method === "newton_raphson") {
    x = br ? (br.a + br.b) / 2 : (rA + rB) / 2;
    for (let k = 1; k <= 30; k++) {
      const fx = g(x);
      if (!Number.isFinite(fx)) { reason = "la función no es finita en el iterado"; break; }
      if (fx === 0) { converged = true; break; }
      const dfx = dg(x);
      if (!Number.isFinite(dfx) || dfx === 0) { reason = "la pendiente es nula o no es finita; el paso de Newton no está definido"; break; }
      const raw = x - fx / dfx;
      if (!Number.isFinite(raw)) { reason = "el paso de Newton no es finito"; break; }
      const xNext = Math.max(xMin, Math.min(xMax, raw));
      clamped = raw !== xNext;
      const err = Math.abs(xNext - x);
      iters.push({ k, xk: x, fx, dfx, xNext, err });
      x = xNext;
      if (g(x) === 0 || (err < tol && accepted(x))) { converged = true; break; }
      if (err === 0) { reason = "el iterado quedó detenido sin alcanzar el valor objetivo"; break; }
    }
    if (!converged && !reason) reason = "no se alcanzó la tolerancia y el residuo requerido en 30 iteraciones";
  } else {
    let x0 = br ? br.a : rA, x1 = br ? br.b : rB;
    x = x1;
    for (const initial of [x0, x1]) if (g(initial) === 0) { x = initial; converged = true; return done(); }
    for (let k = 1; k <= 35; k++) {
      const fx0 = g(x0), fx1 = g(x1), denominator = fx1 - fx0;
      if (![fx0, fx1, denominator].every(Number.isFinite)) { reason = "la función o la pendiente secante no es finita"; break; }
      if (denominator === 0) { reason = "la recta secante es horizontal y no corta el eje"; break; }
      const raw = x1 - fx1 / denominator * (x1 - x0);
      if (!Number.isFinite(raw)) { reason = "el paso de la secante no es finito"; break; }
      const x2 = Math.max(xMin, Math.min(xMax, raw));
      clamped = raw !== x2;
      const err = Math.abs(x2 - x1);
      iters.push({ k, x0, x1, fx1, x2, err });
      x0 = x1; x1 = x2; x = x2;
      if (g(x) === 0 || (err < tol && accepted(x))) { converged = true; break; }
      if (err === 0) { reason = "la secante quedó detenida sin alcanzar el valor objetivo"; break; }
    }
    if (!converged && !reason) reason = "no se alcanzó la tolerancia y el residuo requerido en 35 iteraciones";
  }
  return done();
}
function computeComparison(method) {
  if (!lastRunValid) throw new Error("Corrige los parámetros antes de comparar.");
  const polynomial = ["lagrange", "newton_dd", "matricial"];
  const interpolation = [...polynomial, "splines"];
  const roots = ["biseccion", "newton_raphson", "secante"];
  const compatible = interpolation.includes(currentMethod) ? interpolation : ["trapecio", "simpson"].includes(currentMethod) ? ["trapecio", "simpson"] : roots.includes(currentMethod) ? roots : [];
  if (!compatible.includes(method)) throw new Error("Elige un método compatible con la magnitud actual.");
  const splines = buildNaturalCubicSplines(xData, yData);
  const selected = pickNodes(P.xEval);
  let value, points = [], exact = null, iterations = null, residual = null;
  if (interpolation.includes(method)) {
    let fn;
    if (method === "lagrange") fn = (x) => evaluateLagrange(x, selected.xs, selected.ys);
    if (method === "newton_dd") { const table = computeNewtonDividedDiffTable(selected.xs, selected.ys); fn = (x) => evaluateNewtonPoly(x, selected.xs, table); }
    if (method === "matricial") {
      const matrix = computeMatrixPolynomial(selected.xs, selected.ys);
      if (matrix.singular) throw new Error("El sistema matricial es singular; reduce los nodos.");
      fn = (x) => evaluateMatrixPoly(x, matrix);
    }
    if (method === "splines") fn = (x) => evaluateSpline(x, splines);
    value = fn(P.xEval);
    points = Array.from({ length: 141 }, (_, i) => {
      const x = xData[0] + i / 140 * (xData.at(-1) - xData[0]); return { x, y: fn(x) };
    });
    if (currentAnalytic) exact = currentAnalytic.f(P.xEval);
  } else if (["trapecio", "simpson"].includes(method)) {
    value = method === "trapecio" ? computeTrapezoidalRule(xData, yData).totalArea : computeSimpson(xData, yData, splines).discreteIntegral;
    if (method === "trapecio") points = xData.map((x, i) => ({ x, y: yData[i] }));
    else for (const panel of computeSimpson(xData, yData, splines).rows) {
      const xs = xData.slice(panel.i0, panel.i1 + 1), ys = yData.slice(panel.i0, panel.i1 + 1);
      for (let i = 0; i <= 20; i++) { const x = xs[0] + i / 20 * (xs.at(-1) - xs[0]); points.push({ x, y: evaluateLagrange(x, xs, ys) }); }
    }
    if (currentAnalytic) exact = currentAnalytic.F(xData.at(-1)) - currentAnalytic.F(xData[0]);
  } else {
    const f = P.userF || ((x) => evaluateSpline(x, splines));
    const g = (x) => f(x) - P.yRef;
    const dg = P.userF ? (x) => { const h = 1e-6 * Math.max(1, Math.abs(x)); return (f(x + h) - f(x - h)) / (2 * h); } : (x) => evaluateSplineDerivative(x, splines);
    const crossings = findBrackets(g, P.rA, P.rB, 400, { tol: P.tol, yRef: P.yRef });
    const br = validRootBracket(g, P.rA, P.rB, P.tol, P.yRef) ? { a: P.rA, b: P.rB } : crossings[0] || null;
    const result = iterateRoot(method, { g, dg, br, ...P, xMin: xData[0], xMax: xData.at(-1) });
    residual = Math.abs(g(result.x));
    if (!result.converged || !rootResidualCheck(g, P.rA, P.rB, P.tol, P.yRef)(result.x))
      return { method, label: METHOD_NAMES[method], value: null, points: [], exact: null, error: null, iterations: result.iters.length, residual: Number.isFinite(residual) ? residual : null, reason: result.reason || "No se alcanzó un residuo válido." };
    value = result.x; iterations = result.iters.length;
  }
  if (!Number.isFinite(value)) throw new Error("El cálculo no produjo un valor finito.");
  return { method, label: METHOD_NAMES[method], value, points, exact, error: exact === null ? null : Math.abs(value - exact), iterations, residual };
}
function captureExperiment() {
  if (!lastRunValid) throw new Error("Calcula con parámetros válidos antes de guardar.");
  return { version: 1, method: currentMethod, params: Object.fromEntries(PARAM_IDS.map((id) => [id, $(id).value])),
    xs: [...xData], ys: [...yData], xLabel: colXName, yLabel: colYName, source: $("sourceName").textContent,
    demo: currentAnalytic ? currentDemoKey : null };
}
function restoreExperiment(snapshot) {
  if (!snapshot || snapshot.version !== 1 || !Object.hasOwn(METHOD_NAMES, snapshot.method) || !Array.isArray(snapshot.xs) || !Array.isArray(snapshot.ys) || snapshot.xs.length < 2 || snapshot.xs.length > 20000 || snapshot.xs.length !== snapshot.ys.length || !snapshot.xs.every((x, i) => Number.isFinite(x) && (i === 0 || x - snapshot.xs[i - 1] > 1e-12)) || !snapshot.ys.every(Number.isFinite) || !snapshot.params || !PARAM_IDS.every((id) => typeof snapshot.params[id] === "string" && snapshot.params[id].length <= 1000)) throw new Error("El experimento guardado no tiene un formato válido.");
  cancelPendingImport();
  clearTimeout(debounceTimer);
  xData = [...snapshot.xs]; yData = [...snapshot.ys];
  colXName = String(snapshot.xLabel || "X").slice(0, 120); colYName = String(snapshot.yLabel || "Y").slice(0, 120);
  colIdxX = 0; colIdxY = 1;
  lastRows = [[colXName, colYName], ...xData.map((x, i) => [x, yData[i]])];
  $("hdrMode").value = "yes";
  setupColumnSelectors(lastRows, 2);
  currentAnalytic = null; currentDemoKey = null;
  const demo = snapshot.demo && Object.hasOwn(DEMO_SETS, snapshot.demo) ? DEMO_SETS[snapshot.demo] : null;
  if (demo && demo.rows.length - 1 === xData.length && demo.rows.slice(1).every((r, i) => toNum(r[0]) === xData[i] && toNum(r[1]) === yData[i])) {
    $("demoSelect").value = snapshot.demo; currentAnalytic = demo.analytic; currentDemoKey = snapshot.demo;
  }
  $("demoObservation").textContent = demo && currentDemoKey ? demo.guide || "" : "";
  PARAM_IDS.forEach((id) => { $(id).value = snapshot.params[id]; });
  $("sourceName").textContent = String(snapshot.source || "Experimento restaurado").slice(0, 180);
  $("dataStatus").textContent = xData.length + " puntos · experimento restaurado";
  renderRawDataTable();
  showFileError("");
  runMethod(snapshot.method);
}
function practiceReportData() {
  if (!lastRunValid) throw new Error("Corrige los parámetros antes de generar el informe.");
  return {
    method: currentMethod, title: $("methodTitle").textContent,
    source: $("sourceName").textContent, observation: $("demoObservation").textContent,
    primary: { ...primaryResult }, summary: $("methodSummary").textContent,
    params: activeParamIds(currentMethod).map((id) => {
      let value = $(id).value;
      if (id === "nNodes" && P.nNodes === 0) value = "Todos (" + xData.length + ")";
      if (id === "rootA" && !value) value = P.rA + " (automático)";
      if (id === "rootB" && !value) value = P.rB + " (automático)";
      if (id === "fExpr" && !value) value = "Spline cúbico natural de los datos";
      return [document.querySelector('label[for="' + id + '"]')?.textContent.trim() || id, value];
    }),
    calculations: lastTable ? lastTable.map((row) => [...row]) : [],
    data: [[colXName, colYName], ...xData.map((x, i) => [x, yData[i]])],
    chart: chartInstance, convergence: $("convContainer").style.display === "none" ? null : convChartInstance,
  };
}
window.NumericalLab = {
  names: METHOD_NAMES,
  state: () => ({ method: currentMethod, valid: lastRunValid, params: P, xs: [...xData], ys: [...yData], selected: P ? pickNodes(P.xEval) : null, primary: primaryResult, iterations: lastIterations, chart: chartInstance, convergence: convChartInstance }),
  compare: computeComparison,
  capture: captureExperiment,
  restore: restoreExperiment,
  report: practiceReportData,
  update: (id, value, deferred = false) => {
    if (!PARAM_IDS.includes(id)) return;
    $(id).value = value;
    clearTimeout(debounceTimer);
    if (deferred) onParamChange(); else runMethod(currentMethod);
  },
  reset: () => {
    const defaults = { evalX: (xData[0] + xData.at(-1)) / 2, nNodes: Math.min(5, xData.length), targetY: (Math.min(...yData) + Math.max(...yData)) / 2, rootTol: 0.0001, rootA: "", rootB: "", fExpr: "" };
    clearTimeout(debounceTimer);
    activeParamIds(currentMethod).forEach((id) => { $(id).value = defaults[id]; });
    runMethod(currentMethod);
  },
};

// Una simulación identificada ofrece un análisis real desde la primera visita.
loadDemoCircuitData();
