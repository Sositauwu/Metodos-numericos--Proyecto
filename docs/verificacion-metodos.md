# Verificación de métodos y aportes didácticos

Las pruebas distinguen errores de implementación de los fenómenos que se estudian en clase. No se ocultan las oscilaciones de Runge, el mal condicionamiento de grados altos ni la no convergencia de Newton en un ciclo.

## Correcciones de la auditoría

| Caso | Comportamiento corregido |
|---|---|
| `exp(20*x)+1`, objetivo 0, dominio `[0,1]` | Newton y Secante informan que no alcanzaron una raíz; el recorte al borde no produce un falso éxito. |
| `1/(x-0.5)`, objetivo 0 | Se descartan evaluaciones no finitas y cruces que no alcanzan un residuo válido. El polo no se anuncia como raíz. |
| `(x-1)^2`, dominio `[0,2]` | Una raíz inicial exacta se reconoce antes de dividir por su derivada. |
| X `[0,1,2,100]`, consulta 2,1, n=2 | Se seleccionan los nodos `[1,2]`, con desempate determinista, en los tres métodos polinómicos. |
| Función propia sobre datos de una demo | El residuo de otra función no se presenta como referencia de esa raíz. |
| Simpson irregular y derivada de dos puntos | Las explicaciones indican las hipótesis de precisión y el esquema realmente utilizado. |

El residuo se contrasta con una referencia del intervalo y con la precisión de la evaluación local; una pendiente extrema lejos de la solución no amplía arbitrariamente el criterio de aceptación. La verificación numérica filtra discontinuidades detectables, pero no es una prueba simbólica de continuidad para cualquier función.

## Ejemplos disponibles

Runge uniforme y Chebyshev-Lobatto usan la misma función y 21 nodos. El primer ejemplo mantiene sus oscilaciones. El ejemplo de malla irregular permite comparar integrales frente a un valor exacto. El ciclo de Newton permite recorrer sus iteraciones y compararlo con Bisección sin convertir la no convergencia en una cifra ficticia.

## Informe de práctica

La descarga produce un HTML autónomo con datos, parámetros activos, resultados, comparación, tablas y gráficas incrustadas. El botón de impresión permite generar un PDF. La comparación conserva el estado de cada método cuando uno no converge. Los textos de archivos se escapan y las tablas mantienen la precisión numérica. Un fallo al capturar una imagen se indica sin descartar las tablas.

## Comprobaciones

`pnpm check` verifica los cinco scripts de aplicación. `pnpm test` ejecuta **201 comprobaciones correctas**:

- 39 de cálculo y presentación.
- 4 de movimiento e interrupción de controles.
- 5 con el motor real de Chart.js.
- 5 de preferencias de tema.
- 14 de interacción del laboratorio.
- 121 de auditoría numérica de los once métodos y sus casos de robustez.
- 13 de ejemplos, informe, deshacer, restablecimiento e importación de archivos.

Los resultados individuales de la auditoría se generan en `output/numerical-audit-results.json`. El detector estático no arroja hallazgos. Las pruebas de DOM y geometría no sustituyen una inspección visual en navegador ni certifican el diseño impreso en todas las configuraciones de impresión.
