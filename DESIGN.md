# Sistema visual del laboratorio numérico

Modo: Operate. La pregunta principal es: «¿Qué valor produce el método elegido para mis datos y parámetros?». La respuesta numérica es el primer nivel; la gráfica y su contraste analítico aportan evidencia; el desarrollo, la teoría y los datos originales completan el análisis.

## Dirección

Taste Skill: `accent-ladder`, semilla `1598379105`, conservando la tipografía local Manrope y mapeando la paleta al encargo. El rostro propio son los datos de circuitos de la FIEE UNMSM: voltaje, tiempo, aproximación, raíz y error. No se incorporan cifras ficticias ni fotografías ajenas a la tarea.

El usuario pidió explícitamente una cifra protagonista de gran tamaño, categorías en mayúsculas, bordes redondeados, sombras sutiles y hover de elevación. Esas decisiones prevalecen sobre las preferencias genéricas de las skills respecto a tamaños, mayúsculas y sombras.

## Tokens

- Fondo `#f5f7fa`, superficies `#ffffff`, tinta `#172b42`, texto secundario `#52657a`.
- Azul tecnológico `#285bc5`: método activo y curva de aproximación.
- Esmeralda `#087e5b`: resultado principal, acción de cálculo, Excel y carga correcta.
- Cobre `#a46b32`: referencia analítica en las gráficas donde corresponde.
- Superficies: radio 18 px, sombra leve con desplazamiento; controles: radio 10 px y altura mínima 44 px.
- Tipografía Manrope local; cifras tabulares y alineación derecha en tablas. Fórmulas en Cambria Math, con 20 px de espacio interior.

## Jerarquía y respuesta

La cifra principal procede de las variables de cálculo, sin extraerla de texto HTML. Se conserva el valor exacto en el estado y en la exportación; la presentación usa seis decimales o notación científica cuando corresponde al espacio o la magnitud. La derivada destaca el nodo más cercano a X, identificado en el contexto. Una búsqueda fallida elimina la raíz anterior y muestra un estado explícito.

La identidad del lateral sustituye el símbolo integral y «Laboratorio numérico» por una curva con nodos, «Métodos numéricos» y «FIEE · UNMSM». Se conservan los escudos y créditos institucionales.

En escritorio, resultado y gráfica comparten una fila. En móvil, la respuesta precede a la evidencia y las tablas mantienen el desplazamiento dentro de su contenedor. El menú se superpone y no empuja el análisis.

## Movimiento

GSAP 3.15.0 se sirve desde `libs/gsap.min.js`. `motion.js` coordina la entrada del resultado y la primera aparición de la gráfica en 0,4 s con `power2.out`, apertura de controles y desarrollo, cierre más rápido y elevación de 2 px en botones de puntero fino. Las secuencias se interrumpen y retoman desde el estado actual. En los recálculos, Chart.js mantiene la instancia y las series y desplaza puntos y curvas desde las coordenadas visibles hasta las nuevas en 400 ms (`easeOutCubic`); el panel permanece estable, sin otra entrada o desvanecimiento. La interpolación geométrica está siempre activa, sin casilla ni configuración, según la petición del usuario. El número final se actualiza inmediatamente; no se anima pasando por cifras inventadas.

Movimiento reducido sustituye traslación, escala y hover por opacidad breve. Los estados `hidden`, `inert`, `aria-expanded` y el foco se mantienen independientes de la terminación visual.

## Estado de revisión

39 pruebas numéricas y de presentación, 4 pruebas DOM de GSAP y 3 pruebas de interpolación con Chart.js real correctas. La revisión estática de Impeccable no arroja hallazgos; el lint de Taste Skill no tiene fallos. Las sombras discretas se conservan porque el usuario las pidió expresamente. La comprobación visual y de transiciones en navegador sigue pendiente mientras el permiso guardado deniegue el acceso al origen local. No se ha subido esta versión a GitHub.


## Apariencia clara y oscura

La opción de sol/luna está al pie del lateral, separada de los métodos. A partir de 1050 px aparece junto a «Elegir método» como botón de icono con nombre accesible y objetivo de 44 px. El primer acceso sigue el sistema; una selección explícita se guarda localmente y tiene prioridad. Si el almacenamiento no está disponible, el control sigue funcionando durante la visita. `theme.js` se ejecuta antes de la hoja de estilos para aplicar la preferencia antes del primer pintado.

El modo oscuro definitivo es grafito con azul hielo: fondo `#14171c`, superficies `#1e232b`, tinta `#edf1f7`, texto secundario `#b0bac8`, azul `#8cc8ff` y turquesa `#80d9d5`. Las acciones usan azul profundo con texto blanco. Resultados, avisos, errores, fórmulas, tablas y controles comparten roles de color. Chart.js actualiza ejes, leyendas y series sin recalcular datos ni reemplazar las instancias. La exportación PNG conserva el fondo del tema para mantener el contraste. La impresión conserva la paleta clara.

El selector temporal se retiró tras la elección del usuario. Las preferencias de paletas descartadas no afectan al tema definitivo; se conserva la elección entre modo claro y oscuro. Esta ampliación está pendiente de aprobación para subirla.

## Explicaciones de los métodos

«Cómo funciona este método» comienza con una explicación breve en lenguaje sencillo para cada uno de los once métodos. Debajo, «Detalle matemático» conserva la teoría y las fórmulas existentes. El resumen explica la idea, el significado del resultado y las limitaciones más relevantes sin prometer convergencia ni exactitud.

Validación: 39 pruebas numéricas y de presentación, 4 de movimiento, 4 con Chart.js real y 5 de preferencias de tema. Se comprobaron ratios de contraste de texto, controles y botones en las paletas clara y oscura. La revisión visual en navegador sigue pendiente del permiso del origen local.
