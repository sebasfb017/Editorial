import type { FaseId } from './types';

export interface FaseDef {
  id: FaseId;
  nombre: string;
  corto: string;
  color: string;
}

/** Orden = recorrido editorial normal de un libro. */
export const FASES: FaseDef[] = [
  { id: 'sin_info', nombre: 'Sin información', corto: 'Sin info', color: '#9a9489' },
  { id: 'evaluacion', nombre: 'En evaluación', corto: 'Evaluación', color: '#b08a3e' },
  { id: 'cotizacion', nombre: 'En cotización', corto: 'Cotización', color: '#c97b2a' },
  { id: 'aprobado', nombre: 'Cotización aprobada', corto: 'Aprobado', color: '#7d8a3a' },
  { id: 'estilo', nombre: 'Corrección de estilo', corto: 'Estilo', color: '#3f7f73' },
  { id: 'diagramacion', nombre: 'Diagramación', corto: 'Diagramación', color: '#2f6c8f' },
  { id: 'revision_autor', nombre: 'Revisión del autor', corto: 'Rev. autor', color: '#4a5a9c' },
  { id: 'impresion', nombre: 'Impresión / ISBN', corto: 'Impresión', color: '#6c4a8a' },
  { id: 'publicado', nombre: 'Listo / publicado', corto: 'Listo', color: '#1f3a33' },
  { id: 'detenido', nombre: 'Detenido / no aprobado', corto: 'Detenido', color: '#a3402f' },
];

export const FASE_MAP: Record<FaseId, FaseDef> = Object.fromEntries(
  FASES.map((f) => [f.id, f]),
) as Record<FaseId, FaseDef>;

const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function faseDeTexto(raw: string): FaseId | null {
  const t = norm(raw || '').trim();
  if (!t) return null;
  if (/no aprobado|costo muy alto|cancelad/.test(t)) return 'detenido';
  if (/^listo|facturado|publicad/.test(t)) return 'publicado';
  if (/impresion/.test(t)) return 'impresion';
  if (
    /revision (final )?(por |del |de la |de )?(el |la )?autor|envia al autor|aprobado el libro final|comentarios del autor/.test(t)
  )
    return 'revision_autor';
  if (/diagramacion|disenador/.test(t)) return 'diagramacion';
  if (/revision de estilo|correccion de estilo/.test(t)) return 'estilo';
  if (/cotizacion aprobada|^aprobad/.test(t)) return 'aprobado';
  if (/cotizacion|presupuesto/.test(t)) return 'cotizacion';
  if (/no se tiene informacion/.test(t)) return 'sin_info';
  if (/requisito|recomendad|sugerencia|evaluador|en proceso|pendiente|convocatoria/.test(t)) return 'evaluacion';
  return null;
}

/** Infiere la fase a partir de los textos libres del Excel (el más reciente primero). */
export function inferirFase(etapa: string, estado: string, observacion: string, faseExplicita = ''): FaseId {
  return faseDeTexto(faseExplicita) ?? faseDeTexto(etapa) ?? faseDeTexto(estado) ?? faseDeTexto(observacion) ?? 'sin_info';
}
