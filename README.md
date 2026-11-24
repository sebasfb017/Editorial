# Seguimiento editorial · Centro de control

Panel para llevar el control de los libros del archivo **Seguimiento Proyectos.xlsx**: se carga el Excel, se edita aquí mismo, se registra el seguimiento y se vuelve a descargar en el mismo formato.

## Cómo ejecutarlo

```bash
npm install
npm run dev      # abre http://localhost:5173
npm run build    # versión final en /dist (se puede publicar en cualquier hosting estático)
```

## Cómo están organizadas las hojas

Cada hoja del Excel es una pestaña del menú lateral:

| Hoja del Excel | Pestaña |
| --- | --- |
| Proyectos 2026-2 | Proyectos 2026-2 (registro maestro) |
| Proceso de Libros | Proceso de libros |
| Libros que salen en 2026 | Salen en 2026 |
| Libros aprobados pendientes 2027 | Pendientes 2027+ |

Un mismo libro aparece en varias hojas del Excel (p. ej. *Los Ingresos Públicos* está en las cuatro). Al importar, los títulos repetidos se **unen en una sola ficha**, así un cambio se refleja en todas las pestañas y no hay que actualizar el mismo dato cuatro veces. En la ficha se puede marcar en qué hojas aparece cada libro.

Además hay dos vistas propias del centro de control:

- **Resumen**: cifras generales, en qué fase está cada libro, alertas, calendario de publicación por año, inversión por CDP.
- **Bitácora**: historial de notas, cambios de fase y actualizaciones desde Excel.

## Funciones

- Cargar Excel (botón o arrastrando el archivo a la ventana). Si ya hay datos, se puede **combinar** (conserva notas, responsables y fechas) o **reemplazar**.
- Edición directa en la tabla (doble clic en una celda) o en la ficha completa (clic en el título).
- Fase editorial normalizada (sin información → evaluación → cotización → aprobado → estilo → diagramación → revisión del autor → impresión → listo), inferida automáticamente del texto del Excel y editable.
- Responsable, próxima acción y fecha compromiso por libro; las vencidas aparecen en *Requiere atención*.
- Agregar y eliminar libros (con opción de deshacer, también Ctrl+Z).
- Descargar Excel con las 4 hojas en el formato original + columnas de gestión + hoja *Bitácora*. Ese archivo se puede volver a cargar sin perder información.

Los datos se guardan automáticamente en el navegador de este equipo (localStorage). Para compartir o respaldar, usa **Descargar Excel**.

## Estructura

```
src/
  excel/importar.ts   lectura del Excel, unión de títulos, interpretación de años/fechas
  excel/exportar.ts   generación del Excel con las mismas hojas
  fases.ts            fases editoriales y reglas para inferirlas
  store.ts            estado, guardado automático, deshacer, registro de cambios
  components/         Resumen, Hoja (tabla editable), Ficha, Bitácora, Importar
scripts/probar-importacion.ts   prueba de lectura + ida y vuelta del Excel
```
