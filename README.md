# Métodos Numéricos – FIEE UNMSM

Aplicación web (HTML + JavaScript, sin servidor) para aplicar métodos numéricos a datos de Excel/CSV, por ejemplo simulaciones de circuitos RC.

## Métodos incluidos
- **Interpolación:** Lagrange, diferencias divididas de Newton, método matricial (Vandermonde), splines cúbicos naturales.
- **Derivación:** diferencias finitas centradas O(h²) (extremos con fórmula unilateral de 3 puntos).
- **Integración:** regla del trapecio y Simpson 1/3 (con 3/8 si el número de subintervalos es impar), con estimación de error por Richardson.
- **Raíces de f(x) − Yref = 0:** método gráfico, bisección, Newton-Raphson y secante.

## Uso
1. Abre `index.html` en el navegador.
2. Sube un `.xlsx`, `.xls` o `.csv` (columnas X, Y) o pulsa **Cargar Datos Demo**.
3. Elige un método. Los parámetros (X de interpolación, Yref, tolerancia, nodos, intervalo [a, b]) se recalculan al cambiarlos.
4. Para las raíces puedes escribir una **f(x) exacta** (p. ej. `5*(1-exp(-x/1.2))`); si la dejas vacía se usa el spline de los datos.

## Estructura
```
index.html   estructura de la página
style.css    estilos
app.js       cálculo numérico e interfaz
libs/        xlsx y Chart.js (copia local)
assets/      escudo y fondo
tests/       pruebas automáticas
```

## Pruebas
```
npm install jsdom
node tests/test.js
```
Verifican, entre otras cosas, que Simpson sea exacto para polinomios de grado ≤ 3, que Lagrange/Newton/Matricial coincidan, que la derivada sea exacta para parábolas (incluso en malla no uniforme) y que los métodos de raíces converjan al valor correcto.
