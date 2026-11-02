/* Standalone practice reports keep numeric data, context and charts together offline. */
(() => {
  const lab = window.NumericalLab;
  if (!lab) return;
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  const number = (value) => Number.isFinite(value) ? String(value) : "Sin resultado";
  function table(rows) {
    if (!rows.length) return "<p>No hay filas de cálculo para este caso.</p>";
    const [headers, ...body] = rows;
    return `<div class="table-wrap"><table${headers.length > 8 ? ' class="wide"' : ""}><thead><tr>${headers.map((heading) => `<th>${escape(heading)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  }
  function chartImage(chart) {
    if (!chart) return "";
    chart.stop(); chart.update("none");
    const source = chart.canvas || (chart === lab.state().chart ? document.getElementById("mainChart") : document.getElementById("convChart"));
    const canvas = document.createElement("canvas");
    canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext("2d");
    context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, 0, 0);
    const image = canvas.toDataURL("image/png");
    return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(image) ? image : "";
  }
  function build() {
    const context = window.LabWorkbench?.reportContext() || { comparison: [], step: null };
    const data = lab.report();
    const created = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
    const images = [];
    for (const [chart, label] of [[data.chart, "Visualización del método"], [data.convergence, "Convergencia del cálculo"]]) {
      if (!chart) continue;
      let image = "";
      try { image = chartImage(chart); } catch {}
      images.push(image ? `<figure><img src="${image}" alt="${label}"/><figcaption>${label}</figcaption></figure>` : `<p>${label}: no se pudo incluir la imagen. Los datos numéricos están disponibles en las tablas.</p>`);
    }
    const compared = context.comparison || [];
    let comparison = "";
    if (compared.length === 2) {
      const rows = [["Método", "Resultado", "Iteraciones", "Residuo |g(x)|", "Error absoluto frente a referencia", "Estado"], ...compared.map((item) => [item.label, number(item.value), item.iterations ?? "No aplica", item.residual === null ? "No aplica" : number(item.residual), item.error === null ? "Sin referencia analítica" : number(item.error), Number.isFinite(item.value) ? "Resultado disponible" : item.reason || "Sin convergencia"])];
      const difference = compared.every((item) => Number.isFinite(item.value)) ? `<p>Diferencia absoluta: <strong>${escape(Math.abs(compared[0].value - compared[1].value))} ${escape(data.primary.unit)}</strong>.</p>` : "<p>La diferencia no se calcula cuando algún método no converge.</p>";
      comparison = `<section><h2>Comparación de métodos</h2>${table(rows)}${difference}<p>La diferencia entre métodos no representa por sí sola el error real. La referencia analítica se muestra solo cuando está disponible.</p></section>`;
    }
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>Informe de práctica · ${escape(data.title)}</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f5f7fa;color:#172b42;font:14px/1.65 "Segoe UI",Arial,sans-serif}main{max-width:1050px;margin:32px auto;padding:36px;background:white}header{border-bottom:1px solid #cbd7e4;padding-bottom:20px}h1{font-size:25px;line-height:1.3;margin:8px 0 12px}h2{font-size:18px;margin:28px 0 12px}p{margin:8px 0;overflow-wrap:anywhere}small{color:#52657a}.result{font-size:28px;font-weight:700;color:#145c48}.table-wrap{overflow:auto;margin:16px 0}table{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums}th,td{padding:9px 10px;border:1px solid #d9e1eb;text-align:right;overflow-wrap:anywhere}th{background:#edf3f9}th:first-child,td:first-child{text-align:left}.wide{table-layout:fixed;font-size:9px}.wide td,.wide th{padding:5px 3px;word-break:break-all}figure{margin:20px 0;break-inside:avoid}img{display:block;max-width:100%;height:auto;margin:auto}figcaption{font-size:12px;color:#52657a;margin-top:8px}button{min-height:44px;padding:10px 18px;background:#285bc5;color:white;border:0;border-radius:8px;cursor:pointer;font:inherit}button:focus-visible{outline:3px solid #172b42;outline-offset:4px}.print-tools{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:24px}footer{margin-top:32px;padding-top:16px;border-top:1px solid #cbd7e4;font-size:12px;color:#52657a}@page{size:A4;margin:15mm}@media print{body{background:white;font-size:10pt}main{max-width:none;margin:0;padding:0}.print-tools{display:none}.table-wrap{overflow:visible}table{font-size:8pt}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}.wide{font-size:6pt}figure{max-width:100%}}
</style></head><body><main>
<div class="print-tools"><button type="button" onclick="window.print()">Imprimir / guardar como PDF</button><small>Este informe funciona sin conexión. Usa la impresión del navegador para guardarlo como PDF.</small></div>
<header><strong>FIEE · UNMSM — Laboratorio de métodos numéricos</strong><h1>${escape(data.title)}</h1><p>Informe de práctica · ${escape(created)} · hora de Colombia</p><p>Datos: ${escape(data.source)}</p></header>
<section><h2>Resultado del método</h2><p>${escape(data.primary.label)}</p><p class="result">${escape(number(data.primary.value))} ${escape(data.primary.unit)}</p><p>${escape(data.primary.context)}</p><p>${escape(data.summary)}</p>${data.observation ? `<p>${escape(data.observation)}</p>` : ""}</section>
<section><h2>Parámetros utilizados</h2>${data.params.length ? table([["Parámetro", "Valor"], ...data.params]) : "<p>Se utiliza todo el dominio de los datos; este método no requiere parámetros adicionales.</p>"}</section>
${comparison}
<section><h2>Gráficas</h2><p>Vista al exportar. El resultado destacado corresponde al cálculo final.${context.step ? " La gráfica incluye el paso seleccionado: " + escape(context.step) : ""}</p>${images.join("")}</section>
<section><h2>Cálculos e iteraciones</h2><p>Las tablas conservan los valores numéricos, sin el redondeo visual de la aplicación.</p>${table(data.calculations)}</section>
<section><h2>Datos originales</h2>${table(data.data)}</section>
<footer>Informe generado localmente en el navegador. Las oscilaciones de interpolación, el condicionamiento y la no convergencia deben interpretarse según las hipótesis de cada método.</footer>
</main></body></html>`;
    return { html, method: data.method };
  }
  function download() {
    try {
      const report = build();
      const blob = new Blob([report.html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob), anchor = document.createElement("a");
      anchor.href = url; anchor.download = "informe_" + report.method + ".html";
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      document.getElementById("workbenchNotice").textContent = "Informe descargado. Ábrelo y usa «Imprimir / guardar como PDF» si necesitas un PDF.";
    } catch (error) { document.getElementById("workbenchNotice").textContent = "No se pudo generar el informe: " + error.message; }
  }
  window.LabReport = { build, download };
  document.getElementById("downloadReport").addEventListener("click", download);
})();
