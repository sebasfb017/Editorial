/**
 * Utilidades compartidas de formato y comparación:
 * - Formateo de moneda COP, fechas cortas/largas y tiempos relativos ("hace 2 días").
 * - Normalización de texto y `mismoTitulo()` para unir libros repetidos entre hojas del Excel.
 * - Validación de estado de ISBN y cálculo de costo total.
 */
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const dia = (v: Date) => Date.UTC(v.getFullYear(), v.getMonth(), v.getDate());
    return Math.round((dia(hoy) - dia(d)) / 86_400_000);
  }
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

/** Solo unir automáticamente títulos completos equivalentes. */
export function mismoTitulo(a: string, b: string): boolean {
  return Boolean(normalizar(a)) && normalizar(a) === normalizar(b);
}

export type EstadoISBN = 'asignado' | 'tramite' | 'ninguno';
export function estadoISBN(isbn: string): EstadoISBN {
  if (listaISBN(isbn).length) return 'asignado';
  if (isbn.trim()) return 'tramite';
  return 'ninguno';
}
export function listaISBN(isbn: string): string[] {
  const candidatos = isbn.match(/\b(?:97[89](?:[- ]?\d){10}|\d(?:[- ]?\d){8}[- ]?[\dXx])\b/g) ?? [];
  return candidatos.filter((valor) => {
    const n = valor.replace(/[- ]/g, '').toUpperCase();
    if (/^97[89]\d{10}$/.test(n)) {
      return [...n].reduce((s, c, i) => s + Number(c) * (i % 2 ? 3 : 1), 0) % 10 === 0;
    }
    return /^\d{9}[\dX]$/.test(n) && [...n].reduce((s, c, i) => s + (c === 'X' ? 10 : Number(c)) * (10 - i), 0) % 11 === 0;
  });
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
