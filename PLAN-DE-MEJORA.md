# Plan de mejora del Centro Editorial

## Punto de partida · 24 de noviembre de 2026

La última verificación de la API encontró 27 publicaciones. Ya existen control de versiones al guardar, copia previa de la base, avisos de conflicto y pruebas de regresión para Excel, fechas e ISBN. La compilación y las pruebas pasaron. Queda por verificar la experiencia completa desde el navegador y el envío de correo. El primer ciclo debe comprobar que una persona puede recuperar su trabajo si se interrumpe una edición.

## Entregas en orden propuesto

| Orden y prioridad | Trabajo | Criterio de aceptación |
|---|---|---|
| 1 · Alta. Guardado y recuperación | En una base de prueba, recorrer alta, edición, eliminación y deshacer. Abrir dos sesiones, provocar un conflicto y probar el respaldo descargado. Ensayar también una desconexión y una restauración desde la copia del servidor. | Tras recargar, la edición aceptada sigue en el servidor y la edición en conflicto se puede recuperar. Al restaurar la copia coinciden publicaciones, notas, pares y comité con el estado esperado. |
| 2 · Alta. Acceso compartido | Acordar quién puede consultar, editar, enviar correo y administrar la cuenta SMTP. Aplicar esos permisos en la API y probar el acceso del equipo editorial antes de activar el cambio en la red. | Cada perfil puede completar sus tareas. El servidor rechaza consultas y escrituras sin sesión y restringe la configuración SMTP al responsable autorizado. |
| 3 · Alta. Resumen y hojas | Conservar año, agrupación y fase al abrir un listado desde el tablero. Acordar con coordinación cómo contar una obra con edición digital en un año y física en otro. Usar esa regla en indicadores, calendario y detalle. | Para cada filtro, los títulos del detalle coinciden con los que originaron la cifra. Una obra digital de 2026 y física de 2027 aparece en el año y formato correctos. |
| 4 · Media. Importación de Excel | Completar los casos con archivos antiguos, títulos idénticos con distintos identificadores, títulos abreviados y campos omitidos. Dar prioridad al identificador y mostrar en la vista previa las coincidencias que necesitan revisión. | Dos obras homónimas con IDs distintos mantienen sus fichas y notas. Una segunda importación del mismo archivo conserva los registros y una columna omitida conserva su valor previo. |
| 5 · Media. Pares y correo | Unificar el registro de invitaciones y recordatorios enviados desde la ficha y desde la vista de pares. Verificar con un buzón de prueba qué ocurre ante éxito, fallo o doble clic. | Un envío exitoso genera un mensaje, una entrada en la bitácora y la fecha correspondiente. Un fallo deja el envío pendiente y permite reintentarlo. |
| 6 · Baja. Tiempo de carga | Medir la apertura del resumen con caché vacía. Cargar la biblioteca de Excel al importar o exportar y repetir la medición en las mismas condiciones. | Registrar el tamaño inicial y el tiempo antes y después. El navegador abre el resumen sin descargar la biblioteca de Excel y los archivos de prueba siguen importándose y exportándose. |

## Estado de la primera tanda

Completadas las mejoras rápidas de la primera tanda.

- El resumen conserva agrupación, año y fase al abrir una hoja desde sus indicadores o fases.
- La pantalla muestra carga, guardado pendiente, conflictos y errores del servidor.
- La importación mantiene una vista previa de hojas, advertencias y cambios antes de aplicar el archivo.
- El importador y el exportador de Excel se cargan bajo demanda. La compilación genera archivos separados para ambos flujos.
- `npm test` comprueba fechas, ISBN, Excel, concurrencia y respaldos.

La validación visual completa dentro de Chrome queda pendiente porque el entorno de automatización no tiene acceso autorizado a esa ventana. La API y la interfaz fueron reiniciadas y respondieron correctamente.

Si la aplicación ya está disponible para varias personas en la red, iniciar la definición de permisos durante la primera entrega. Si dos equipos editan a menudo libros distintos y se bloquean entre sí, el siguiente paso de guardado será comprobar la versión de cada publicación por separado.

## Cierre de cada entrega

Desarrollo ejecuta las pruebas de regresión y la compilación, y registra el resultado del caso de aceptación en una copia de trabajo. Coordinación editorial valida las decisiones de negocio sobre años, categorías y permisos. Antes de aplicar un cambio que escriba datos, desarrollo conserva un respaldo restaurable. Después del despliegue, comprueba que el tablero abre y que la API devuelve el número esperado de publicaciones.
