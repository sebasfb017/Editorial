/**
 * Definición central de tipos de datos del Centro Editorial.
 */

/** Fases del recorrido editorial de una publicación. */
export type FaseId =
  | 'sin_info'
  | 'evaluacion'
  | 'cotizacion'
  | 'aprobado'
  | 'estilo'
  | 'diagramacion'
  | 'revision_autor'
  | 'impresion'
  | 'publicado'
  | 'detenido';

export type TipoNota = 'nota' | 'cambio' | 'sistema';

export interface Nota {
  id: string;
  fecha: string; // ISO
  texto: string;
  tipo: TipoNota;
}

/** Hojas del libro de Excel original. Cada libro puede aparecer en varias. */
export type HojaId = 'proyectos' | 'proceso' | 'salida' | 'pendientes';

/** Agrupación principal: arbitradas (libros/revistas) vs. no arbitradas (cartillas/memorias). */
export type TipoPublicacion = 'arbitrada' | 'no_arbitrada';
export type SubtipoPublicacion = 'libro' | 'revista' | 'cartilla' | 'memoria';

/** Participante registrado en el Comité Editorial. */
export interface ParticipanteComite {
  id: string;
  nombre: string;
  rol: string;
  correo?: string;
}

export interface ComiteEditorial {
  proximaSesion: string; // yyyy-mm-dd
  lugarOEnlace: string;
  notasComite: string;
  participantes: ParticipanteComite[];
}

/** Par evaluador asignado a una publicación y estado de su seguimiento por correo. */
export type EstadoPar = 'pendiente' | 'invitado' | 'aceptado' | 'evaluado' | 'vencido';

export interface ParEvaluador {
  id: string;
  nombre: string;
  correo: string;
  institucion?: string;
  estado: EstadoPar;
  fechaEnvio?: string; // yyyy-mm-dd
  fechaLimite?: string; // yyyy-mm-dd
  ultimoRecordatorio?: string; // yyyy-mm-dd
  concepto?: string;
}

export interface PlantillaCorreo {
  asuntoInvitacion: string;
  cuerpoInvitacion: string;
  asuntoRecordatorio: string;
  cuerpoRecordatorio: string;
  cc: string;
  diasPlazo: number;
  diasAvisoAntes: number;
}

export interface CorreoConfigPublica {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  tienePass: boolean;
}

export interface Libro {
  id: string;

  // --- Clasificación editorial
  tipoPublicacion?: TipoPublicacion;
  subtipoPublicacion?: SubtipoPublicacion;

  // --- Hoja "Proyectos 2026-2"
  no: number | null;
  titulo: string;
  autores: string;
  observacion: string;
  estado: string;
  cdp: string;
  proyecto: string;
  liderProyecto?: string;
  conceptoPares?: string;
  requerimiento?: string;
  isbn: string;
  costo: number | null;
  costoAdicional: number | null; // p. ej. "+ 102.100" (trámite ISBN)

  // --- Hoja "Proceso de Libros"
  etapa: string;
  obsProceso: string;

  // --- Hoja "Libros que salen en 2026"
  obsSalida: string;

  // --- Hoja "Libros aprobados pendientes 2027"
  obsPendiente: string;

  // --- Plan de publicación (derivado / editable)
  anioDigital: number | null;
  anioFisico: number | null;
  fechaSalida: string; // yyyy-mm-dd

  // --- Gestión interna (solo en el centro de control)
  fase: FaseId;
  responsable: string;
  proximaAccion: string;
  fechaCompromiso: string; // yyyy-mm-dd

  hojas: Record<HojaId, boolean>;
  pares?: ParEvaluador[];
  seguimiento: Nota[];
  creado: string;
  actualizado: string;
}

export type Vista = 'resumen' | HojaId | 'bitacora' | 'pares';
