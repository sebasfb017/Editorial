import * as XLSX from 'xlsx';
import type { FaseId, HojaId, Libro, SubtipoPublicacion, TipoPublicacion } from '../types';
import { FASES, faseDeTexto, inferirFase } from '../fases';
import { mismoTitulo, normalizar, uid } from '../utils';

export interface HojaDef {
  id: HojaId;
  nombre: string; // nombre de la hoja al exportar
  etiqueta: string; // nombre en el menú
  descripcion: string;
}

export const HOJAS: HojaDef[] = [
  {
    id: 'proyectos',
    nombre: 'Proyectos 2026-2',
    etiqueta: 'Proyectos 2026-2',
    descripcion: 'Registro maestro de todos los títulos, con autores, CDP, proyecto y costo.',
  },
  {
    id: 'proceso',
    nombre: 'Proceso de Libros',
    etiqueta: 'Proceso de libros',
    descripcion: 'Títulos en producción editorial: etapa actual, ISBN y observaciones.',
  },
  {
    id: 'salida',
    nombre: 'Libros que salen en 2026',
    etiqueta: 'Salen en 2026',
    descripcion: 'Títulos con publicación (física o digital) prevista para este año.',
  },
  {
    id: 'pendientes',
    nombre: 'Aprobados pendientes 2027',
    etiqueta: 'Pendientes 2027+',
    descripcion: 'Títulos aprobados cuya salida queda para 2027 en adelante o aún sin cotizar.',
  },
];

export const HOJA_MAP = Object.fromEntries(HOJAS.map((h) => [h.id, h])) as Record<HojaId, HojaDef>;

// ---------------------------------------------------------------------------

export function libroVacio(parcial: Partial<Libro> = {}): Libro {
  const ahora = new Date().toISOString();
  return {
    id: uid(),
    tipoPublicacion: 'arbitrada',
    subtipoPublicacion: 'libro',
    no: null,
    titulo: '',
    autores: '',
    observacion: '',
    estado: '',
    cdp: '',
    proyecto: '',
    liderProyecto: '',
    conceptoPares: '',
    requerimiento: '',
    isbn: '',
    costo: null,
    costoAdicional: null,
    etapa: '',
    obsProceso: '',
    obsSalida: '',
    obsPendiente: '',
    anioDigital: null,
    anioFisico: null,
    fechaSalida: '',
    fase: 'sin_info',
    responsable: '',
    proximaAccion: '',
    fechaCompromiso: '',
    hojas: { proyectos: false, proceso: false, salida: false, pendientes: false },
    seguimiento: [],
    creado: ahora,
    actualizado: ahora,
    ...parcial,
  };
}

const txt = (v: unknown): string => {
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
};

/** "COP3,774,500.00" · "6.299.000" · 3774500 → número */
export function parseMonto(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? Math.round(v) : null;
  let s = String(v).replace(/[^\d.,]/g, '');
  if (!s) return null;
  s = s.replace(/[.,]\d{1,2}$/, ''); // decimales
  const n = Number(s.replace(/[.,]/g, ''));
  return isFinite(n) && n > 0 ? n : null;
}

function parseCosto(v: unknown): { costo: number | null; adicional: number | null } {
  if (typeof v === 'string' && v.includes('+')) {
    const [a, b] = v.split('+');
    return { costo: parseMonto(a), adicional: parseMonto(b) };
  }
  return { costo: parseMonto(v), adicional: null };
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** Interpreta textos como "Digital este año, físico el otro año" o "Fisico y digital (27 de noviembre)". */
export function parsePlan(texto: string, anioBase: number) {
  // Se conservan comas y punto y coma para poder separar "digital este año, físico el otro año"
  const t = (texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
  const out: { digital?: number; fisico?: number; fecha?: string } = {};
  if (!t) return out;
  const f = t.match(/(\d{1,2}) de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/);
  if (f) {
    const mm = String(MESES.indexOf(f[2]) + 1).padStart(2, '0');
    out.fecha = `${anioBase}-${mm}-${f[1].padStart(2, '0')}`;
  }
  for (const seg of t.split(/,|;/)) {
    const ex = seg.match(/20\d{2}/);
    const anio = ex ? Number(ex[0]) : /otro ano|proximo|siguiente/.test(seg) ? anioBase + 1 : anioBase;
    if (/digital/.test(seg)) out.digital = anio;
    if (/fisico/.test(seg)) out.fisico = anio;
  }
  return out;
}

function tipoHoja(nombre: string): HojaId | null {
  const n = normalizar(nombre);
  if (n.includes('pendiente') || /202[7-9]|203\d/.test(n)) return 'pendientes';
  if (n.includes('salen') || n.includes('salida')) return 'salida';
  if (n.includes('proceso')) return 'proceso';
  if (n.includes('proyecto') || n.includes('arbitrad') || n.includes('cartilla') || n.includes('memoria') || n.includes('revista') || /202[4-6]/.test(n)) return 'proyectos';
  return null;
}

function inferirClasificacion(
  rawTipo: string,
  rawSubtipo: string,
  titulo: string,
  obs: string,
  nombreHoja: string,
): { tipo?: TipoPublicacion; subtipo?: SubtipoPublicacion } {
  const t = normalizar(rawTipo);
  const s = normalizar(rawSubtipo);
  const ctx = normalizar(`${titulo} ${obs} ${nombreHoja}`);

  let subtipo: SubtipoPublicacion | undefined;
  if (s.includes('revista') || (!s && /\brevista\b/.test(ctx))) subtipo = 'revista';
  else if (s.includes('cartilla') || (!s && /\bcartilla\b/.test(ctx))) subtipo = 'cartilla';
  else if (s.includes('memoria') || (!s && /\bmemoria(s)?\b/.test(ctx))) subtipo = 'memoria';
  else if (s.includes('libro')) subtipo = 'libro';

  let tipo: TipoPublicacion | undefined;
  if (t.includes('no arbitrada') || t.includes('no_arbitrada') || subtipo === 'cartilla' || subtipo === 'memoria') {
    tipo = 'no_arbitrada';
    if (!subtipo) subtipo = 'cartilla';
  } else if (t.includes('arbitrada') || subtipo === 'revista' || subtipo === 'libro') {
    tipo = 'arbitrada';
    if (!subtipo) subtipo = 'libro';
  }
  return { tipo, subtipo };
}

const COLS: Record<string, string[]> = {
  no: ['no', 'n', 'numero', 'no.'],
  tipoPublicacion: ['agrupacion', 'tipo de publicacion', 'tipo publicacion', 'arbitrada'],
  subtipoPublicacion: ['categoria', 'subtipo', 'formato publicacion', 'tipo'],
  titulo: ['titulo', 'nombre del libro', 'titulo del libro', 'libro', 'nombre'],
  autores: ['autor', 'autores'],
  liderProyecto: ['lider proyecto', 'lider de proyecto', 'lider'],
  observacion: ['observacion'],
  estado: ['estado'],
  cdp: ['cdp'],
  proyecto: ['proyecto'],
  conceptoPares: ['concepto de pares evaluadores', 'concepto de pares', 'concepto pares', 'pares evaluadores'],
  requerimiento: ['requerimiento', 'requerimientos'],
  isbn: ['isbn', 'cuenta con isbn'],
  costo: ['costo', 'precio cop', 'precio', 'valor'],
  anio: ['ano', 'anio', 'ano trabajo', 'ano de trabajo', 'ano publicacion'],
  etapa: ['etapa actual', 'etapa'],
  observaciones: ['observaciones'],
  fase: ['fase'],
  responsable: ['responsable'],
  proximaAccion: ['proxima accion'],
  fechaCompromiso: ['fecha compromiso'],
};

function mapearEncabezados(fila: unknown[]): Record<string, number> {
  const idx: Record<string, number> = {};
  fila.forEach((c, i) => {
    const h = normalizar(txt(c));
    if (!h) return;
    for (const [campo, alias] of Object.entries(COLS)) {
      if (idx[campo] !== undefined) continue;
      if (alias.some((a) => h === normalizar(a))) {
        idx[campo] = i;
        return;
      }
    }
  });
  return idx;
}

export interface ResumenHoja {
  nombre: string;
  tipo: HojaId | null;
  filas: number;
}

export interface ResultadoLectura {
  libros: Libro[];
  hojas: ResumenHoja[];
  advertencias: string[];
}

export function leerExcel(buffer: ArrayBuffer): ResultadoLectura {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const libros: Libro[] = [];
  const hojas: ResumenHoja[] = [];
  const advertencias: string[] = [];

  const buscar = (titulo: string) => libros.find((l) => mismoTitulo(l.titulo, titulo));

  // Orden de lectura: maestro primero para que su título y datos tengan prioridad.
  const orden: HojaId[] = ['proyectos', 'proceso', 'salida', 'pendientes'];
  const ordenadas = [...wb.SheetNames].sort(
    (a, b) => orden.indexOf(tipoHoja(a) ?? 'pendientes') - orden.indexOf(tipoHoja(b) ?? 'pendientes'),
  );

  for (const nombre of ordenadas) {
    const tipo = tipoHoja(nombre);
    const ws = wb.Sheets[nombre];
    const filas = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true });
    if (!tipo) {
      hojas.push({ nombre, tipo: null, filas: 0 });
      advertencias.push(`La hoja "${nombre}" no se reconoció y fue omitida.`);
      continue;
    }
    const iHead = filas.findIndex((f) => {
      const m = mapearEncabezados(f ?? []);
      return m.titulo !== undefined;
    });
    if (iHead < 0) {
      hojas.push({ nombre, tipo, filas: 0 });
      advertencias.push(`No se encontró la fila de encabezados en "${nombre}".`);
      continue;
    }
    const col = mapearEncabezados(filas[iHead]);
    const get = (f: unknown[], k: string) => (col[k] === undefined ? null : f[col[k]]);
    const m = nombre.match(/20\d{2}/);
    const anioBase = m ? Number(m[0]) : tipo === 'pendientes' ? new Date().getFullYear() + 1 : new Date().getFullYear();

    let n = 0;
    for (const f of filas.slice(iHead + 1)) {
      if (!f) continue;
      const titulo = txt(get(f, 'titulo'));
      if (!titulo || /^total\b/.test(normalizar(titulo))) continue; // filas de totales o vacías
      n++;
      let l = buscar(titulo);
      const esNuevo = !l;
      if (!l) {
        l = libroVacio({ titulo });
        libros.push(l);
      }
      l.hojas[tipo] = true;
      const setSiVacio = <K extends keyof Libro>(k: K, v: Libro[K]) => {
        if ((l![k] === '' || l![k] == null) && v !== '' && v != null) l![k] = v;
      };

      const rawTipo = txt(get(f, 'tipoPublicacion'));
      const rawSubtipo = txt(get(f, 'subtipoPublicacion'));
      if (esNuevo || rawTipo || rawSubtipo) {
        const clasif = inferirClasificacion(
          rawTipo,
          rawSubtipo,
          titulo,
          txt(get(f, 'observacion') ?? get(f, 'observaciones')),
          nombre,
        );
        if (clasif.tipo) l.tipoPublicacion = clasif.tipo;
        if (clasif.subtipo) l.subtipoPublicacion = clasif.subtipo;
      }

      setSiVacio('liderProyecto', txt(get(f, 'liderProyecto')));
      setSiVacio('conceptoPares', txt(get(f, 'conceptoPares')));
      setSiVacio('requerimiento', txt(get(f, 'requerimiento')));
      const anioCol = Number(get(f, 'anio'));
      if (isFinite(anioCol) && anioCol >= 2000 && anioCol <= 2100) {
        if (!l.anioFisico) l.anioFisico = anioCol;
        if (!l.anioDigital) l.anioDigital = anioCol;
      }

      if (tipo === 'proyectos') {
        const no = Number(get(f, 'no'));
        l.no = isFinite(no) && no > 0 ? no : l.no;
        setSiVacio('autores', txt(get(f, 'autores')));
        setSiVacio('observacion', txt(get(f, 'observacion')));
        setSiVacio('estado', txt(get(f, 'estado')));
        setSiVacio('cdp', txt(get(f, 'cdp')));
        setSiVacio('proyecto', txt(get(f, 'proyecto')));
        setSiVacio('isbn', txt(get(f, 'isbn')));
        const c = parseCosto(get(f, 'costo'));
        setSiVacio('costo', c.costo);
        setSiVacio('costoAdicional', c.adicional);
        const fase = txt(get(f, 'fase'));
        const def = FASES.find((x) => normalizar(x.nombre) === normalizar(fase) || x.id === fase);
        if (def) l.fase = def.id;
        else {
          const inf = faseDeTexto(fase);
          if (inf) l.fase = inf;
        }
        setSiVacio('responsable', txt(get(f, 'responsable')));
        setSiVacio('proximaAccion', txt(get(f, 'proximaAccion')));
        setSiVacio('fechaCompromiso', txt(get(f, 'fechaCompromiso')).slice(0, 10));
      } else {
        setSiVacio('etapa', txt(get(f, 'etapa')));
        const isbn = txt(get(f, 'isbn'));
        if (isbn && (!l.isbn || /^listo$/i.test(l.isbn))) l.isbn = isbn;
        setSiVacio('costo', parseMonto(get(f, 'costo')));
        const obs = txt(get(f, 'observaciones') ?? get(f, 'observacion'));
        if (tipo === 'proceso') l.obsProceso = obs;
        if (tipo === 'salida' || tipo === 'pendientes') {
          if (tipo === 'salida') l.obsSalida = obs;
          else l.obsPendiente = obs;
          const p = parsePlan(obs, anioBase);
          if (p.digital) l.anioDigital = p.digital;
          if (p.fisico) l.anioFisico = p.fisico;
          if (p.fecha && !l.fechaSalida) l.fechaSalida = p.fecha;
        }
      }
    }
    hojas.push({ nombre, tipo, filas: n });
  }

  for (const l of libros) {
    const tieneFaseExplicita = l.fase !== 'sin_info';
    if (!tieneFaseExplicita) l.fase = inferirFase(l.etapa, l.estado, l.observacion);
  }
  // Numerar títulos sin número consecutivo al final
  let max = Math.max(0, ...libros.map((l) => l.no ?? 0));
  for (const l of libros) if (l.no == null) l.no = ++max;

  return { libros, hojas, advertencias };
}

// ---------------------------------------------------------------------------
// Combinación con los datos que ya existen en el centro de control

const CAMPOS_EXCEL: (keyof Libro)[] = [
  'tipoPublicacion', 'subtipoPublicacion', 'titulo', 'autores', 'liderProyecto', 'observacion', 'estado',
  'cdp', 'proyecto', 'conceptoPares', 'requerimiento', 'isbn', 'costo',
  'costoAdicional', 'etapa', 'obsProceso', 'obsSalida', 'obsPendiente', 'anioDigital',
  'anioFisico', 'fechaSalida',
];

export const ETIQUETAS: Partial<Record<keyof Libro, string>> = {
  tipoPublicacion: 'agrupación', subtipoPublicacion: 'categoría',
  titulo: 'título', autores: 'autores', liderProyecto: 'líder de proyecto',
  observacion: 'observación', estado: 'estado',
  cdp: 'CDP', proyecto: 'proyecto', conceptoPares: 'concepto de pares',
  requerimiento: 'requerimiento', isbn: 'ISBN', costo: 'costo', costoAdicional: 'costo adicional',
  etapa: 'etapa actual', obsProceso: 'obs. de proceso', obsSalida: 'obs. de salida',
  obsPendiente: 'obs. pendientes', anioDigital: 'año digital', anioFisico: 'año físico',
  fechaSalida: 'fecha de salida', fase: 'fase', responsable: 'responsable',
  proximaAccion: 'próxima acción', fechaCompromiso: 'fecha compromiso', no: 'número',
};

export interface PlanImportacion {
  nuevos: Libro[];
  actualizados: { antes: Libro; despues: Libro; cambios: string[] }[];
  sinCambios: number;
}

export function planificarCombinacion(actuales: Libro[], importados: Libro[]): PlanImportacion {
  const plan: PlanImportacion = { nuevos: [], actualizados: [], sinCambios: 0 };
  const usados = new Set<string>();
  const ahora = new Date().toISOString();

  for (const imp of importados) {
    const ex = actuales.find((a) => !usados.has(a.id) && mismoTitulo(a.titulo, imp.titulo));
    if (!ex) {
      plan.nuevos.push({
        ...imp,
        seguimiento: [{ id: uid(), fecha: ahora, tipo: 'sistema', texto: 'Registrado desde Excel.' }],
      });
      continue;
    }
    usados.add(ex.id);
    const cambios: string[] = [];
    const despues: Libro = { ...ex, hojas: { ...ex.hojas } };
    for (const k of CAMPOS_EXCEL) {
      const nuevo = imp[k];
      if (nuevo === '' || nuevo == null) continue;
      if (String(nuevo) !== String(ex[k] ?? '')) {
        (despues as unknown as Record<string, unknown>)[k] = nuevo;
        cambios.push(ETIQUETAS[k] ?? k);
      }
    }
    (Object.keys(imp.hojas) as HojaId[]).forEach((h) => {
      if (imp.hojas[h] && !ex.hojas[h]) {
        despues.hojas[h] = true;
        cambios.push(`agregado a "${HOJA_MAP[h].etiqueta}"`);
      }
    });
    const faseNueva: FaseId = inferirFase(despues.etapa, despues.estado, despues.observacion);
    if (cambios.length && faseNueva !== ex.fase && (cambios.includes('etapa actual') || cambios.includes('estado'))) {
      despues.fase = faseNueva;
      cambios.push('fase');
    }
    if (cambios.length) {
      despues.actualizado = ahora;
      despues.seguimiento = [
        ...ex.seguimiento,
        { id: uid(), fecha: ahora, tipo: 'sistema', texto: `Actualizado desde Excel: ${cambios.join(', ')}.` },
      ];
      plan.actualizados.push({ antes: ex, despues, cambios });
    } else plan.sinCambios++;
  }
  return plan;
}

export function aplicarCombinacion(actuales: Libro[], plan: PlanImportacion): Libro[] {
  const map = new Map(plan.actualizados.map((u) => [u.antes.id, u.despues]));
  let max = Math.max(0, ...actuales.map((l) => l.no ?? 0));
  const nuevos = plan.nuevos.map((n) => (actuales.some((a) => a.no === n.no) ? { ...n, no: ++max } : n));
  return [...actuales.map((a) => map.get(a.id) ?? a), ...nuevos];
}

export function prepararReemplazo(importados: Libro[]): Libro[] {
  const ahora = new Date().toISOString();
  return importados.map((l) => ({
    ...l,
    seguimiento: [{ id: uid(), fecha: ahora, tipo: 'sistema' as const, texto: 'Registrado desde Excel.' }],
  }));
}
