/**
 * Módulo de exportación a Excel (.xlsx):
 * - `exportarExcel`: genera el libro completo con las 4 hojas editoriales + la hoja `Bitácora`.
 * - `exportarPlantillaExcel`: genera la plantilla oficial con ejemplos e instrucciones para evitar errores al cargar.
 */
import * as XLSX from 'xlsx';
import type { HojaId, Libro } from '../types';
import { FASE_MAP } from '../fases';
import { HOJA_MAP } from './importar';
import { tituloCorto } from '../utils';

const FMT_COP = '"$"#,##0';

function costoProyectos(l: Libro): string | number | null {
  if (l.costo == null) return null;
  if (l.costoAdicional) {
    const f = (n: number) => n.toLocaleString('es-CO');
    return `${f(l.costo)} + ${f(l.costoAdicional)}`;
  }
  return l.costo;
}

function formatearColumna(ws: XLSX.WorkSheet, col: number, desde: number, hasta: number) {
  for (let r = desde; r <= hasta; r++) {
    const ref = XLSX.utils.encode_cell({ r, c: col });
    const cell = ws[ref];
    if (cell && cell.t === 'n') cell.z = FMT_COP;
  }
}

function hojaSecundaria(libros: Libro[], obs: (l: Libro) => string): XLSX.WorkSheet {
  const head = ['Nombre del libro', 'Etapa actual', '¿Cuenta con ISBN?', 'Precio (COP)', 'Observaciones', 'ID publicación', 'AÑO DIGITAL', 'AÑO FÍSICO', 'FECHA SALIDA'];
  const filas = libros.map((l) => [l.titulo, l.etapa, l.isbn, l.costo, obs(l), l.id, l.anioDigital, l.anioFisico, l.fechaSalida]);
  const ws = XLSX.utils.aoa_to_sheet([head, ...filas, []]);
  const ultima = filas.length + 1; // fila (1-based) del último libro
  const totalRow = filas.length + 2; // 0-based → fila vacía + total
  XLSX.utils.sheet_add_aoa(ws, [[null, null, 'Total', { t: 'n', f: `SUM(D2:D${ultima})` }]], {
    origin: { r: totalRow, c: 0 },
  });
  formatearColumna(ws, 3, 1, totalRow);
  ws['!cols'] = [{ wch: 60 }, { wch: 46 }, { wch: 24 }, { wch: 16 }, { wch: 50 }];
  return ws;
}

const SUBTIPO_TXT: Record<string, string> = {
  libro: 'Libro',
  revista: 'Revista',
  cartilla: 'Cartilla',
  memoria: 'Memoria',
};

export function exportarExcel(libros: Libro[]): Blob {
  const wb = XLSX.utils.book_new();
  const en = (h: HojaId) => libros.filter((l) => l.hojas[h]).sort((a, b) => (a.no ?? 0) - (b.no ?? 0));

  // 1. Proyectos (mismo formato + agrupación, categoría, líder, concepto de pares, requerimiento y año)
  const proy = en('proyectos');
  const head = [
    'No.', 'AGRUPACIÓN', 'CATEGORÍA', 'TÍTULO', 'AUTOR', 'LÍDER PROYECTO',
    'PROYECTO', 'VALOR', 'CDP', 'CONCEPTO PARES', 'REQUERIMIENTO', 'AÑO',
    'OBSERVACIÓN', 'ESTADO', 'ISBN', 'FASE', 'RESPONSABLE', 'PRÓXIMA ACCIÓN', 'FECHA COMPROMISO', 'ID publicación', 'AÑO DIGITAL', 'AÑO FÍSICO', 'FECHA SALIDA',
  ];
  const ws1 = XLSX.utils.aoa_to_sheet([
    ['PROYECTOS - Seguimiento'],
    head,
    ...proy.map((l) => [
      l.no,
      l.tipoPublicacion === 'no_arbitrada' ? 'No arbitrada' : 'Arbitrada',
      SUBTIPO_TXT[l.subtipoPublicacion ?? 'libro'] ?? 'Libro',
      l.titulo,
      l.autores,
      l.liderProyecto ?? '',
      l.proyecto,
      costoProyectos(l),
      l.cdp,
      l.conceptoPares ?? '',
      l.requerimiento ?? '',
      l.anioFisico ?? l.anioDigital ?? '',
      l.observacion,
      l.estado,
      l.isbn,
      FASE_MAP[l.fase].nombre,
      l.responsable,
      l.proximaAccion,
      l.fechaCompromiso, l.id, l.anioDigital, l.anioFisico, l.fechaSalida,
    ]),
  ]);
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
  ws1['!cols'] = [6, 15, 12, 46, 30, 24, 34, 16, 10, 34, 32, 8, 36, 32, 22, 20, 18, 30, 16].map((wch) => ({ wch }));
  formatearColumna(ws1, 7, 2, proy.length + 1);
  XLSX.utils.book_append_sheet(wb, ws1, HOJA_MAP.proyectos.nombre);

  XLSX.utils.book_append_sheet(wb, hojaSecundaria(en('proceso'), (l) => l.obsProceso), HOJA_MAP.proceso.nombre);
  XLSX.utils.book_append_sheet(wb, hojaSecundaria(en('salida'), (l) => l.obsSalida), HOJA_MAP.salida.nombre);
  XLSX.utils.book_append_sheet(wb, hojaSecundaria(en('pendientes'), (l) => l.obsPendiente), HOJA_MAP.pendientes.nombre);

  // 5. Bitácora de seguimiento
  const notas = libros
    .flatMap((l) => l.seguimiento.map((n) => ({ l, n })))
    .sort((a, b) => b.n.fecha.localeCompare(a.n.fecha));
  const ws5 = XLSX.utils.aoa_to_sheet([
    ['Fecha', 'Libro', 'Tipo', 'Nota', 'ID publicación', 'ID nota', 'Fecha ISO', 'Tipo ID'],
    ...notas.map(({ l, n }) => [
      new Date(n.fecha).toLocaleString('es-CO'),
      tituloCorto(l.titulo),
      n.tipo === 'nota' ? 'Nota' : n.tipo === 'cambio' ? 'Cambio' : 'Sistema',
      n.texto, l.id, n.id, n.fecha, n.tipo,
    ]),
  ]);
  ws5['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 10 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, ws5, 'Bitácora');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function exportarPlantillaExcel(): Blob {
  const wb = XLSX.utils.book_new();

  const head = [
    'No.', 'AGRUPACIÓN', 'CATEGORÍA', 'TÍTULO', 'AUTOR', 'LÍDER PROYECTO',
    'PROYECTO', 'VALOR', 'CDP', 'CONCEPTO PARES', 'REQUERIMIENTO', 'AÑO',
    'OBSERVACIÓN', 'ESTADO', 'ISBN', 'FASE', 'RESPONSABLE', 'PRÓXIMA ACCIÓN', 'FECHA COMPROMISO',
  ];
  const ejemplos = [
    [
      1, 'Arbitrada', 'Libro',
      'Ejemplo: Gestión pública territorial (Libro arbitrado)',
      'Ana María Gómez\nCarlos Ruiz', 'Dra. Ana María Gómez',
      'INV-2026-014', 8500000, '1042',
      'Aprobado con ajustes menores por ambos pares',
      'Ajustar bibliografía según normas APA 7', 2026,
      'En revisión de estilo', 'Aprobado en comité', '',
      'Corrección de estilo', 'Coordinación Editorial', 'Enviar versión corregida al autor', '2026-12-05',
    ],
    [
      2, 'Arbitrada', 'Revista',
      'Ejemplo: Revista de Estudios Contables Vol. 12',
      'Comité Editorial Facultad', 'Prof. Luis Torres',
      'REV-2026-003', 6200000, '1045',
      'Artículos evaluados y aceptados',
      'Asignación de DOI y diagramación final', 2026,
      'Listo para diagramación', 'En proceso', 'ISSN 2345-6789',
      'Diagramación', 'Diseñador', 'Revisar pruebas de galera', '2026-12-10',
    ],
    [
      3, 'No arbitrada', 'Cartilla',
      'Ejemplo: Cartilla práctica de emprendimiento rural',
      'María Fernanda Díaz', 'María Fernanda Díaz',
      'EXT-2026-008', 3400000, '1050',
      'No aplica evaluación de pares',
      'Validación de diseño institucional', 2026,
      'Material de extensión', 'Cotización aprobada', '',
      'Cotización aprobada', 'Extensión', 'Aprobar artes finales', '2026-12-15',
    ],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet([['PROYECTOS - Seguimiento (Plantilla oficial)'], head, ...ejemplos]);
  ws1['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 8 } }];
  ws1['!cols'] = [6, 15, 12, 46, 30, 24, 20, 14, 10, 34, 32, 8, 28, 24, 18, 20, 20, 28, 16].map((wch) => ({ wch }));
  formatearColumna(ws1, 7, 2, 4);
  XLSX.utils.book_append_sheet(wb, ws1, HOJA_MAP.proyectos.nombre);

  const ws2 = XLSX.utils.aoa_to_sheet([
    ['Nombre del libro', 'Etapa actual', '¿Cuenta con ISBN?', 'Precio (COP)', 'Observaciones'],
    ['Ejemplo: Gestión pública territorial (Libro arbitrado)', 'Corrección de estilo', 'En trámite', 8500000, 'Entrega estimada diciembre'],
  ]);
  ws2['!cols'] = [{ wch: 52 }, { wch: 30 }, { wch: 22 }, { wch: 16 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws2, HOJA_MAP.proceso.nombre);

  const ws3 = XLSX.utils.aoa_to_sheet([
    ['Nombre del libro', 'Etapa actual', '¿Cuenta con ISBN?', 'Precio (COP)', 'Observaciones'],
    ['Ejemplo: Cartilla práctica de emprendimiento rural', 'Cotización aprobada', '', 3400000, 'Digital y físico 2026'],
  ]);
  ws3['!cols'] = [{ wch: 52 }, { wch: 30 }, { wch: 22 }, { wch: 16 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws3, HOJA_MAP.salida.nombre);

  const ws4 = XLSX.utils.aoa_to_sheet([
    ['Nombre del libro', 'Etapa actual', '¿Cuenta con ISBN?', 'Precio (COP)', 'Observaciones'],
  ]);
  ws4['!cols'] = [{ wch: 52 }, { wch: 30 }, { wch: 22 }, { wch: 16 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, ws4, HOJA_MAP.pendientes.nombre);

  const ws5 = XLSX.utils.aoa_to_sheet([
    ['Columna', 'Qué poner / valores recomendados'],
    ['AGRUPACIÓN', 'Escribir "Arbitrada" o "No arbitrada"'],
    ['CATEGORÍA', 'Para Arbitrada: "Libro" o "Revista". Para No arbitrada: "Cartilla" o "Memoria"'],
    ['TÍTULO', 'Obligatorio. Debe coincidir exactamente si el mismo título aparece en otras hojas'],
    ['VALOR', 'Número sin puntos ni símbolo (ej.: 8500000)'],
    ['AÑO', 'Año de trabajo o salida (ej.: 2026 o 2027)'],
    ['LÍDER PROYECTO', 'Nombre del docente o investigador líder'],
    ['CONCEPTO PARES', 'Resumen o estado del concepto de pares evaluadores'],
    ['REQUERIMIENTO', 'Requerimientos pendientes (técnicos, editoriales o administrativos)'],
    ['FASE', 'Sin información, En evaluación, En cotización, Cotización aprobada, Corrección de estilo, Diagramación, Revisión del autor, Impresión / ISBN, Listo / publicado, Detenido / no aprobado'],
    ['FECHA COMPROMISO', 'Formato AAAA-MM-DD (ej.: 2026-12-05)'],
  ]);
  ws5['!cols'] = [{ wch: 22 }, { wch: 90 }];
  XLSX.utils.book_append_sheet(wb, ws5, 'Instrucciones');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
