# Métodos Numéricos · FIEE UNMSM

Laboratorio web para analizar datos X/Y de Excel o CSV y estudiar métodos numéricos con gráficas, tablas de cálculo y soluciones analíticas de circuitos. Funciona sin servidor y procesa los archivos en el navegador.

## Abrir el laboratorio

Abre `index.html` en un navegador moderno. No necesitas instalar dependencias para utilizarlo; Chart.js, SheetJS y la tipografía se incluyen localmente.

También puedes servir la carpeta con Python:

```sh
python -m http.server 4173
```

Visita `http://localhost:4173`.

## Uso

1. Al abrir se muestra una **simulación de carga RC**, identificada en Datos de entrada.
2. Pulsa **Cambiar datos** para subir o arrastrar un `.xlsx`, `.xls` o `.csv`, o cargar otra simulación. Puedes elegir el modo de encabezado y, si hay más de dos columnas, las columnas X/Y.
3. Elige un método en la navegación. En móvil, abre **Elegir método**.
4. Ajusta los parámetros disponibles. El cálculo se actualiza al editarlos; **Recalcular** lo ejecuta inmediatamente.
5. Consulta la gráfica, los cálculos, **Cómo funciona este método** y **Datos originales**. Exporta el resultado a Excel o guarda la gráfica en PNG.

Los archivos CSV pueden usar coma, punto y coma o tabulación como separador. Se ordenan los datos por X y se informa de filas no numéricas y valores X repetidos.

## Métodos

- **Interpolación:** Lagrange, diferencias divididas de Newton, método matricial de Vandermonde y splines cúbicos naturales.
- **Derivación:** diferencias finitas centradas de orden O(h²), con fórmulas unilaterales en los extremos.
- **Integración:** trapecio compuesto y Simpson 1/3, con 3/8 para un número impar de subintervalos y estimaciones de error donde aplican.
- **Raíces de f(x) − Yref = 0:** gráfico, bisección, Newton-Raphson y secante.

Para raíces se puede introducir una función exacta, por ejemplo `5*(1-exp(-x/1.2))`. Si se deja vacía, se utiliza el spline de los datos. El dominio sigue siendo el intervalo X de los datos.

Las simulaciones incluyen carga RC, descarga RC, circuito RLC subamortiguado y RC con ruido. Los resultados muestran la comparación analítica cuando está disponible.

## Desarrollo y pruebas

Las dependencias son exclusivamente de desarrollo. Usa Node.js compatible con jsdom 30 (`^22.22.2`, `^24.15.0` o `>=26`).

```sh
npm install
npm run check
npm test
```

También puedes usar `pnpm install --frozen-lockfile`, `pnpm check` y `pnpm test`; se incluye `pnpm-lock.yaml`.

Las 25 comprobaciones existentes verifican integración polinómica, equivalencia entre interpoladores, derivación en mallas no uniformes, validación de funciones y convergencia de raíces.

## Estructura

```text
index.html       Interfaz y contenido institucional
style.css        Sistema visual y adaptación a móvil
app.js           Métodos numéricos, importación, gráficas y controles
libs/            Chart.js y SheetJS locales
assets/          Escudos, favicon y tipografía con licencia
test.js         Pruebas numéricas (en la raíz)
docs/diseno.md   Decisiones y verificación del rediseño
```

## Créditos

**Curso:** Métodos Numéricos. **Docente:** Josué Miranda.

Astrid Tello Vilchez, Haniel Castellano Guarachi, Jahzeel Sosa Gómez y Jeanpier Chavez Campos.

Facultad de Ingeniería Electrónica y Eléctrica, Universidad Nacional Mayor de San Marcos · 2026.
