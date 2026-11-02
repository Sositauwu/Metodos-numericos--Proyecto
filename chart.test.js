// Verify real Chart.js point interpolation with a DOM fixture, without browser access.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
(async () => {
  const dom = new JSDOM(
    fs.readFileSync(path.join(__dirname, "index.html"), "utf8"),
    { runScripts: "outside-only", pretendToBeVisual: true },
  );
  const w = dom.window;
  w.matchMedia = (query) => ({
    matches: false,
    media: query,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  });
  w.HTMLCanvasElement.prototype.getContext = function () {
    if (this._context) return this._context;
    const context = {
      canvas: this,
      measureText: (text) => ({ width: String(text).length * 7 }),
      getLineDash: () => [],
      createLinearGradient: () => ({ addColorStop() {} }),
    };
    for (const method of [
      "save",
      "restore",
      "resetTransform",
      "setTransform",
      "clearRect",
      "beginPath",
      "closePath",
      "moveTo",
      "lineTo",
      "bezierCurveTo",
      "quadraticCurveTo",
      "rect",
      "clip",
      "arc",
      "ellipse",
      "stroke",
      "fill",
      "fillText",
      "strokeText",
      "setLineDash",
      "translate",
      "rotate",
      "scale",
      "fillRect",
      "strokeRect",
      "drawImage",
    ])
      context[method] = () => {};
    this._context = new Proxy(context, {
      get(target, key) {
        return key in target ? target[key] : undefined;
      },
      set(target, key, value) {
        target[key] = value;
        return true;
      },
    });
    return this._context;
  };
  const canvas = w.document.getElementById("mainChart");
  canvas.width = 640;
  canvas.height = 360;
  w.scrollTo = () => {};
  w.alert = () => {};
  w.XLSX = {};
  w.eval(fs.readFileSync(path.join(__dirname, "libs/chart.umd.js"), "utf8"));
  const RealChart = w.Chart;
  const charts = [];
  w.Chart = function (context, config) {
    // Fixed dimensions isolate coordinate animation from unavailable layout observers.
    config.options.responsive = false;
    config.options.events = [];
    const chart = new RealChart(context, config);
    const update = chart.update.bind(chart);
    chart.update = (mode) => {
      chart.config.options.responsive = false;
      chart.config.options.events = [];
      return update(mode);
    };
    charts.push(chart);
    return chart;
  };
  w.Chart.defaults = RealChart.defaults;
  w.eval(fs.readFileSync(path.join(__dirname, "app.js"), "utf8"));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  await wait(520);
  const chart = charts.find((c) => c.canvas.id === "mainChart");
  const series = chart.data.datasets.find((s) => s.id === "highlight");
  const initialIndex = chart.data.datasets.indexOf(series);
  const point = chart.getDatasetMeta(initialIndex).data[0];
  const from = point.x;
  w.document.getElementById("evalX").value = "2.5";
  w.runMethod("lagrange");
  const target = point.getProps(["x"], true).x;
  assert.notEqual(from, target);
  await wait(120);
  const during = point.x;
  assert(
    during > Math.min(from, target) && during < Math.max(from, target),
    `Expected an intermediate x, got ${from} → ${during} → ${target}`,
  );
  assert.equal(
    chart.getDatasetMeta(chart.data.datasets.indexOf(series)).data[0],
    point,
  );
  console.log(
    "OK   Chart.js real conserva el punto y recorre coordenadas intermedias",
  );
  await wait(400);
  assert(Math.abs(point.x - target) < 0.001);
  console.log("OK   La transición alcanza exactamente la nueva posición");
  w.document.getElementById("animateChart").checked = false;
  w.document
    .getElementById("animateChart")
    .dispatchEvent(new w.Event("change"));
  w.document.getElementById("evalX").value = "0.5";
  w.runMethod("lagrange");
  assert.equal(chart.options.animation, false);
  assert.equal(point.x, point.getProps(["x"], true).x);
  console.log(
    "OK   Desactivar la transición detiene el movimiento y aplica el valor final",
  );
  charts.forEach((c) => c.destroy());
  w.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
