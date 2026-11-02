# Revisión de movimiento y resultado

Esta propuesta sustituye la revisión inicial de animaciones de esta rama. El encargo posterior pide explícitamente GSAP, transiciones de 0,4 s y elevación al pasar el cursor. Ese encargo prevalece sobre el criterio anterior de eliminar todas las animaciones frecuentes.

| Antes                                                                    | Propuesta actual                                                                                      | Motivo                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Resultado dentro de un párrafo de explicación.                           | Cifra protagonista que procede directamente de las variables calculadas; contexto y unidad separados. | Identificar el valor clave de inmediato, sin perder el desarrollo numérico. |
| Controles de datos y menú con transiciones CSS cortas.                   | GSAP `power2.out`, apertura de 0,4 s y cierre de 0,2 s; los cambios rápidos retoman el estado actual. | Aplicar la fluidez solicitada conservando foco y estado accesible.          |
| Gráfica reconstruida inmediatamente sin transición del área de análisis. | Los valores finales se dibujan de inmediato y GSAP anima la entrada del resultado y de su gráfica.    | La transición confirma el cambio; nunca simula cifras intermedias.          |
| Estados hover estáticos.                                                 | Elevación de 2 px con sombra suave en botones y navegación con puntero fino.                          | Aportar la respuesta física solicitada sin activar falsos hover en móvil.   |
| Movimiento reducido únicamente en CSS.                                   | GSAP adapta traslación y escala a una transición de opacidad de 0,14 s; se desactiva la elevación.    | Respetar la preferencia del sistema sin perder confirmación de estado.      |

## Verificación de código

- 32 comprobaciones numéricas y de presentación correctas.
- 4 comprobaciones DOM con GSAP real: cierre/reapertura interrumpida, estado accesible del panel, cambio de preferencia durante cierre de detalles y reapertura rápida de la teoría.
- Revisión de fuente de layout e interrupciones con el agente indicado por el flujo de Impeccable.
- Detector estático de Impeccable: sin hallazgos.
- Lint de Taste Skill: sin fallos; las sombras de reposo se conservan porque el usuario las solicitó expresamente.

**Veredicto actual: pendiente de verificación visual.** El navegador ha denegado el origen local mediante un permiso guardado. No se considera completada la comprobación de vista, movimiento real ni tamaños de pantalla de esta propuesta hasta que se restablezca ese acceso o el usuario haga su revisión manual. Esta versión no se ha subido al repositorio remoto.
