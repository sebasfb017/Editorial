/**
 * Componentes visuales reutilizables:
 * - `FaseTag`: insignia con el color y nombre de la fase editorial.
 * - `IsbnCell`: muestra ISBN asignados o estado en trámite.
 * - `Icono`: iconos SVG ligeros dibujados con trazos simples sin dependencias externas.
 */
import type { FaseId } from '../types';
import { FASE_MAP } from '../fases';
import { estadoISBN, listaISBN } from '../utils';

export function FaseTag({ fase, corto = false }: { fase: FaseId; corto?: boolean }) {
  const f = FASE_MAP[fase];
  return (
    <span className="fase-tag" style={{ ['--c' as string]: f.color }}>
      <i />
      {corto ? f.corto : f.nombre}
    </span>
  );
}

export function IsbnCell({ isbn }: { isbn: string }) {
  const e = estadoISBN(isbn);
  if (e === 'ninguno') return <span className="muted">—</span>;
  if (e === 'asignado') {
    const lista = listaISBN(isbn);
    return (
      <span className="isbn" title={isbn}>
        {lista.slice(0, 2).map((n) => (
          <span key={n}>{n}</span>
        ))}
      </span>
    );
  }
  return (
    <span className="isbn-tramite" title={isbn}>
      {isbn.length > 38 ? isbn.slice(0, 36) + '…' : isbn}
    </span>
  );
}

/** Iconos dibujados a mano, trazo fino, sin librerías */
const P: Record<string, string> = {
  resumen: 'M3 13h4v6H3zM10 8h4v11h-4zM17 4h4v15h-4z',
  proyectos: 'M5 4h11l3 3v13H5zM9 9h7M9 13h7M9 17h4',
  proceso: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4',
  salida: 'M4 19h16M7 15l5-10 5 10M9.5 11h5',
  pendientes: 'M12 7v5l3 2M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18z',
  bitacora: 'M6 3h10a2 2 0 0 1 2 2v16l-7-3-7 3V5a2 2 0 0 1 2-2z',
  subir: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  bajar: 'M12 4v12M7 11l5 5 5-5M4 20h16',
  mas: 'M12 5v14M5 12h14',
  buscar: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4',
  cerrar: 'M6 6l12 12M18 6L6 18',
  flecha: 'M9 6l6 6-6 6',
  papelera: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  alerta: 'M12 4l9 16H3zM12 10v4M12 17v.5',
  libro: 'M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5',
  correo: 'M4 6h16a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2zM22 8l-10 6L2 8',
};

export function Icono({ n, size = 16 }: { n: keyof typeof P | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[n] ?? ''} />
    </svg>
  );
}
