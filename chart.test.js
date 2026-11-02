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
  w.eval(fs.readFileSync(path.join(__dirname, "theme.js"), "utf8"));
  w.eval(fs.readFileSync(path.join(__dirname, "app.js"), "utf8"));
  w.eval(fs.readFileSync(path.join(__dirname, "workbench.js"), "utf8"));
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
  const previous = point.x;
  w.document.getElementById("evalX").value = "0.5";
  w.runMethod("lagrange");
  assert.equal(chart.options.animation.duration, 400);
  const nextTarget = point.getProps(["x"], true).x;
  await wait(120);
  assert(point.x > Math.min(previous, nextTarget) && point.x < Math.max(previous, nextTarget));
  await wait(400);
  assert(Math.abs(point.x - nextTarget) < 0.001);
  console.log(
    "OK   Los siguientes recálculos mantienen la transición suave automáticamente",
  );
  const value = w.document.getElementById("primaryValue").textContent;
  const coordinates = JSON.stringify(chart.data.datasets.map((s) => s.data));
  w.document.getElementById("themeToggle").click();
  assert.equal(w.document.documentElement.dataset.theme, "dark");
  assert.equal(chart.options.scales.x.ticks.color, "#b0bac8");
  assert.equal(chart.data.datasets.find((s) => s.id === "approximation").borderColor, "#8cc8ff");
  assert.equal(JSON.stringify(chart.data.datasets.map((s) => s.data)), coordinates);
  assert.equal(w.document.getElementById("primaryValue").textContent, value);
  w.runMethod("lagrange");
  assert.equal(chart.data.datasets.find((s) => s.id === "approximation").borderColor, "#8cc8ff");
  w.document.getElementById("themeToggle").click();
  assert.equal(chart.options.scales.x.ticks.color, "#52647a");
  assert.equal(chart.data.datasets.find((s) => s.id === "approximation").borderColor, "#285bc5");
  assert.equal(chart.options.animation.duration, 400);
  console.log("OK   Cambiar tema adapta Chart.js y conserva cálculos, series y transiciones");
  w.document.getElementById("comparePanel").open = true;
  w.document.getElementById("compareMethod").value = "splines";
  w.document.getElementById("compareMethod").dispatchEvent(new w.Event("change"));
  await wait(450);
  const comparison = chart.data.datasets.find((s) => s.id === "tool-comparison");
  assert(comparison && comparison.data.length > 1);
  assert(chart.getDatasetMeta(chart.data.datasets.indexOf(comparison)).data.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y)));
  w.NumericalLab.update("evalX", "1.2");
  assert.equal(chart.data.datasets.find((s) => s.id === "tool-comparison"), comparison);
  w.runMethod("biseccion");
  w.document.getElementById("stepPanel").open = true;
  await wait(15);
  w.document.getElementById("iterationSlider").value = "2";
  w.document.getElementById("iterationSlider").dispatchEvent(new w.Event("input"));
  await wait(450);
  const step = w.NumericalLab.state().iterations[1];
  const trace = chart.data.datasets.find((s) => s.id === "tool-step-point");
  const element = chart.getDatasetMeta(chart.data.datasets.indexOf(trace)).data[0];
  assert(Math.abs(element.x - chart.scales.x.getPixelForValue(step.x)) < .01);
  assert(Math.abs(element.y - chart.scales.y.getPixelForValue(step.y)) < .01);
  const convergence = w.NumericalLab.state().convergence;
  const marker = convergence.data.datasets.findIndex((s) => s.id === "tool-convergence-step");
  assert(Math.abs(convergence.getDatasetMeta(marker).data[1].x - convergence.getDatasetMeta(0).data[1].x) < .01);
  console.log("OK   Las curvas comparadas y pasos se trazan en sus coordenadas reales con Chart.js");
  charts.forEach((c) => c.destroy());
  w.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
