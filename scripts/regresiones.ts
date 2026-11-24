import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import * as XLSX from 'xlsx';
import { aplicarCombinacion, leerExcel, libroVacio, planificarCombinacion, prepararReemplazo } from '../src/excel/importar';
import { exportarExcel } from '../src/excel/exportar';
import { diasDesde, estadoISBN } from '../src/utils';

for (const hora of ['08:00:00', '18:00:00']) {
  const hoy = new Date(`2026-11-24T${hora}`);
  assert.equal(diasDesde('2026-11-24', hoy), 0);
  assert.equal(diasDesde('2026-11-25', hoy), -1);
  assert.equal(diasDesde('2026-11-23', hoy), 1);
}
assert.equal(estadoISBN('978-1'), 'tramite');
assert.equal(estadoISBN('9780306406157'), 'asignado');
assert.equal(estadoISBN('9780306406158'), 'tramite');
assert.equal(estadoISBN('0-306-40615-2'), 'asignado');

function importar(...titulos: string[]) {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Título'], ...titulos.map((t) => [t])]), 'Proyectos 2027');
  return leerExcel(XLSX.write(wb, { bookType: 'xlsx', type: 'array' })).libros;
}
assert.equal(importar('Historia cultural del Caribe: juventud', 'Historia cultural del Caribe: patrimonio').length, 2);
assert.equal(importar('Obra')[0].hojas.proyectos, true);
const original = libroVacio({
  titulo: 'Obra de prueba', no: 10, tipoPublicacion: 'no_arbitrada', subtipoPublicacion: 'cartilla',
  anioDigital: 2026, anioFisico: 2027, fechaSalida: '2027-01-21', cdp: '0012',
  hojas: { proyectos: true, proceso: true, salida: true, pendientes: false },
  seguimiento: [{ id: 'nota-1', fecha: '2026-11-24T10:00:00Z', tipo: 'nota', texto: 'Nota original' }],
});
const vuelta = leerExcel(await exportarExcel([original]).arrayBuffer()).libros[0];
for (const campo of ['id', 'anioDigital', 'anioFisico', 'fechaSalida', 'cdp', 'seguimiento'] as const) {
  assert.deepEqual(vuelta[campo], original[campo], campo);
}
assert.equal(prepararReemplazo([vuelta])[0].seguimiento[0].id, 'nota-1');
const combinados = aplicarCombinacion([original], planificarCombinacion([original], importar('Obra de prueba')));
assert.equal(combinados[0].tipoPublicacion, 'no_arbitrada');
const nuevos = [libroVacio({ titulo: 'Otro título', no: 10 }), libroVacio({ titulo: 'Tercero', no: 11 })];
const numeros = aplicarCombinacion([original], planificarCombinacion([original], nuevos)).map((l) => l.no);
assert.equal(new Set(numeros).size, numeros.length);

// API aislada. El proceso solo escribe en su directorio temporal.
const temporal = mkdtempSync(path.join(tmpdir(), 'editorial-regresion-'));
const servidor = spawn(process.execPath, ['--import', pathToFileURL(path.resolve('node_modules/tsx/dist/loader.mjs')).href, path.resolve('server/index.ts')], {
  cwd: temporal, env: { ...process.env, API_PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'],
});
try {
  const base = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('El servidor no inició')), 10000);
    servidor.stdout.on('data', (datos) => {
      // Cuando se solicita puerto 0, el servidor informa el puerto asignado.
      const puerto = String(datos).match(/127\.0\.0\.1:(\d+)/)?.[1];
      if (puerto) { clearTimeout(timer); resolve(`http://127.0.0.1:${puerto}/api/estado`); }
    });
    servidor.on('error', reject);
    servidor.on('exit', (codigo) => { clearTimeout(timer); reject(new Error(`Servidor cerrado: ${codigo}`)); });
  });
  const estado = await (await fetch(base)).json();
  const guardar = (revision?: string) => fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ revision, libros: [original], comite: estado.comite, archivo: null }) });
  assert.equal((await guardar()).status, 428);
  const primera = await guardar(estado.revision);
  assert.equal(primera.status, 200);
  const guardado = await primera.json();
  assert.notEqual(guardado.revision, estado.revision);
  const invalido = await fetch(base, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ revision: guardado.revision, libros: [{ id: 'incompleto' }], comite: estado.comite }),
  });
  assert.equal(invalido.status, 400);
  assert.equal((await guardar(estado.revision)).status, 409);
  assert.equal((await guardar(guardado.revision)).status, 200);
  const db = path.join(temporal, 'data', 'centro-editorial.json');
  assert.equal(JSON.parse(readFileSync(`${db}.bak`, 'utf8')).revision, guardado.revision);
  mkdirSync(path.dirname(db), { recursive: true });
  writeFileSync(db, '{dañado');
  assert.equal((await fetch(base)).status, 500);
  assert.equal((await guardar(guardado.revision)).status, 500);
  assert.equal(readFileSync(db, 'utf8'), '{dañado');
  console.log('Regresiones de fechas, ISBN, Excel, concurrencia y respaldo correctas.');
} finally {
  servidor.kill();
  await new Promise<void>((resolve) => { if (servidor.exitCode !== null) resolve(); else servidor.once('exit', () => resolve()); });
  rmSync(temporal, { recursive: true, force: true });
}
