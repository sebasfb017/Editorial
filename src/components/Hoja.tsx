import { useEffect, useMemo, useRef, useState, type KeyboardEvent as KEvent, type ReactNode } from 'react';
import type { FaseId, HojaId, Libro, TipoPublicacion } from '../types';
import { FASES } from '../fases';
import { HOJA_MAP } from '../excel/importar';
import { FaseTag, Icono, IsbnCell } from './ui';
import { costoTotal, fmtCOP, fmtFechaCorta, normalizar, primerAutor } from '../utils';

type Tipo = 'texto' | 'largo' | 'dinero' | 'fase' | 'isbn' | 'anio' | 'fecha' | 'numero' | 'autores';

interface Col {
  k: keyof Libro;
  t: string;
  tipo: Tipo;
  w?: number;
  edit?: boolean;
}

const C = {
  no: { k: 'no', t: 'No.', tipo: 'numero', w: 52, edit: true },
  titulo: { k: 'titulo', t: 'Título', tipo: 'largo', w: 300, edit: true },
  autores: { k: 'autores', t: 'Autor', tipo: 'autores', w: 190, edit: true },
  observacion: { k: 'observacion', t: 'Observación', tipo: 'largo', w: 240, edit: true },
  estado: { k: 'estado', t: 'Estado', tipo: 'largo', w: 220, edit: true },
  fase: { k: 'fase', t: 'Fase', tipo: 'fase', w: 150, edit: true },
  cdp: { k: 'cdp', t: 'CDP', tipo: 'texto', w: 70, edit: true },
  proyecto: { k: 'proyecto', t: 'Proyecto', tipo: 'largo', w: 200, edit: true },
  isbn: { k: 'isbn', t: 'ISBN', tipo: 'isbn', w: 160, edit: true },
  costo: { k: 'costo', t: 'Costo', tipo: 'dinero', w: 130, edit: true },
  etapa: { k: 'etapa', t: 'Etapa actual', tipo: 'largo', w: 240, edit: true },
  obsProceso: { k: 'obsProceso', t: 'Observaciones', tipo: 'largo', w: 240, edit: true },
  obsSalida: { k: 'obsSalida', t: 'Formato y salida', tipo: 'largo', w: 190, edit: true },
  obsPendiente: { k: 'obsPendiente', t: 'Observaciones', tipo: 'largo', w: 220, edit: true },
  anioDigital: { k: 'anioDigital', t: 'Digital', tipo: 'anio', w: 72, edit: true },
  anioFisico: { k: 'anioFisico', t: 'Físico', tipo: 'anio', w: 72, edit: true },
  fechaSalida: { k: 'fechaSalida', t: 'Fecha', tipo: 'fecha', w: 92, edit: true },
  responsable: { k: 'responsable', t: 'Responsable', tipo: 'texto', w: 120, edit: true },
  precio: { k: 'costo', t: 'Precio (COP)', tipo: 'dinero', w: 130, edit: true },
} satisfies Record<string, Col>;

const COLUMNAS: Record<HojaId, Col[]> = {
  proyectos: [C.no, C.titulo, C.autores, C.observacion, C.estado, C.fase, C.cdp, C.proyecto, C.isbn, C.costo],
  proceso: [C.titulo, C.etapa, C.fase, C.isbn, C.precio, C.obsProceso, C.responsable],
  salida: [C.titulo, C.etapa, C.fase, C.isbn, C.precio, C.obsSalida, C.anioDigital, C.anioFisico, C.fechaSalida],
  pendientes: [C.titulo, C.etapa, C.fase, C.isbn, C.precio, C.obsPendiente, C.anioDigital, C.anioFisico],
};

interface Props {
  hoja: HojaId;
  libros: Libro[];
  filtroFaseInicial: FaseId | null;
  abrir: (id: string) => void;
  abiertoId: string | null;
  actualizar: (id: string, c: Partial<Libro>) => void;
  nuevo: () => void;
  onImportar: () => void;
}

function valorOrden(l: Libro, c: Col): string | number {
  const v = l[c.k];
  if (c.tipo === 'fase') return FASES.findIndex((f) => f.id === v);
  if (c.tipo === 'dinero') return c.k === 'costo' ? costoTotal(l) : Number(v ?? -1);
  if (typeof v === 'number') return v;
  return normalizar(String(v ?? ''));
}

export function Hoja({ hoja, libros, filtroFaseInicial, abrir, abiertoId, actualizar, nuevo, onImportar }: Props) {
  const def = HOJA_MAP[hoja];
  const cols = COLUMNAS[hoja];
  const [q, setQ] = useState('');
  const [fase, setFase] = useState<FaseId | null>(filtroFaseInicial);
  const [grupo, setGrupo] = useState<'todas' | TipoPublicacion>('todas');
  const [orden, setOrden] = useState<{ k: keyof Libro; asc: boolean } | null>(hoja === 'proyectos' ? { k: 'no', asc: true } : null);
  const [editando, setEditando] = useState<{ id: string; k: keyof Libro } | null>(null);
  const buscador = useRef<HTMLInputElement>(null);

  // Para la vista maestra, el filtro por fase debe mostrar todos los libros de esa fase
  const enHoja = useMemo(
    () =>
      libros.filter((l) => {
        if (grupo !== 'todas' && (l.tipoPublicacion ?? 'arbitrada') !== grupo) return false;
        return l.hojas[hoja] || (hoja === 'proyectos' && fase !== null && l.fase === fase);
      }),
    [libros, hoja, fase, grupo],
  );

  const filas = useMemo(() => {
    const nq = normalizar(q);
    let r = enHoja.filter((l) => {
      if (fase && l.fase !== fase) return false;
      if (!nq) return true;
      return normalizar(
        [
          l.titulo, l.autores, l.liderProyecto, l.conceptoPares, l.requerimiento,
          l.observacion, l.estado, l.etapa, l.isbn, l.cdp, l.proyecto,
          l.obsProceso, l.obsSalida, l.obsPendiente, l.responsable,
        ].join(' '),
      ).includes(nq);
    });
    if (orden) {
      const c = cols.find((x) => x.k === orden.k) ?? (C.no as Col);
      r = [...r].sort((a, b) => {
        const va = valorOrden(a, c);
        const vb = valorOrden(b, c);
        const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'es');
        return orden.asc ? cmp : -cmp;
      });
    }
    return r;
  }, [enHoja, q, fase, orden, cols]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === '/' && !(e.target as HTMLElement).closest('input,textarea,select')) {
        e.preventDefault();
        buscador.current?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const conteoFases = useMemo(() => {
    const m = new Map<FaseId, number>();
    for (const l of enHoja) m.set(l.fase, (m.get(l.fase) ?? 0) + 1);
    return m;
  }, [enHoja]);

  const total = filas.reduce((s, l) => s + (hoja === 'proyectos' ? costoTotal(l) : l.costo ?? 0), 0);

  const ordenar = (k: keyof Libro) =>
    setOrden((o) => (o?.k === k ? (o.asc ? { k, asc: false } : null) : { k, asc: true }));

  return (
    <div className="pagina hoja">
      <header className="cabecera">
        <div>
          <p className="sobretitulo">Hoja del libro de Excel</p>
          <h1>{def.nombre}</h1>
          <p className="cabecera-desc">{def.descripcion}</p>
        </div>
        <div className="cabecera-acciones">
          <button className="btn btn-primario" onClick={nuevo}>
            <Icono n="mas" /> Agregar libro
          </button>
        </div>
      </header>

      <div className="barra-herr">
        <label className="buscador">
          <Icono n="buscar" />
          <input ref={buscador} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar título, autor, líder, proyecto, ISBN…" />
          {!q && <kbd>/</kbd>}
        </label>
        <div className="filtros">
          <button className={`chip ${grupo === 'todas' ? 'activo' : ''}`} onClick={() => setGrupo('todas')}>
            Todas
          </button>
          <button className={`chip ${grupo === 'arbitrada' ? 'activo' : ''}`} onClick={() => setGrupo('arbitrada')}>
            Arbitradas
          </button>
          <button className={`chip ${grupo === 'no_arbitrada' ? 'activo' : ''}`} onClick={() => setGrupo('no_arbitrada')}>
            No arbitradas
          </button>
        </div>
        <div className="filtros">
          <button className={`chip ${fase === null ? 'activo' : ''}`} onClick={() => setFase(null)}>
            Todas <span>{enHoja.length}</span>
          </button>
          {FASES.filter((f) => conteoFases.get(f.id)).map((f) => (
            <button
              key={f.id}
              className={`chip ${fase === f.id ? 'activo' : ''}`}
              style={{ ['--c' as string]: f.color }}
              onClick={() => setFase(fase === f.id ? null : f.id)}
            >
              <i /> {f.corto} <span>{conteoFases.get(f.id)}</span>
            </button>
          ))}
        </div>
      </div>

      {enHoja.length === 0 ? (
        <div className="hoja-vacia">
          <p>Esta hoja todavía no tiene libros.</p>
          <div>
            <button className="btn" onClick={onImportar}>Cargar Excel</button>
            <button className="btn btn-primario" onClick={nuevo}>Agregar libro</button>
          </div>
        </div>
      ) : (
        <div className="tabla-marco">
          <table className="tabla">
            <colgroup>
              {cols.map((c) => (
                <col key={c.t} style={{ width: c.w }} />
              ))}
              <col style={{ width: 36 }} />
            </colgroup>
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.t} className={c.tipo === 'dinero' ? 'der' : ''} onClick={() => ordenar(c.k)}>
                    {c.t}
                    {orden?.k === c.k && <span className="orden">{orden.asc ? '↑' : '↓'}</span>}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {filas.map((l) => (
                <tr key={l.id} className={abiertoId === l.id ? 'sel' : ''}>
                  {cols.map((c) => (
                    <Celda
                      key={c.t}
                      c={c}
                      l={l}
                      hoja={hoja}
                      editando={editando?.id === l.id && editando.k === c.k}
                      onEditar={() => setEditando({ id: l.id, k: c.k })}
                      onFin={(v) => {
                        setEditando(null);
                        if (v !== undefined) actualizar(l.id, { [c.k]: v } as Partial<Libro>);
                      }}
                      abrir={() => abrir(l.id)}
                    />
                  ))}
                  <td className="td-abrir">
                    <button onClick={() => abrir(l.id)} title="Abrir ficha" aria-label="Abrir ficha">
                      <Icono n="flecha" size={14} />
                    </button>
                  </td>
                </tr>
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={cols.length + 1} className="sin-resultados">
                    Ningún libro coincide con la búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                {cols.map((c, i) => (
                  <td key={c.t} className={c.tipo === 'dinero' ? 'der mono' : ''}>
                    {i === 0 ? `${filas.length} libro${filas.length === 1 ? '' : 's'}` : c.tipo === 'dinero' ? fmtCOP(total) : ''}
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="ayuda">
        Doble clic sobre una celda para editarla · Enter guarda, Esc cancela · Clic en el título abre la ficha completa con el seguimiento.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface CeldaProps {
  c: Col;
  l: Libro;
  hoja: HojaId;
  editando: boolean;
  onEditar: () => void;
  onFin: (v?: unknown) => void;
  abrir: () => void;
}

function Celda({ c, l, hoja, editando, onEditar, onFin, abrir }: CeldaProps) {
  const v = l[c.k];
  const cls = [c.tipo === 'dinero' ? 'der mono' : '', c.tipo === 'anio' || c.tipo === 'numero' ? 'mono' : '', editando ? 'editando' : '']
    .filter(Boolean)
    .join(' ');

  if (editando) return <td className={cls}><Editor c={c} valor={v} onFin={onFin} /></td>;

  let contenido: ReactNode;
  switch (c.tipo) {
    case 'fase':
      contenido = <FaseTag fase={l.fase} corto />;
      break;
    case 'dinero': {
      if (c.k === 'costo' && hoja === 'proyectos' && l.costoAdicional) {
        contenido = (
          <span title={`${fmtCOP(l.costo)} + ${fmtCOP(l.costoAdicional)} (adicional)`}>
            {fmtCOP(l.costo)}
            <small className="adicional">+ {fmtCOP(l.costoAdicional)}</small>
          </span>
        );
      } else contenido = v == null ? <span className="muted">—</span> : fmtCOP(v as number);
      break;
    }
    case 'isbn':
      contenido = <IsbnCell isbn={l.isbn} />;
      break;
    case 'autores':
      contenido = l.autores ? <span title={l.autores}>{primerAutor(l.autores)}</span> : <span className="muted">—</span>;
      break;
    case 'fecha':
      contenido = v ? fmtFechaCorta(String(v)) : <span className="muted">—</span>;
      break;
    default:
      contenido = v === '' || v == null ? <span className="muted">—</span> : <span className="recorte">{String(v)}</span>;
  }

  if (c.k === 'titulo') {
    const [t1, ...resto] = l.titulo.split('\n');
    return (
      <td className="td-titulo" onDoubleClick={onEditar}>
        <button className="titulo-btn" onClick={abrir}>
          {t1 || <span className="muted">Sin título</span>}
        </button>
        {resto.length > 0 && <span className="titulo-sub">{resto.join(' ')}</span>}
        {hoja !== 'proyectos' && l.autores && <span className="titulo-sub">{primerAutor(l.autores)}</span>}
      </td>
    );
  }

  return (
    <td className={cls} onDoubleClick={c.edit ? onEditar : undefined}>
      {contenido}
    </td>
  );
}

function Editor({ c, valor, onFin }: { c: Col; valor: unknown; onFin: (v?: unknown) => void }) {
  const [v, setV] = useState(valor == null ? '' : String(valor));
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement & HTMLSelectElement>(null);
  useEffect(() => {
    ref.current?.focus();
    if (ref.current && 'select' in ref.current && c.tipo !== 'fase') ref.current.select();
  }, [c.tipo]);

  const convertir = (s: string): unknown => {
    if (c.tipo === 'dinero' || c.tipo === 'anio' || c.tipo === 'numero') {
      const n = Number(s.replace(/[^\d]/g, ''));
      return s.trim() === '' ? null : isFinite(n) ? n : null;
    }
    return s;
  };
  const guardar = () => {
    const nuevo = convertir(v);
    onFin(String(nuevo ?? '') === String(valor ?? '') ? undefined : nuevo);
  };
  const tecla = (e: KEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onFin();
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      guardar();
    }
  };

  if (c.tipo === 'fase')
    return (
      <select ref={ref} value={v} onChange={(e) => onFin(e.target.value)} onBlur={() => onFin()} onKeyDown={tecla}>
        {FASES.map((f) => (
          <option key={f.id} value={f.id}>{f.nombre}</option>
        ))}
      </select>
    );
  if (c.tipo === 'fecha')
    return <input ref={ref} type="date" value={v} onChange={(e) => setV(e.target.value)} onBlur={guardar} onKeyDown={tecla} />;
  if (c.tipo === 'largo' || c.tipo === 'autores' || c.tipo === 'isbn')
    return (
      <textarea
        ref={ref}
        value={v}
        rows={Math.min(6, Math.max(2, v.split('\n').length))}
        onChange={(e) => setV(e.target.value)}
        onBlur={guardar}
        onKeyDown={tecla}
      />
    );
  return (
    <input
      ref={ref}
      value={v}
      inputMode={c.tipo === 'texto' ? 'text' : 'numeric'}
      onChange={(e) => setV(e.target.value)}
      onBlur={guardar}
      onKeyDown={tecla}
    />
  );
}
