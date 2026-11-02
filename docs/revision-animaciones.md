# Revisión de animaciones

Guía aplicada: [review-animations](https://github.com/nexu-io/open-design/blob/main/skills/review-animations/SKILL.md), junto a su catálogo `STANDARDS.md` y las guías complementarias de movimiento y accesibilidad. El alcance se limita a movimiento e interacción asociada.

| Antes | Después | Motivo |
| --- | --- | --- |
| La gráfica se reconstruía con una animación de 180 ms en cada recálculo. | Resultado y gráfica inmediatos ([app.js](../app.js#L9)). | Introducir valores y comparar métodos son acciones frecuentes; el movimiento no añade información. |
| Desplazamiento suave también al activar métodos con teclado. | Reposicionamiento inmediato y foco conservado en móvil ([app.js](../app.js#L1157)). | La navegación no debe esperar una animación, especialmente con teclado. |
| El menú móvil expandía la cabecera y desplazaba el análisis. | Panel anclado al botón, sin modificar la posición del contenido ([style.css](../style.css#L1282)). | Conservar la orientación espacial mientras se elige un método. |
| Los controles aparecían de golpe. | Apertura de 180 ms y cierre de 100 ms mediante opacidad y `transform`, con curva `cubic-bezier(0.23, 1, 0.32, 1)` ([style.css](../style.css#L1250)). | Confirmar la expansión sin interpolar altura, anchura, márgenes ni posiciones de la página. |
| Transiciones generales de color también en acciones de teclado y estados hover sin filtro de dispositivo. | Estados frecuentes inmediatos y hover limitado a puntero fino. | Evitar retrasos repetitivos y estados hover falsos en pantallas táctiles. |
| Movimiento reducido eliminaba toda señal de transición. | Opacidad de 120 ms sin desplazamiento ni escala ([style.css](../style.css#L1323)). | Una señal suave conserva la relación entre estados sin movimiento espacial. |

**Veredicto: Approve / aprobado para revisión del usuario.** Se eliminaron animaciones frecuentes, las transiciones restantes son breves e interrumpibles y los paneles mantienen su estado accesible al cerrarse. No hay efectos de entrada ambientales ni nuevas dependencias.

## Comprobación

- Las 25 pruebas numéricas siguen pasando.
- Navegación móvil a 320 y 390 CSS px, cierre con Escape, retorno del foco, selección de método y paso a escritorio.
- Al abrir el menú a 320 px, la posición superior del contenido se mantiene en 126 px antes y después; la página no se desplaza horizontalmente.
- Seis cambios rápidos de apertura/cierre terminan en un estado consistente: `hidden`, `aria-hidden`, `inert` y `aria-expanded` coinciden.
- Activación con teclado: `transition: none`; menú cerrado fuera del orden de tabulación.
- El navegador de revisión declara `prefers-reduced-motion: reduce`. Se comprobó la variante de opacidad de 120 ms, sin transformaciones. Los valores de la variante normal se revisaron en el código; no se cambió la preferencia del sistema.
- Sin errores ni avisos de consola en los flujos revisados.

Esta versión se prepara localmente. La actualización de GitHub requiere la confirmación explícita del usuario después de ver la vista previa.
