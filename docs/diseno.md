# Rediseño del laboratorio

El objetivo es facilitar la lectura y comparación de resultados de métodos numéricos aplicados a datos de circuitos.

## Decisiones

- Navegación agrupada por interpolación, cálculo y búsqueda de raíces. El método seleccionado tiene estado visual y `aria-pressed`.
- Resultados y gráfica como centro del espacio de trabajo. Una simulación RC identificada permite explorar desde la primera visita; la carga de archivos se abre con **Cambiar datos**.
- Parámetros específicos de cada familia de métodos. Teoría y datos originales se consultan mediante controles desplegables.
- Superficies sólidas, una tipografía local, contraste consistente y cifras tabulares. Se eliminaron el fondo repetido, el vidrio, los botones multicolor y los emojis decorativos.
- Se conservaron los escudos UNMSM/FIEE, los créditos, los once métodos, las cuatro simulaciones y las comparaciones analíticas.
- Navegación móvil desplegable, foco visible, enlace para saltar al contenido, tablas desplazables, etiquetas accesibles y respeto de `prefers-reduced-motion`.
- Arrastre de archivos como alternativa al selector. Los errores de importación aparecen junto a los controles.
- PNG con fondo blanco y descarga mediante Blob para mejorar la compatibilidad del navegador.

## Guías aplicadas

- [ui-unslop](https://github.com/Microck/ui-unslop), solicitada para evitar tratamientos visuales sin una función clara.
- [Frontend Design](https://github.com/anthropics/skills/tree/main/skills/frontend-design), para jerarquía y coherencia visual.
- [Web Design Guidelines](https://github.com/vercel-labs/agent-skills/tree/main/skills/web-design-guidelines), para revisar accesibilidad e interacción.

Las skills son herramientas de desarrollo; la página no depende de ellas para ejecutarse. Manrope se distribuye con su licencia SIL Open Font License en `assets/fonts/OFL-Manrope.txt`.

## Validación

- Pruebas numéricas existentes: 25 correctas, 0 fallidas.
- Once métodos ejecutados en el navegador; cuatro simulaciones comprobadas.
- Importación CSV y Excel con selección de columnas.
- Exportación real de Excel y PNG.
- Escritorio y vistas de 768, 390 y 320 CSS px; revisión de navegación, parámetros, fórmulas y tablas.
- Sin errores de consola durante los flujos comprobados. Reducción de movimiento revisada en el código CSS y la configuración de Chart.js.
