import { readFileSync, writeFileSync } from 'node:fs';
import { leerExcel, planificarCombinacion } from '../src/excel/importar';
import { exportarExcel } from '../src/excel/exportar';
import { FASE_MAP } from '../src/fases';

const buf = readFileSync(process.argv[2]);
const r = leerExcel(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
console.log('hojas', r.hojas, r.advertencias);
console.log('libros', r.libros.length);
for (const l of r.libros) {
  const h = Object.entries(l.hojas).filter(([, v]) => v).map(([k]) => k.slice(0,2)).join('');
  console.log(
    String(l.no).padStart(2), h.padEnd(8), FASE_MAP[l.fase].corto.padEnd(13),
    String(l.costo ?? '-').padStart(8), String(l.costoAdicional ?? '').padStart(6),
    `D${l.anioDigital ?? '-'} F${l.anioFisico ?? '-'} ${l.fechaSalida || ''}`.padEnd(22),
    l.titulo.split('\n')[0].slice(0, 60),
  );
}
const plan = planificarCombinacion(r.libros, r.libros);
console.log('re-import: nuevos', plan.nuevos.length, 'act', plan.actualizados.length, 'iguales', plan.sinCambios);

// round-trip: exportar y volver a leer
const blob = exportarExcel(r.libros);
const ab = await blob.arrayBuffer();
writeFileSync('scripts/roundtrip.xlsx', Buffer.from(ab));
const r2 = leerExcel(ab);
console.log('roundtrip libros', r2.libros.length, r2.hojas.map((h) => `${h.nombre}:${h.filas}`).join(' | '));
const p2 = planificarCombinacion(r.libros, r2.libros);
console.log('roundtrip diff: nuevos', p2.nuevos.length, 'act', p2.actualizados.map((u) => u.antes.titulo.slice(0, 30) + ' → ' + u.cambios.join(',')), 'iguales', p2.sinCambios);

