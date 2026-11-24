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
  const primera = useRef(true);
  const hidratando = useRef(false);

  // Al iniciar, sincronizar con la base centralizada del servidor
  useEffect(() => {
    let cancelado = false;
    fetch('/api/estado')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('API no disponible'))))
      .then((srv) => {
        if (cancelado) return;
        setServidorActivo(true);
        if (srv.correoConfig) setCorreoConfig(srv.correoConfig);
        if (srv.plantillaCorreo) setPlantillaCorreo(srv.plantillaCorreo);
        const srvTieneDatos = (srv.libros?.length ?? 0) > 0 || (srv.comite?.participantes?.length ?? 0) > 0 || Boolean(srv.archivo);
        if (srvTieneDatos) {
          hidratando.current = true;
          dispatch({
            t: 'hidratar',
            libros: srv.libros ?? [],
            comite: { ...COMITE_VACIO, ...(srv.comite ?? {}) },
            archivo: srv.archivo ?? null,
            guardado: srv.guardado ?? null,
          });
          setGuardado(srv.guardado ?? null);
          localStorage.setItem(CLAVE, JSON.stringify({ libros: srv.libros ?? [], comite: srv.comite ?? COMITE_VACIO, archivo: srv.archivo ?? null, guardado: srv.guardado ?? null }));
        } else if (estado.libros.length > 0 || estado.comite.participantes.length > 0) {
          // Migrar datos locales iniciales al servidor vacío
          fetch('/api/estado', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ libros: estado.libros, comite: estado.comite, archivo: estado.archivo }),
          }).catch(() => {});
        }
      })
      .catch(() => {
        setServidorActivo(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    if (primera.current) {
      primera.current = false;
      return;
    }
    if (hidratando.current) {
      hidratando.current = false;
      return;
    }
    const t = setTimeout(() => {
      const g = new Date().toISOString();
      localStorage.setItem(CLAVE, JSON.stringify({ libros: estado.libros, comite: estado.comite, archivo: estado.archivo, guardado: g }));
      setGuardado(g);
      fetch('/api/estado', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ libros: estado.libros, comite: estado.comite, archivo: estado.archivo }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((res) => {
          if (res?.ok) {
            setServidorActivo(true);
            if (res.guardado) setGuardado(res.guardado);
          }
        })
        .catch(() => setServidorActivo(false));
    }, 250);
    return () => clearTimeout(t);
  }, [estado.libros, estado.comite, estado.archivo]);

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
