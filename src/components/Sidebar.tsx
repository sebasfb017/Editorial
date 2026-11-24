/**
 * Barra lateral de navegación:
 * - Enlaces a Resumen, las 4 hojas del Excel, Pares y correos, y Bitácora con sus contadores.
 * - Botones para Cargar/Descargar Excel e indicador de sincronización (Servidor vs. Local).
 */
import type { FaseId, Libro, Vista } from '../types';
import { HOJAS } from '../excel/importar';
import { Icono } from './ui';
import { hace } from '../utils';

interface Props {
  vista: Vista;
  irA: (v: Vista, f?: FaseId | null) => void;
  libros: Libro[];
  guardado: string | null;
  servidorActivo: boolean;
  archivo: string | null;
  onImportar: () => void;
  onExportar: () => void;
}

export function Sidebar({ vista, irA, libros, guardado, servidorActivo, archivo, onImportar, onExportar }: Props) {
  const notas = libros.reduce((n, l) => n + l.seguimiento.filter((s) => s.tipo === 'nota').length, 0);
  const totalPares = libros.reduce((n, l) => n + (l.pares?.length ?? 0), 0);
  return (
    <aside className="sidebar">
      <div className="marca">
        <div className="marca-sello">SE</div>
        <div>
          <div className="marca-nombre">Seguimiento editorial</div>
          <div className="marca-sub">Centro de control de publicaciones</div>
        </div>
      </div>

      <nav className="nav">
        <button className={`nav-item ${vista === 'resumen' ? 'activo' : ''}`} onClick={() => irA('resumen')}>
          <Icono n="resumen" /> Resumen
        </button>

        <div className="nav-grupo">Hojas del libro</div>
        {HOJAS.map((h) => (
          <button key={h.id} className={`nav-item ${vista === h.id ? 'activo' : ''}`} onClick={() => irA(h.id)}>
            <Icono n={h.id} /> {h.etiqueta}
            <span className="nav-cuenta">{libros.filter((l) => l.hojas[h.id]).length}</span>
          </button>
        ))}

        <div className="nav-grupo">Seguimiento</div>
        <button className={`nav-item ${vista === 'pares' ? 'activo' : ''}`} onClick={() => irA('pares')}>
          <Icono n="correo" /> Pares y correos
          {totalPares > 0 && <span className="nav-cuenta">{totalPares}</span>}
        </button>
        <button className={`nav-item ${vista === 'bitacora' ? 'activo' : ''}`} onClick={() => irA('bitacora')}>
          <Icono n="bitacora" /> Bitácora
          {notas > 0 && <span className="nav-cuenta">{notas}</span>}
        </button>
      </nav>

      <div className="sidebar-pie">
        <button className="btn-side" onClick={onImportar}>
          <Icono n="subir" /> Cargar Excel
        </button>
        <button className="btn-side" onClick={onExportar} disabled={!libros.length}>
          <Icono n="bajar" /> Descargar Excel
        </button>
        <div className="sidebar-estado">
          {archivo && <div title={archivo}>Fuente: {archivo}</div>}
          {guardado ? (
            <div>Guardado {hace(guardado)} · {servidorActivo ? 'Servidor' : 'Local'}</div>
          ) : (
            <div>Sin datos guardados</div>
          )}
        </div>
      </div>
    </aside>
  );
}
