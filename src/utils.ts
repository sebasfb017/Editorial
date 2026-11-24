import type { Libro } from './types';

export const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

const cop = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});
export const fmtCOP = (n: number | null | undefined) => (n == null ? '—' : cop.format(n));

export function fmtCOPCorto(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    const v = n / 1_000_000;
    return `$${v.toLocaleString('es-CO', { maximumFractionDigits: v >= 100 ? 0 : 1 })} M`;
  }
  return cop.format(n);
}

const fechaLarga = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
const fechaCorta = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' });

export function parseFecha(s: string): Date | null {
  if (!s) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T12:00:00') : new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
export const fmtFecha = (s: string) => {
  const d = parseFecha(s);
  return d ? fechaLarga.format(d).replace('.', '') : '—';
};
export const fmtFechaCorta = (s: string) => {
  const d = parseFecha(s);
  return d ? fechaCorta.format(d).replace('.', '') : '—';
};

export function diasDesde(iso: string, hoy = new Date()): number {
  const d = parseFecha(iso);
  if (!d) return 0;
  return Math.floor((hoy.getTime() - d.getTime()) / 86_400_000);
}

export function hace(iso: string): string {
  const d = diasDesde(iso);
  if (d <= 0) return 'hoy';
  if (d === 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  if (d < 30) return `hace ${Math.floor(d / 7)} sem.`;
  return `hace ${Math.floor(d / 30)} meses`;
}

export const hoyISO = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** Texto normalizado para comparar títulos */
export function normalizar(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(\s*titulo anterior[^)]*\)/g, ' ')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

const VACIAS = new Set(
  'la las el los de del y e en a al para por con una un uno desde sus su que o u'.split(' '),
);
const tokens = (s: string) => normalizar(s).split(' ').filter((w) => w && !VACIAS.has(w));

/** ¿Dos títulos se refieren al mismo libro? (tolera títulos abreviados, p. ej. "(TLC)") */
export function mismoTitulo(a: string, b: string): boolean {
  const na = normalizar(a);
  const nb = normalizar(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  let lcp = 0;
  while (lcp < ta.length && lcp < tb.length && ta[lcp] === tb[lcp]) lcp++;
  const min = Math.min(ta.length, tb.length);
  return lcp >= 3 && lcp / min >= 0.75;
}

export type EstadoISBN = 'asignado' | 'tramite' | 'ninguno';
export function estadoISBN(isbn: string): EstadoISBN {
  if (/97[89][-\s]?\d/.test(isbn)) return 'asignado';
  if (isbn.trim()) return 'tramite';
  return 'ninguno';
}
export function listaISBN(isbn: string): string[] {
  return isbn.match(/9?7[89][-\d]{10,}/g) ?? [];
}

export function primerAutor(autores: string): string {
  const lineas = autores.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  if (lineas.length <= 1) return lineas[0] ?? '';
  return `${lineas[0]} y ${lineas.length - 1} más`;
}

export function costoTotal(l: Libro): number {
  return (l.costo ?? 0) + (l.costoAdicional ?? 0);
}

export function tituloCorto(t: string): string {
  return t.split(/\r?\n/)[0].trim();
}

export function descargar(blob: Blob, nombre: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
