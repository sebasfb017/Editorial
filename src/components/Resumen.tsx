import { useMemo, useState, type FormEvent } from 'react';
import type { ComiteEditorial, FaseId, Libro, TipoPublicacion, Vista } from '../types';
import { FASES, FASE_MAP } from '../fases';
import { FaseTag, Icono } from './ui';
import { costoTotal, diasDesde, estadoISBN, fmtCOP, fmtCOPCorto, fmtFechaCorta, hace, parseFecha, tituloCorto, uid } from '../utils';

type CifraId = 'maestro' | 'inversion' | 'produccion' | 'isbn' | 'salen';

interface Props {
  libros: Libro[];
  comite: ComiteEditorial;
  actualizarComite: (c: Partial<ComiteEditorial>) => void;
  actualizarLibro: (id: string, c: Partial<Libro>) => void;
  notaLibro: (id: string, texto: string) => void;
  archivo: string | null;
  abrir: (id: string) => void;
  irA: (v: Vista, f?: FaseId | null) => void;
  onImportar: () => void;
  onNueva: () => void;
  onToast: (msg: string) => void;
}

function aniosDeLibro(l: Libro): number[] {
  const res = new Set<number>();
  if (l.anioDigital) res.add(l.anioDigital);
  if (l.anioFisico) res.add(l.anioFisico);
  if (l.fechaSalida) {
    const y = Number(l.fechaSalida.slice(0, 4));
    if (y > 2000) res.add(y);
  }
  if (l.hojas.salida) res.add(2026);
  if (l.hojas.pendientes && !res.size) res.add(2027);
  return [...res];
}

const EN_PRODUCCION: FaseId[] = ['estilo', 'diagramacion', 'revision_autor', 'impresion'];

interface Alerta {
  libro: Libro;
  motivo: string;
  peso: number;
}

function alertas(libros: Libro[]): (Alerta & { extra: number })[] {
  const out: Alerta[] = [];
  for (const l of libros) {
    if (l.fase === 'publicado' || l.fase === 'detenido') continue;
    const comp = parseFecha(l.fechaCompromiso);
    if (comp) {
      const d = -diasDesde(l.fechaCompromiso);
      if (d < 0) out.push({ libro: l, motivo: `Compromiso vencido hace ${-d} día${d === -1 ? '' : 's'}${l.proximaAccion ? ` · ${l.proximaAccion}` : ''}`, peso: 100 - d });
      else if (d <= 7) out.push({ libro: l, motivo: `Compromiso ${d === 0 ? 'hoy' : `en ${d} día${d === 1 ? '' : 's'}`}${l.proximaAccion ? ` · ${l.proximaAccion}` : ''}`, peso: 80 - d });
    }
    const sal = parseFecha(l.fechaSalida);
    if (sal) {
      const d = -diasDesde(l.fechaSalida);
      if (d >= -3 && d <= 21) out.push({ libro: l, motivo: `Sale el ${fmtFechaCorta(l.fechaSalida)} y sigue en ${FASE_MAP[l.fase].nombre.toLowerCase()}`, peso: 70 - d });
    }
    if (l.hojas.salida && estadoISBN(l.isbn) !== 'asignado') out.push({ libro: l, motivo: 'Programado para 2026 sin ISBN asignado', peso: 50 });
    if (l.fase === 'sin_info') out.push({ libro: l, motivo: 'No hay información del libro', peso: 30 });
    if (l.fase === 'cotizacion') out.push({ libro: l, motivo: 'Esperando cotización', peso: 25 });
    if (l.costo == null && l.fase !== 'sin_info' && l.fase !== 'cotizacion') out.push({ libro: l, motivo: 'Sin costo registrado', peso: 10 });
  }
  // Un libro, una línea: la alerta de mayor peso + contador
  const porLibro = new Map<string, Alerta & { extra: number }>();
  for (const a of out.sort((x, y) => y.peso - x.peso)) {
    const e = porLibro.get(a.libro.id);
    if (e) e.extra++;
    else porLibro.set(a.libro.id, { ...a, extra: 0 });
  }
  return [...porLibro.values()];
}

export function Resumen({ libros, comite, actualizarComite, actualizarLibro, notaLibro, archivo, abrir, irA, onImportar, onNueva, onToast }: Props) {
  const [cifraActiva, setCifraActiva] = useState<CifraId | null>(null);
  const [filtroIsbn, setFiltroIsbn] = useState<'faltan' | 'asignados'>('faltan');
  const [grupo, setGrupo] = useState<'todas' | TipoPublicacion>('todas');
  const [anioFiltro, setAnioFiltro] = useState<number | 'todos'>('todos');
  const [pNombre, setPNombre] = useState('');
  const [pRol, setPRol] = useState('');
  const [pCorreo, setPCorreo] = useState('');
  const hoy = new Date();

  const aniosDisponibles = useMemo(() => {
    const set = new Set<number>([2026]);
    for (const l of libros) aniosDeLibro(l).forEach((y) => set.add(y));
    return [...set].sort((a, b) => a - b);
  }, [libros]);

  const conteoGrupos = useMemo(() => {
    const baseAnio = anioFiltro === 'todos' ? libros : libros.filter((l) => aniosDeLibro(l).includes(anioFiltro));
    const arb = baseAnio.filter((l) => (l.tipoPublicacion ?? 'arbitrada') === 'arbitrada').length;
    const noArb = baseAnio.filter((l) => l.tipoPublicacion === 'no_arbitrada').length;
    return { todas: baseAnio.length, arbitadas: arb, noArbitradas: noArb };
  }, [libros, anioFiltro]);

  const librosFiltrados = useMemo(() => {
    return libros.filter((l) => {
      const t = l.tipoPublicacion ?? 'arbitrada';
      if (grupo !== 'todas' && t !== grupo) return false;
      if (anioFiltro !== 'todos' && !aniosDeLibro(l).includes(anioFiltro)) return false;
      return true;
    });
  }, [libros, grupo, anioFiltro]);

  const datos = useMemo(() => {
    const maestro = librosFiltrados.filter((l) => l.hojas.proyectos);
    const base = maestro.length ? maestro : librosFiltrados;
    const inversion = base.reduce((s, l) => s + costoTotal(l), 0);
    const conCosto = base.filter((l) => costoTotal(l) > 0);
    const sinCosto = base.filter((l) => costoTotal(l) === 0 && l.fase !== 'detenido');
    const produccion = librosFiltrados.filter((l) => EN_PRODUCCION.includes(l.fase));
    const conIsbnLista = librosFiltrados.filter((l) => estadoISBN(l.isbn) === 'asignado');
    const sinIsbnLista = librosFiltrados.filter((l) => estadoISBN(l.isbn) !== 'asignado');
    const conIsbn = conIsbnLista.length;
    const salen = librosFiltrados.filter((l) => l.hojas.salida);
    const enProcesoHoja = librosFiltrados.filter((l) => l.hojas.proceso).length;
    const enPendientesHoja = librosFiltrados.filter((l) => l.hojas.pendientes).length;
    const paraComite = librosFiltrados.filter((l) => l.fase === 'evaluacion' || l.fase === 'aprobado' || Boolean(l.conceptoPares?.trim()));
    const porFase = FASES.map((f) => {
      const ls = librosFiltrados.filter((l) => l.fase === f.id);
      return { f, n: ls.length, valor: ls.reduce((s, l) => s + costoTotal(l), 0), ls };
    });
    const porCdp = new Map<string, { n: number; valor: number }>();
    for (const l of base) {
      const k = l.cdp ? (/^\d+$/.test(l.cdp) ? `CDP ${l.cdp}` : l.cdp) : 'Sin CDP';
      const e = porCdp.get(k) ?? { n: 0, valor: 0 };
      e.n++;
      e.valor += costoTotal(l);
      porCdp.set(k, e);
    }
    const anios = new Map<number, { digital: Libro[]; fisico: Libro[] }>();
    for (const l of librosFiltrados) {
      if (l.anioDigital) {
        const e = anios.get(l.anioDigital) ?? { digital: [], fisico: [] };
        e.digital.push(l);
        anios.set(l.anioDigital, e);
      }
      if (l.anioFisico) {
        const e = anios.get(l.anioFisico) ?? { digital: [], fisico: [] };
        e.fisico.push(l);
        anios.set(l.anioFisico, e);
      }
    }
    const recientes = librosFiltrados
      .flatMap((l) => l.seguimiento.map((n) => ({ l, n })))
      .sort((a, b) => b.n.fecha.localeCompare(a.n.fecha))
      .slice(0, 7);
    return {
      base, inversion, conCosto, sinCosto, produccion, conIsbn, conIsbnLista, sinIsbnLista, salen,
      enProcesoHoja, enPendientesHoja, paraComite, porFase,
      porCdp: [...porCdp.entries()].sort((a, b) => b[1].valor - a[1].valor),
      anios: [...anios.entries()].sort((a, b) => a[0] - b[0]),
      recientes,
      alertas: alertas(librosFiltrados),
    };
  }, [librosFiltrados]);

  const agregarParticipante = (e: FormEvent) => {
    e.preventDefault();
    if (!pNombre.trim()) return;
    actualizarComite({
      participantes: [
        ...comite.participantes,
        { id: uid(), nombre: pNombre.trim(), rol: pRol.trim() || 'Miembro del comité', correo: pCorreo.trim() },
      ],
    });
    setPNombre('');
    setPRol('');
    setPCorreo('');
  };

  const quitarParticipante = (id: string) => {
    actualizarComite({ participantes: comite.participantes.filter((p) => p.id !== id) });
  };

  const decisionComite = (l: Libro, fase: FaseId, texto: string) => {
    actualizarLibro(l.id, { fase });
    notaLibro(l.id, texto);
    onToast(`${tituloCorto(l.titulo)}: ${texto}`);
  };

  const copiarOrdenDelDia = () => {
    const lineas = [
      `COMITÉ EDITORIAL${comite.proximaSesion ? ` · Sesión ${comite.proximaSesion}` : ''}`,
      comite.lugarOEnlace ? `Lugar / enlace: ${comite.lugarOEnlace}` : '',
      comite.participantes.length ? `Participantes: ${comite.participantes.map((p) => `${p.nombre} (${p.rol})`).join(', ')}` : '',
      comite.notasComite ? `Orden del día:\n${comite.notasComite}` : '',
      `\nTítulos para revisión (${datos.paraComite.length}):`,
      ...datos.paraComite.map((l, i) => `${i + 1}. ${tituloCorto(l.titulo)} [${FASE_MAP[l.fase].nombre}]${l.conceptoPares ? ` — Pares: ${l.conceptoPares}` : ''}`),
    ].filter(Boolean);
    navigator.clipboard?.writeText(lineas.join('\n')).then(() => onToast('Orden del día copiado al portapapeles.'));
  };

  const fecha = hoy.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (!libros.length) {
    return (
      <div className="vacio">
        <div className="vacio-caja">
          <p className="sobretitulo">Primeros pasos</p>
          <h1>Aún no hay libros registrados</h1>
          <p>
            Carga el archivo <em>Seguimiento Proyectos.xlsx</em>. Cada hoja del Excel se convierte en una pestaña del
            menú, y los libros que se repiten entre hojas quedan unidos en una sola ficha, así un cambio se refleja en
            todas partes.
          </p>
          <button className="btn btn-primario" onClick={onImportar}>
            <Icono n="subir" /> Cargar Excel
          </button>
          <p className="nota-pie">También puedes arrastrar el archivo a cualquier parte de esta ventana.</p>
        </div>
      </div>
    );
  }

  const maxFase = Math.max(1, ...datos.porFase.map((p) => p.n));
  const maxCdp = Math.max(1, ...datos.porCdp.map(([, v]) => v.valor));
  const total = librosFiltrados.length;
  const pctIsbn = total ? Math.round((datos.conIsbn / total) * 100) : 0;
  const toggleCifra = (id: CifraId) => setCifraActiva((c) => (c === id ? null : id));

  return (
    <div className="pagina resumen">
      <header className="cabecera">
        <div>
          <p className="sobretitulo">{fecha}</p>
          <h1>Estado del fondo editorial</h1>
        </div>
        <div className="cabecera-acciones">
          {archivo && <p className="cabecera-nota">Datos de <strong>{archivo}</strong> y los cambios hechos aquí.</p>}
          <button className="btn btn-primario" onClick={onNueva}>
            <Icono n="mas" /> Nueva publicación
          </button>
        </div>
      </header>

      <section className="barra-contexto" aria-label="Agrupación de publicaciones y año de trabajo">
        <div className="grupo-tabs" role="tablist" aria-label="Tipo de publicación">
          <button
            role="tab"
            aria-selected={grupo === 'todas'}
            className={`grupo-tab ${grupo === 'todas' ? 'activo' : ''}`}
            onClick={() => setGrupo('todas')}
          >
            Todas <span>{conteoGrupos.todas}</span>
          </button>
          <button
            role="tab"
            aria-selected={grupo === 'arbitrada'}
            className={`grupo-tab ${grupo === 'arbitrada' ? 'activo' : ''}`}
            onClick={() => setGrupo('arbitrada')}
          >
            Publicaciones arbitradas <small>Revistas · Libros</small> <span>{conteoGrupos.arbitadas}</span>
          </button>
          <button
            role="tab"
            aria-selected={grupo === 'no_arbitrada'}
            className={`grupo-tab ${grupo === 'no_arbitrada' ? 'activo' : ''}`}
            onClick={() => setGrupo('no_arbitrada')}
          >
            Publicaciones no arbitradas <small>Cartillas · Memorias</small> <span>{conteoGrupos.noArbitradas}</span>
          </button>
        </div>
        <label className="anio-selector">
          <span>Año en trabajo:</span>
          <select
            value={anioFiltro === 'todos' ? 'todos' : String(anioFiltro)}
            onChange={(e) => setAnioFiltro(e.target.value === 'todos' ? 'todos' : Number(e.target.value))}
          >
            <option value="todos">Todos los años</option>
            {aniosDisponibles.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
      </section>

      <section className="cifras" aria-label="Indicadores principales">
        <button type="button" className={`cifra ${cifraActiva === 'maestro' ? 'activo' : ''}`} onClick={() => toggleCifra('maestro')} aria-expanded={cifraActiva === 'maestro'}>
          <span className="cifra-num">{datos.base.length}</span>
          <span className="cifra-txt">títulos en el registro maestro</span>
          <span className="cifra-accion">{cifraActiva === 'maestro' ? 'Ocultar detalle ▴' : 'Ver hojas y distribución ▾'}</span>
        </button>
        <button type="button" className={`cifra ${cifraActiva === 'inversion' ? 'activo' : ''}`} onClick={() => toggleCifra('inversion')} aria-expanded={cifraActiva === 'inversion'}>
          <span className="cifra-num">{fmtCOPCorto(datos.inversion)}</span>
          <span className="cifra-txt">inversión comprometida</span>
          <span className="cifra-det">{fmtCOP(datos.inversion)}</span>
          <span className="cifra-accion">{cifraActiva === 'inversion' ? 'Ocultar detalle ▴' : 'Desglose por CDP y costos ▾'}</span>
        </button>
        <button type="button" className={`cifra ${cifraActiva === 'produccion' ? 'activo' : ''}`} onClick={() => toggleCifra('produccion')} aria-expanded={cifraActiva === 'produccion'}>
          <span className="cifra-num">{datos.produccion.length}</span>
          <span className="cifra-txt">en producción editorial</span>
          <span className="cifra-det">estilo, diagramación, revisión o impresión</span>
          <span className="cifra-accion">{cifraActiva === 'produccion' ? 'Ocultar detalle ▴' : 'Explorar títulos en curso ▾'}</span>
        </button>
        <button type="button" className={`cifra ${cifraActiva === 'isbn' ? 'activo' : ''}`} onClick={() => toggleCifra('isbn')} aria-expanded={cifraActiva === 'isbn'}>
          <span className="cifra-num">
            {datos.conIsbn}
            <small> / {total}</small>
          </span>
          <span className="cifra-txt">con ISBN asignado ({pctIsbn}%)</span>
          <span className="cifra-barra"><span style={{ width: `${pctIsbn}%` }} /></span>
          <span className="cifra-accion">{cifraActiva === 'isbn' ? 'Ocultar detalle ▴' : 'Ver pendientes y asignados ▾'}</span>
        </button>
        <button type="button" className={`cifra ${cifraActiva === 'salen' ? 'activo' : ''}`} onClick={() => toggleCifra('salen')} aria-expanded={cifraActiva === 'salen'}>
          <span className="cifra-num">{datos.salen.length}</span>
          <span className="cifra-txt">salen en 2026</span>
          <span className="cifra-det">{fmtCOP(datos.salen.reduce((s, l) => s + (l.costo ?? 0), 0))}</span>
          <span className="cifra-accion">{cifraActiva === 'salen' ? 'Ocultar detalle ▴' : 'Revisar salidas 2026 ▾'}</span>
        </button>
      </section>

      {cifraActiva && (
        <section className="panel cifra-detalle">
          {cifraActiva === 'maestro' && (
            <>
              <div className="panel-cab">
                <div>
                  <h2>Distribución del registro maestro ({datos.base.length} títulos)</h2>
                  <p className="panel-nota">Un mismo libro puede aparecer en varias hojas del Excel y aquí se mantiene unido en una sola ficha.</p>
                </div>
                <div className="cifra-detalle-acciones">
                  <button className="btn btn-peq btn-primario" onClick={() => irA('proyectos')}>Abrir Proyectos 2026-2</button>
                  <button className="icono-btn" onClick={() => setCifraActiva(null)} aria-label="Cerrar detalle"><Icono n="cerrar" size={15} /></button>
                </div>
              </div>
              <div className="cifra-hojas">
                <button className="cifra-hoja-card" onClick={() => irA('proyectos')}>
                  <strong>{datos.base.length}</strong>
                  <span>Proyectos 2026-2</span>
                  <small>Registro maestro completo</small>
                </button>
                <button className="cifra-hoja-card" onClick={() => irA('proceso')}>
                  <strong>{datos.enProcesoHoja}</strong>
                  <span>Proceso de libros</span>
                  <small>Seguimiento editorial activo</small>
                </button>
                <button className="cifra-hoja-card" onClick={() => irA('salida')}>
                  <strong>{datos.salen.length}</strong>
                  <span>Salen en 2026</span>
                  <small>Programados para este año</small>
                </button>
                <button className="cifra-hoja-card" onClick={() => irA('pendientes')}>
                  <strong>{datos.enPendientesHoja}</strong>
                  <span>Pendientes 2027+</span>
                  <small>Próximas vigencias</small>
                </button>
              </div>
            </>
          )}

          {cifraActiva === 'inversion' && (
            <>
              <div className="panel-cab">
                <div>
                  <h2>Desglose de inversión comprometida</h2>
                  <p className="panel-nota">
                    {datos.conCosto.length} títulos con costo registrado
                    {datos.conCosto.length ? ` (promedio ${fmtCOPCorto(datos.inversion / datos.conCosto.length)} por título)` : ''}
                    {datos.sinCosto.length ? ` · ${datos.sinCosto.length} activos sin costo aún` : ''}.
                  </p>
                </div>
                <button className="icono-btn" onClick={() => setCifraActiva(null)} aria-label="Cerrar detalle"><Icono n="cerrar" size={15} /></button>
              </div>
              <div className="cifra-cols">
                <div>
                  <p className="cifra-sub">Por CDP</p>
                  <div className="cdp-lista">
                    {datos.porCdp.map(([k, v]) => (
                      <div key={k} className="cdp-fila">
                        <div className="cdp-top">
                          <span>{k} ({v.n})</span>
                          <span className="mono">{fmtCOP(v.valor)}</span>
                        </div>
                        <div className="cdp-barra"><span style={{ width: `${(v.valor / maxCdp) * 100}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="cifra-sub">Títulos sin costo registrado ({datos.sinCosto.length})</p>
                  {datos.sinCosto.length === 0 ? (
                    <p className="muted pequeno">Todos los títulos activos tienen costo registrado.</p>
                  ) : (
                    <ul className="cifra-lista">
                      {datos.sinCosto.map((l) => (
                        <li key={l.id}>
                          <button onClick={() => abrir(l.id)}>
                            <span className="cifra-lista-tit">{tituloCorto(l.titulo)}</span>
                            <FaseTag fase={l.fase} corto />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </>
          )}

          {cifraActiva === 'produccion' && (
            <>
              <div className="panel-cab">
                <div>
                  <h2>Títulos en producción editorial ({datos.produccion.length})</h2>
                  <p className="panel-nota">Haz clic en cualquier título para abrir su ficha y actualizar su etapa o notas.</p>
                </div>
                <div className="cifra-detalle-acciones">
                  <button className="btn btn-peq btn-primario" onClick={() => irA('proceso')}>Ir a Proceso de libros</button>
                  <button className="icono-btn" onClick={() => setCifraActiva(null)} aria-label="Cerrar detalle"><Icono n="cerrar" size={15} /></button>
                </div>
              </div>
              <div className="produccion">
                {datos.produccion.map((l) => (
                  <button key={l.id} className="prod-item" onClick={() => abrir(l.id)}>
                    <FaseTag fase={l.fase} corto />
                    <span className="prod-titulo">{tituloCorto(l.titulo)}</span>
                    <span className="prod-etapa">{l.etapa || l.estado || '—'}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {cifraActiva === 'isbn' && (
            <>
              <div className="panel-cab">
                <div>
                  <h2>Estado de ISBN ({datos.conIsbn} de {total} · {pctIsbn}%)</h2>
                  <p className="panel-nota">Selecciona un título para registrar o revisar su ISBN directamente en la ficha.</p>
                </div>
                <div className="cifra-detalle-acciones">
                  <div className="filtros">
                    <button className={`chip ${filtroIsbn === 'faltan' ? 'activo' : ''}`} onClick={() => setFiltroIsbn('faltan')}>
                      Faltan <span>{datos.sinIsbnLista.length}</span>
                    </button>
                    <button className={`chip ${filtroIsbn === 'asignados' ? 'activo' : ''}`} onClick={() => setFiltroIsbn('asignados')}>
                      Asignados <span>{datos.conIsbnLista.length}</span>
                    </button>
                  </div>
                  <button className="icono-btn" onClick={() => setCifraActiva(null)} aria-label="Cerrar detalle"><Icono n="cerrar" size={15} /></button>
                </div>
              </div>
              <ul className="cifra-lista cifra-lista-cols">
                {(filtroIsbn === 'faltan' ? datos.sinIsbnLista : datos.conIsbnLista).map((l) => (
                  <li key={l.id}>
                    <button onClick={() => abrir(l.id)}>
                      <span className="cifra-lista-tit">{tituloCorto(l.titulo)}</span>
                      <span className="mono muted">{filtroIsbn === 'asignados' ? l.isbn : (estadoISBN(l.isbn) === 'tramite' ? 'En trámite' : 'Sin ISBN')}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {cifraActiva === 'salen' && (
            <>
              <div className="panel-cab">
                <div>
                  <h2>Títulos que salen en 2026 ({datos.salen.length})</h2>
                  <p className="panel-nota">Inversión en esta hoja: {fmtCOP(datos.salen.reduce((s, l) => s + (l.costo ?? 0), 0))}. Haz clic en un libro para editarlo.</p>
                </div>
                <div className="cifra-detalle-acciones">
                  <button className="btn btn-peq btn-primario" onClick={() => irA('salida')}>Abrir Salen en 2026</button>
                  <button className="icono-btn" onClick={() => setCifraActiva(null)} aria-label="Cerrar detalle"><Icono n="cerrar" size={15} /></button>
                </div>
              </div>
              <ul className="cifra-lista cifra-lista-cols">
                {datos.salen.map((l) => (
                  <li key={l.id}>
                    <button onClick={() => abrir(l.id)}>
                      <span className="cifra-lista-tit">{tituloCorto(l.titulo)}</span>
                      <span className="cifra-lista-meta">
                        <FaseTag fase={l.fase} corto />
                        {l.fechaSalida && <span className="mono muted">{fmtFechaCorta(l.fechaSalida)}</span>}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}

      <div className="rejilla">
        <section className="panel panel-ancho">
          <div className="panel-cab">
            <h2>Dónde está cada libro</h2>
            <span className="panel-nota">Recorrido editorial · clic en una fase para ver el listado</span>
          </div>
          <div className="barra-fases" aria-hidden>
            {datos.porFase.filter((p) => p.n).map((p) => (
              <span key={p.f.id} style={{ flexGrow: p.n, background: p.f.color }} title={`${p.f.nombre}: ${p.n}`} />
            ))}
          </div>
          <div className="fases-lista">
            {datos.porFase.map((p) => (
              <button key={p.f.id} className={`fase-fila ${p.n ? '' : 'cero'}`} onClick={() => p.n && irA('proyectos', p.f.id)}>
                <span className="fase-nombre">
                  <i style={{ background: p.f.color }} />
                  {p.f.nombre}
                </span>
                <span className="fase-barra">
                  <span style={{ width: `${(p.n / maxFase) * 100}%`, background: p.f.color }} />
                </span>
                <span className="fase-n">{p.n}</span>
                <span className="fase-valor">{p.valor ? fmtCOPCorto(p.valor) : '—'}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-cab">
            <h2>Requiere atención</h2>
            <span className="panel-nota">{datos.alertas.length} libros</span>
          </div>
          {datos.alertas.length === 0 ? (
            <p className="muted">Nada pendiente por ahora.</p>
          ) : (
            <ul className="alertas">
              {datos.alertas.slice(0, 9).map((a) => (
                <li key={a.libro.id}>
                  <button onClick={() => abrir(a.libro.id)}>
                    <span className="alerta-titulo">{tituloCorto(a.libro.titulo)}</span>
                    <span className="alerta-motivo">
                      {a.motivo}
                      {a.extra > 0 && <em> · +{a.extra} más</em>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <div className="panel-cab">
            <h2>Calendario de publicación</h2>
            <span className="panel-nota">según observaciones de salida</span>
          </div>
          {datos.anios.length === 0 ? (
            <p className="muted">Sin años de publicación registrados.</p>
          ) : (
            <div className="calendario">
              {datos.anios.map(([anio, v]) => (
                <div key={anio} className="cal-anio">
                  <div className="cal-cab">
                    <span className="cal-num">{anio}</span>
                    <span className="muted">
                      {v.digital.length} digital · {v.fisico.length} físico
                    </span>
                  </div>
                  <ul>
                    {[...new Set([...v.digital, ...v.fisico])].map((l) => (
                      <li key={l.id}>
                        <button onClick={() => abrir(l.id)}>
                          <span className="cal-formato">
                            {v.digital.includes(l) && <b title="Digital">D</b>}
                            {v.fisico.includes(l) && <b title="Físico">F</b>}
                          </span>
                          {tituloCorto(l.titulo)}
                          {l.fechaSalida && l.fechaSalida.startsWith(String(anio)) && (
                            <span className="cal-fecha">{fmtFechaCorta(l.fechaSalida)}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-cab">
            <h2>Inversión por CDP</h2>
            <span className="panel-nota">registro maestro</span>
          </div>
          <div className="cdp-lista">
            {datos.porCdp.map(([k, v]) => (
              <div key={k} className="cdp-fila">
                <div className="cdp-top">
                  <span>{k}</span>
                  <span className="mono">{fmtCOP(v.valor)}</span>
                </div>
                <div className="cdp-barra">
                  <span style={{ width: `${(v.valor / maxCdp) * 100}%` }} />
                </div>
                <div className="muted pequeno">{v.n} título{v.n === 1 ? '' : 's'}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel panel-ancho">
          <div className="panel-cab">
            <h2>Comité editorial</h2>
            <div className="cifra-detalle-acciones">
              <span className="panel-nota">
                {comite.participantes.length} participante{comite.participantes.length === 1 ? '' : 's'} · {datos.paraComite.length} para revisión
              </span>
              <button type="button" className="btn btn-peq" onClick={copiarOrdenDelDia}>
                Copiar orden del día
              </button>
            </div>
          </div>
          <div className="comite-grid">
            <div className="comite-agenda">
              <div className="campos dos">
                <label className="campo">
                  <span className="campo-et">Próxima sesión</span>
                  <input
                    type="date"
                    value={comite.proximaSesion}
                    onChange={(e) => actualizarComite({ proximaSesion: e.target.value })}
                  />
                </label>
                <label className="campo">
                  <span className="campo-et">Lugar o enlace</span>
                  <input
                    type="text"
                    value={comite.lugarOEnlace}
                    placeholder="Sala de juntas / Meet"
                    onChange={(e) => actualizarComite({ lugarOEnlace: e.target.value })}
                  />
                </label>
              </div>
              <label className="campo">
                <span className="campo-et">Acuerdos u orden del día</span>
                <textarea
                  rows={2}
                  value={comite.notasComite}
                  placeholder="Puntos a tratar en la próxima sesión del comité editorial…"
                  onChange={(e) => actualizarComite({ notasComite: e.target.value })}
                />
              </label>
            </div>

            <div className="comite-miembros">
              <p className="cifra-sub">Participantes del comité</p>
              <form className="comite-form" onSubmit={agregarParticipante}>
                <input
                  type="text"
                  value={pNombre}
                  onChange={(e) => setPNombre(e.target.value)}
                  placeholder="Nombre del docente / miembro"
                />
                <input
                  type="text"
                  value={pRol}
                  onChange={(e) => setPRol(e.target.value)}
                  placeholder="Rol (ej. Decano, Par)"
                />
                <input
                  type="email"
                  value={pCorreo}
                  onChange={(e) => setPCorreo(e.target.value)}
                  placeholder="Correo (opcional)"
                />
                <button type="submit" className="btn btn-peq btn-primario" disabled={!pNombre.trim()}>
                  <Icono n="mas" size={14} /> Agregar
                </button>
              </form>
              {comite.participantes.length === 0 ? (
                <p className="muted pequeno">Aún no hay participantes registrados en el comité.</p>
              ) : (
                <ul className="comite-lista">
                  {comite.participantes.map((p) => (
                    <li key={p.id}>
                      <div>
                        <strong>{p.nombre}</strong>
                        <span>{p.rol}{p.correo ? ` · ${p.correo}` : ''}</span>
                      </div>
                      <button
                        type="button"
                        className="icono-btn"
                        onClick={() => quitarParticipante(p.id)}
                        aria-label={`Quitar a ${p.nombre}`}
                        title="Quitar participante"
                      >
                        <Icono n="cerrar" size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="comite-revision">
            <p className="cifra-sub">Títulos conectados para revisión del comité ({datos.paraComite.length})</p>
            {datos.paraComite.length === 0 ? (
              <p className="muted pequeno">No hay publicaciones en evaluación, aprobadas o con concepto de pares en este filtro.</p>
            ) : (
              <ul className="comite-libros">
                {datos.paraComite.slice(0, 8).map((l) => (
                  <li key={l.id}>
                    <div className="comite-libro-info">
                      <button type="button" className="titulo-btn" onClick={() => abrir(l.id)}>
                        {tituloCorto(l.titulo)}
                      </button>
                      <span className="pequeno muted">
                        {l.tipoPublicacion === 'no_arbitrada' ? 'No arbitrada' : 'Arbitrada'}
                        {l.conceptoPares ? ` · Pares: ${l.conceptoPares}` : ''}
                      </span>
                    </div>
                    <div className="comite-libro-acc">
                      <FaseTag fase={l.fase} corto />
                      {l.fase !== 'aprobado' && (
                        <button
                          type="button"
                          className="btn btn-peq btn-primario"
                          onClick={() => decisionComite(l, 'aprobado', 'Aprobado en Comité Editorial.')}
                        >
                          Aprobar
                        </button>
                      )}
                      {l.fase !== 'detenido' && (
                        <button
                          type="button"
                          className="btn btn-peq"
                          onClick={() => decisionComite(l, 'detenido', 'No aprobado / detenido en Comité Editorial.')}
                        >
                          Detener
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section className="panel">
          <div className="panel-cab">
            <h2>Últimos movimientos</h2>
            <button className="enlace" onClick={() => irA('bitacora')}>Ver bitácora</button>
          </div>
          <ul className="movimientos">
            {datos.recientes.map(({ l, n }) => (
              <li key={n.id}>
                <button onClick={() => abrir(l.id)}>
                  <span className="mov-cuando">{hace(n.fecha)}</span>
                  <span className="mov-titulo">{tituloCorto(l.titulo)}</span>
                  <span className="mov-texto">{n.texto}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel panel-ancho">
          <div className="panel-cab">
            <h2>En producción ahora</h2>
            <span className="panel-nota">{datos.produccion.length} títulos</span>
          </div>
          <div className="produccion">
            {datos.produccion.map((l) => (
              <button key={l.id} className="prod-item" onClick={() => abrir(l.id)}>
                <FaseTag fase={l.fase} corto />
                <span className="prod-titulo">{tituloCorto(l.titulo)}</span>
                <span className="prod-etapa">{l.etapa || l.estado || '—'}</span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
