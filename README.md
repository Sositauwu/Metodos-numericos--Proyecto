# Métodos Numéricos · FIEE UNMSM

Laboratorio web para analizar datos X/Y de Excel o CSV y estudiar métodos numéricos con gráficas, tablas de cálculo y soluciones analíticas de circuitos. Funciona sin servidor y procesa los archivos en el navegador.

## Abrir el laboratorio

Abre `index.html` en un navegador moderno. No necesitas instalar dependencias para utilizarlo; Chart.js, SheetJS, GSAP y la tipografía se incluyen localmente.

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
5. Los puntos y las curvas se desplazan suavemente entre cálculos de forma automática y permanente, sin necesidad de activar ninguna opción.
6. Consulta la gráfica, los cálculos, **Cómo funciona este método** y **Datos originales**. Exporta el resultado a Excel o guarda la gráfica en PNG.

Los archivos CSV pueden usar coma, punto y coma o tabulación como separador. Se ordenan los datos por X y se informa de filas no numéricas y valores X repetidos.

## Métodos

- **Interpolación:** Lagrange, diferencias divididas de Newton, método matricial de Vandermonde y splines cúbicos naturales.
- **Derivación:** diferencias finitas centradas de orden O(h²), con fórmulas unilaterales en los extremos.
- **Integración:** trapecio compuesto y Simpson 1/3, con 3/8 para un número impar de subintervalos y estimaciones de error donde aplican.
- **Raíces de f(x) − Yref = 0:** gráfico, bisección, Newton-Raphson y secante.

Para raíces se puede introducir una función exacta, por ejemplo `5*(1-exp(-x/1.2))`. Si se deja vacía, se utiliza el spline de los datos. El dominio sigue siendo el intervalo X de los datos.

Las simulaciones incluyen carga RC, descarga RC, circuito RLC subamortiguado y RC con ruido. Los resultados muestran la comparación analítica cuando está disponible.

## Desarrollo y pruebas

GSAP es una dependencia de la interfaz y se distribuye también como copia local. jsdom se utiliza solo para las pruebas. Usa Node.js compatible con jsdom 30 (`^22.22.2`, `^24.15.0` o `>=26`).

```sh
npm install
npm run check
npm test
```

También puedes usar `pnpm install --frozen-lockfile`, `pnpm check` y `pnpm test`; se incluye `pnpm-lock.yaml`.

Las 39 comprobaciones verifican integración polinómica, equivalencia entre interpoladores, derivación en mallas no uniformes, validación de funciones y convergencia de raíces. También comprueban que la cifra protagonista corresponda al cálculo y se limpie cuando no hay raíz. Cuatro pruebas adicionales de GSAP verifican cambios rápidos de estado y movimiento reducido. Tres pruebas con Chart.js real comprueban coordenadas intermedias, llegada al punto final y desactivación de la transición.

## Estructura

```text
index.html       Interfaz y contenido institucional
style.css        Sistema visual y adaptación a móvil
app.js           Métodos numéricos, importación, gráficas y controles
motion.js        Transiciones GSAP y accesibilidad del movimiento
libs/            Chart.js y SheetJS locales
assets/          Escudos, favicon y tipografía con licencia
test.js         Pruebas numéricas (en la raíz)
docs/diseno.md   Decisiones y verificación del rediseño
```

## Créditos

**Curso:** Métodos Numéricos. **Docente:** Josué Miranda.

Haniel Castellano Guarachi, Jahzeel Sosa Gómez y Jeanpier Chavez Campos.

Facultad de Ingeniería Electrónica y Eléctrica, Universidad Nacional Mayor de San Marcos · 2026.

El botón de sol/luna cambia entre modo claro y oscuro y recuerda la elección en el navegador. En escritorio está al pie de la barra lateral y en móvil junto a «Elegir método».

El modo oscuro usa la combinación definitiva de grafito con azul hielo. «Cómo funciona este método» presenta primero una explicación sencilla y conserva debajo el detalle matemático.


## Herramientas interactivas

- Abre **Explorar gráfica**, mueve el deslizador o pulsa sobre el área de trazado para elegir X. La entrada numérica sigue disponible para valores exactos.
- En los métodos polinómicos, ajusta **Nodos cercanos** con el deslizador o selecciona **Usar todos**. La gráfica destaca los nodos elegidos.
- Abre **Comparar métodos** para contrastar dos métodos compatibles con los mismos datos y parámetros. La diferencia entre sus resultados no equivale al error real.
- En Bisección, Newton-Raphson o Secante, abre **Ver paso a paso** y usa anterior/siguiente, el deslizador o reproducir/pausar. El resultado destacado mantiene la solución final.
- En **Experimentos**, guarda hasta cinco sesiones en este navegador, restaura una o elimínala. Se incluyen los datos y parámetros, y el guardado es explícito. Borrar los datos del sitio en el navegador elimina también estas sesiones.
- Los parámetros inválidos se señalan junto al campo y deben corregirse antes de calcular. **Restablecer parámetros** recupera valores sugeridos para los datos actuales.


## Ejemplos didácticos e informe de práctica

En **Cambiar datos → Ejemplos didácticos** puedes cargar:

- **Runge con nodos uniformes:** 21 nodos y un polinomio de grado 20. Las oscilaciones se conservan para observar el comportamiento del método.
- **Runge con nodos de Chebyshev-Lobatto:** la misma función y el mismo grado, cambiando la distribución de nodos.
- **Integración en malla irregular:** compara Trapecio y Simpson sobre x³ con su integral exacta.
- **Ciclo de Newton:** recorre el ciclo entre 0 y 1 y contrástalo con Bisección. Aquí la no convergencia es el resultado esperado.

**Informe de práctica** descarga un HTML autónomo con fuente de datos, parámetros activos, resultados, comparación, gráficas y tablas con precisión numérica. Ábrelo y pulsa **Imprimir / guardar como PDF** para obtener una copia en papel o PDF. No necesita conexión ni servicios externos. Si estabas recorriendo una iteración, el informe identifica ese paso y conserva por separado el resultado final.

Puedes **deshacer la última eliminación** de un experimento. **Restablecer parámetros del método** modifica únicamente los campos que ese método utiliza. La lectura de archivos muestra su estado, conserva el análisis anterior cuando un archivo es inválido y respeta la última selección.

La suite `pnpm test` incluye las 121 comprobaciones numéricas de la auditoría y los casos de regresión de raíces, selección de nodos, ejemplos, guardado e informes.
