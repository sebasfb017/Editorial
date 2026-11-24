/**
 * Vista de Bitácora global:
 * - Muestra cronológicamente (agrupado por día) todas las notas manuales, cambios de fase/campos y eventos del sistema.
 * - Permite filtrar por tipo o buscar, y registrar notas rápidas asociadas a cualquier publicación.
 */
import { useMemo, useState } from 'react';
import type { Libro, TipoNota } from '../types';
import { hoyISO, normalizar, tituloCorto } from '../utils';
import { Icono } from './ui';

interface Props {
  libros: Libro[];
  abrir: (id: string) => void;
  nota: (id: string, texto: string, fecha?: string) => void;
}

const TIPOS: { id: TipoNota | 'todas'; t: string }[] = [
  { id: 'todas', t: 'Todo' },
  { id: 'nota', t: 'Notas' },
  { id: 'cambio', t: 'Cambios' },
  { id: 'sistema', t: 'Importaciones' },
];

export function Bitacora({ libros, abrir, nota }: Props) {
  const [tipo, setTipo] = useState<TipoNota | 'todas'>('todas');
  const [q, setQ] = useState('');
  const [libroId, setLibroId] = useState('');
  const [texto, setTexto] = useState('');
  const [fecha, setFecha] = useState(hoyISO());

  const grupos = useMemo(() => {
    const nq = normalizar(q);
    const items = libros
      .flatMap((l) => l.seguimiento.map((n) => ({ l, n })))
      .filter(({ l, n }) => (tipo === 'todas' || n.tipo === tipo) && (!nq || normalizar(n.texto + ' ' + l.titulo).includes(nq)))
      .sort((a, b) => b.n.fecha.localeCompare(a.n.fecha));
    const m = new Map<string, typeof items>();
    for (const it of items) {
      const d = new Date(it.n.fecha);
      const k = d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      m.set(k, [...(m.get(k) ?? []), it]);
    }
    return [...m.entries()];
  }, [libros, tipo, q]);

  const ordenados = useMemo(() => [...libros].sort((a, b) => a.titulo.localeCompare(b.titulo, 'es')), [libros]);

  const guardar = () => {
    if (!libroId || !texto.trim()) return;
    nota(libroId, texto.trim(), fecha === hoyISO() ? new Date().toISOString() : new Date(fecha + 'T12:00:00').toISOString());
    setTexto('');
  };

  return (
    <div className="pagina bitacora">
      <header className="cabecera">
        <div>
          <p className="sobretitulo">Seguimiento</p>
          <h1>Bitácora</h1>
          <p className="cabecera-desc">Todo lo que ha pasado con cada libro: notas, cambios de fase y actualizaciones desde Excel.</p>
        </div>
      </header>

      <div className="panel nota-rapida">
        <select value={libroId} onChange={(e) => setLibroId(e.target.value)}>
          <option value="">Elige un libro…</option>
          {ordenados.map((l) => (
            <option key={l.id} value={l.id}>{tituloCorto(l.titulo).slice(0, 90)}</option>
          ))}
        </select>
        <input value={texto} onChange={(e) => setTexto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && guardar()} placeholder="Escribe la novedad y presiona Enter" />
        <input type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} />
        <button className="btn btn-primario" onClick={guardar} disabled={!libroId || !texto.trim()}>Anotar</button>
      </div>

      <div className="barra-herr">
        <label className="buscador">
          <Icono n="buscar" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la bitácora…" />
        </label>
        <div className="filtros">
          {TIPOS.map((t) => (
            <button key={t.id} className={`chip ${tipo === t.id ? 'activo' : ''}`} onClick={() => setTipo(t.id)}>{t.t}</button>
          ))}
        </div>
      </div>

      {grupos.length === 0 && <p className="muted">No hay movimientos con esos filtros.</p>}
      {grupos.map(([dia, items]) => (
        <section key={dia} className="dia">
          <h2 className="dia-cab">{dia}</h2>
          <ul>
            {items.map(({ l, n }) => (
              <li key={n.id} className={`bit-item ${n.tipo}`}>
                <span className="bit-hora">{new Date(n.fecha).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                <div>
                  <button className="bit-libro" onClick={() => abrir(l.id)}>{tituloCorto(l.titulo)}</button>
                  <p>{n.texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
