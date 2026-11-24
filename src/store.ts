/**
 * Hook y reducer principal de estado (`useLibros`).
 * - Mantiene libros, comité editorial, configuración pública SMTP y plantillas de correo.
 * - Al iniciar, se hidrata desde `/api/estado` (servidor) y usa `localStorage` como respaldo local.
 * - Cada cambio se guarda automáticamente con un pequeño debounce (250 ms).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ComiteEditorial, CorreoConfigPublica, FaseId, Libro, Nota, PlantillaCorreo, TipoNota } from './types';
import { FASE_MAP } from './fases';
import { ETIQUETAS } from './excel/importar';
import { uid } from './utils';

const CLAVE = 'centro-editorial.v1';

const COMITE_VACIO: ComiteEditorial = {
  proximaSesion: '',
  lugarOEnlace: '',
  notasComite: '',
  participantes: [],
};

export const PLANTILLA_DEFECTO: PlantillaCorreo = {
  asuntoInvitacion: 'Invitación como par evaluador · {titulo}',
  cuerpoInvitacion:
    'Estimado(a) docente {nombrePar},\n\nCordial saludo.\n\nDesde la Coordinación Editorial le extendemos una cordial invitación para participar como par evaluador de la publicación:\n\n• Título: {titulo}\n• Autores: {autores}\n• Proyecto: {proyecto}\n• Fecha límite sugerida: {fechaLimite}\n\nAgradecemos nos confirme su disponibilidad respondiendo a este correo para remitirle el manuscrito y el formato de evaluación.\n\nAtentamente,\nCoordinación Editorial',
  asuntoRecordatorio: 'Recordatorio de evaluación · {titulo}',
  cuerpoRecordatorio:
    'Estimado(a) docente {nombrePar},\n\nCordial saludo.\n\nLe recordamos amablemente que la fecha límite para el envío del concepto de evaluación de la publicación "{titulo}" es el {fechaLimite}.\n\nQuedamos atentos a cualquier inquietud.\n\nAtentamente,\nCoordinación Editorial',
  cc: '',
  diasPlazo: 15,
  diasAvisoAntes: 3,
};

const CORREO_DEFECTO: CorreoConfigPublica = {
  host: '',
  port: 587,
  secure: false,
  user: '',
  fromName: 'Coordinación Editorial',
  tienePass: false,
};

interface Estado {
  libros: Libro[];
  comite: ComiteEditorial;
  guardado: string | null;
  archivo: string | null; // nombre del último Excel importado
}

type Accion =
  | { t: 'hidratar'; libros: Libro[]; comite: ComiteEditorial; archivo: string | null; guardado: string | null }
  | { t: 'cargar'; libros: Libro[]; archivo?: string }
  | { t: 'actualizar'; id: string; cambios: Partial<Libro> }
  | { t: 'crear'; libro: Libro }
  | { t: 'eliminar'; id: string }
  | { t: 'nota'; id: string; texto: string; tipo?: TipoNota; fecha?: string }
  | { t: 'borrarNota'; id: string; notaId: string }
  | { t: 'restaurar'; libros: Libro[] }
  | { t: 'comite'; cambios: Partial<ComiteEditorial> };

const CAMPOS_REGISTRADOS: (keyof Libro)[] = ['estado', 'etapa', 'responsable', 'fechaCompromiso', 'costo', 'isbn', 'liderProyecto', 'conceptoPares', 'requerimiento'];

function reducer(s: Estado, a: Accion): Estado {
  const ahora = new Date().toISOString();
  switch (a.t) {
    case 'hidratar':
      return { libros: a.libros, comite: a.comite, archivo: a.archivo, guardado: a.guardado };
    case 'cargar':
      return { ...s, libros: a.libros, archivo: a.archivo ?? s.archivo };
    case 'restaurar':
      return { ...s, libros: a.libros };
    case 'crear':
      return { ...s, libros: [...s.libros, a.libro] };
    case 'eliminar':
      return { ...s, libros: s.libros.filter((l) => l.id !== a.id) };
    case 'actualizar':
      return {
        ...s,
        libros: s.libros.map((l) => {
          if (l.id !== a.id) return l;
          const notas: Nota[] = [];
          if (a.cambios.fase && a.cambios.fase !== l.fase) {
            notas.push({
              id: uid(), fecha: ahora, tipo: 'cambio',
              texto: `Fase: ${FASE_MAP[l.fase].nombre} → ${FASE_MAP[a.cambios.fase as FaseId].nombre}`,
            });
          }
          for (const k of CAMPOS_REGISTRADOS) {
            if (k in a.cambios && String(a.cambios[k] ?? '') !== String(l[k] ?? '') && String(a.cambios[k] ?? '').trim()) {
              notas.push({
                id: uid(), fecha: ahora, tipo: 'cambio',
                texto: `${cap(ETIQUETAS[k] ?? k)}: ${String(a.cambios[k]).slice(0, 140)}`,
              });
            }
          }
          // Si en la misma sesión se edita varias veces el mismo campo, conservar solo el último registro
          let seguimiento = l.seguimiento;
          for (const n of notas) {
            const prefijo = n.texto.split(':')[0];
            const ult = seguimiento[seguimiento.length - 1];
            if (ult && ult.tipo === 'cambio' && ult.texto.startsWith(prefijo + ':') && Date.parse(ahora) - Date.parse(ult.fecha) < 120_000 && prefijo !== 'Fase') {
              seguimiento = [...seguimiento.slice(0, -1), n];
            } else seguimiento = [...seguimiento, n];
          }
          return { ...l, ...a.cambios, seguimiento, actualizado: ahora };
        }),
      };
    case 'nota':
      return {
        ...s,
        libros: s.libros.map((l) =>
          l.id === a.id
            ? {
                ...l,
                actualizado: ahora,
                seguimiento: [...l.seguimiento, { id: uid(), fecha: a.fecha ?? ahora, texto: a.texto, tipo: a.tipo ?? 'nota' }],
              }
            : l,
        ),
      };
    case 'borrarNota':
      return {
        ...s,
        libros: s.libros.map((l) =>
          l.id === a.id ? { ...l, seguimiento: l.seguimiento.filter((n) => n.id !== a.notaId) } : l,
        ),
      };
    case 'comite':
      return {
        ...s,
        comite: { ...s.comite, ...a.cambios },
      };
  }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function inicial(): Estado {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (raw) {
      const d = JSON.parse(raw);
      return {
        libros: d.libros ?? [],
        comite: { ...COMITE_VACIO, ...(d.comite ?? {}) },
        guardado: d.guardado ?? null,
        archivo: d.archivo ?? null,
      };
    }
  } catch {
    /* almacenamiento dañado: se empieza de cero */
  }
  return { libros: [], comite: COMITE_VACIO, guardado: null, archivo: null };
}

export function useLibros() {
  const [estado, dispatch] = useReducer(reducer, undefined, inicial);
  const [guardado, setGuardado] = useState<string | null>(estado.guardado);
  const [servidorActivo, setServidorActivo] = useState<boolean>(false);
  const [correoConfig, setCorreoConfig] = useState<CorreoConfigPublica>(CORREO_DEFECTO);
  const [plantillaCorreo, setPlantillaCorreo] = useState<PlantillaCorreo>(PLANTILLA_DEFECTO);
  const historial = useRef<Libro[][]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorGuardado, setErrorGuardado] = useState('');
  const [pendiente, setPendiente] = useState(false);
  const [intento, setIntento] = useState(0);
  const revision = useRef<string | undefined>(undefined);
  const hidratando = useRef(false);
  const conflicto = useRef(false);
  const cola = useRef(Promise.resolve());
  const secuencia = useRef(0);

  const cargarServidor = useCallback(async (descartar = false, sigueActivo: () => boolean = () => true) => {
    const r = await fetch('/api/estado', { signal: AbortSignal.timeout(10000) });
    if (!r.ok) throw new Error('No se pudo leer el servidor. Los cambios se conservarán en este navegador.');
    const srv = await r.json();
    if (!sigueActivo()) return;
    if (!srv.revision) throw new Error('Reinicia el servidor para actualizar la protección de guardado.');
    setServidorActivo(true);
    setCorreoConfig(srv.correoConfig ?? CORREO_DEFECTO);
    setPlantillaCorreo(srv.plantillaCorreo ?? PLANTILLA_DEFECTO);
    let local: { pendiente?: boolean; revision?: string; libros?: Libro[]; comite?: ComiteEditorial } = {};
    if (!descartar) {
      try { local = JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch { /* Recuperar desde el servidor. */ }
    }
    if (!descartar && local.pendiente) {
      revision.current = local.revision;
      conflicto.current = local.revision !== srv.revision;
      setPendiente(true);
      if (conflicto.current) setErrorGuardado('Hay cambios locales pendientes y una versión diferente en el servidor. Descarga el respaldo antes de cargar la versión del servidor.');
      return;
    }
    revision.current = srv.revision;
    conflicto.current = false;
    // Solo migrar automáticamente cuando el servidor nunca ha guardado un registro.
    if (!descartar && srv.revision === 'inicial' && (local.libros?.length || local.comite?.participantes?.length)) return;
    const datos = { libros: srv.libros ?? [], comite: { ...COMITE_VACIO, ...srv.comite }, archivo: srv.archivo ?? null, guardado: srv.guardado ?? null };
    localStorage.setItem(CLAVE, JSON.stringify({ ...datos, revision: srv.revision, pendiente: false }));
    hidratando.current = true;
    dispatch({ t: 'hidratar', ...datos });
    setGuardado(datos.guardado);
    setPendiente(false);
    setErrorGuardado('');
  }, []);

  useEffect(() => {
    let activo = true;
    cargarServidor(false, () => activo).catch((e: Error) => {
      if (activo) { setServidorActivo(false); setErrorGuardado(e.message); }
    }).finally(() => { if (activo) setCargando(false); });
    return () => { activo = false; };
  }, [cargarServidor]);

  useEffect(() => {
    if (cargando) return;
    if (hidratando.current) { hidratando.current = false; return; }
    const numero = ++secuencia.current;
    const datos = { libros: estado.libros, comite: estado.comite, archivo: estado.archivo };
    setPendiente(true);
    try {
      localStorage.setItem(CLAVE, JSON.stringify({ ...datos, guardado, revision: revision.current, pendiente: true }));
    } catch {
      setErrorGuardado('No se pudo crear el respaldo local. Descarga un respaldo para conservar tus cambios.');
    }
    const timer = setTimeout(() => {
      cola.current = cola.current.then(async () => {
        if (numero !== secuencia.current || conflicto.current) return;
        try {
          if (!revision.current) {
            const r = await fetch('/api/estado', { signal: AbortSignal.timeout(10000) });
            if (!r.ok) throw new Error('Servidor no disponible. Hay cambios pendientes en este navegador.');
            const srv = await r.json();
            if (srv.revision !== 'inicial') {
              conflicto.current = true;
              throw new Error('Revisa la versión del servidor antes de sincronizar los cambios locales.');
            }
            revision.current = srv.revision;
          }
          const r = await fetch('/api/estado', {
            method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...datos, revision: revision.current }),
            signal: AbortSignal.timeout(10000),
          });
          const respuesta = await r.json();
          if (r.status === 409 || r.status === 428) conflicto.current = true;
          if (!r.ok) throw new Error(respuesta.error || 'No se pudo guardar en el servidor.');
          revision.current = respuesta.revision;
          setServidorActivo(true);
          if (numero === secuencia.current) {
            localStorage.setItem(CLAVE, JSON.stringify({ ...datos, guardado: respuesta.guardado, revision: respuesta.revision, pendiente: false }));
            setGuardado(respuesta.guardado);
            setPendiente(false);
            setErrorGuardado('');
          }
        } catch (e) {
          setServidorActivo(false);
          setErrorGuardado(e instanceof Error ? e.message : 'Error al guardar. Descarga un respaldo.');
        }
      });
    }, 250);
    return () => clearTimeout(timer);
  // La fecha de guardado solo cambia tras confirmar la escritura.
  }, [estado.libros, estado.comite, estado.archivo, cargando, intento]);

  useEffect(() => {
    const avisar = (e: BeforeUnloadEvent) => { if (pendiente) { e.preventDefault(); } };
    window.addEventListener('beforeunload', avisar);
    return () => window.removeEventListener('beforeunload', avisar);
  }, [pendiente]);

  const conHistorial = useCallback(
    (a: Accion) => {
      historial.current = [...historial.current.slice(-19), estado.libros];
      dispatch(a);
    },
    [estado.libros],
  );

  const acciones = useMemo(
    () => ({
      cargar: (libros: Libro[], archivo?: string) => conHistorial({ t: 'cargar', libros, archivo }),
      actualizar: (id: string, cambios: Partial<Libro>) => dispatch({ t: 'actualizar', id, cambios }),
      crear: (libro: Libro) => dispatch({ t: 'crear', libro }),
      eliminar: (id: string) => conHistorial({ t: 'eliminar', id }),
      nota: (id: string, texto: string, fecha?: string) => dispatch({ t: 'nota', id, texto, fecha }),
      borrarNota: (id: string, notaId: string) => dispatch({ t: 'borrarNota', id, notaId }),
      actualizarComite: (cambios: Partial<ComiteEditorial>) => dispatch({ t: 'comite', cambios }),
      guardarCorreoConfig: async (cfg: Partial<CorreoConfigPublica> & { pass?: string }, plantilla?: Partial<PlantillaCorreo>) => {
        const r = await fetch('/api/correo/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ correoConfig: cfg, plantillaCorreo: plantilla }),
        });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo guardar la configuración');
        if (d.correoConfig) setCorreoConfig(d.correoConfig);
        if (d.plantillaCorreo) setPlantillaCorreo(d.plantillaCorreo);
      },
      probarCorreo: async () => {
        const r = await fetch('/api/correo/probar', { method: 'POST' });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || 'Error al verificar SMTP');
        return d.mensaje as string;
      },
      enviarCorreo: async (payload: { para: string; cc?: string; asunto: string; cuerpo: string }) => {
        const r = await fetch('/api/correo/enviar', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const d = await r.json();
        if (!r.ok || !d.ok) throw new Error(d.error || 'No se pudo enviar el correo');
        return d.messageId as string;
      },
      deshacer: () => {
        const prev = historial.current.pop();
        if (prev) dispatch({ t: 'restaurar', libros: prev });
        return !!prev;
      },
    }),
    [conHistorial],
  );

  return {
    cargando,
    errorGuardado,
    pendiente,
    reintentar: () => setIntento((n) => n + 1),
    cargarServidor: async () => {
      ++secuencia.current;
      await cola.current;
      await cargarServidor(true).catch((e: Error) => setErrorGuardado(e.message));
    },
    libros: estado.libros,
    comite: estado.comite,
    archivo: estado.archivo,
    guardado,
    servidorActivo,
    correoConfig,
    plantillaCorreo,
    ...acciones,
  };
}

export type Acciones = Omit<ReturnType<typeof useLibros>, 'libros' | 'comite' | 'archivo' | 'guardado' | 'servidorActivo' | 'correoConfig' | 'plantillaCorreo'>;
