import { useEffect, useRef, useState } from 'react';
import type { EstadoPar, HojaId, Libro, ParEvaluador, PlantillaCorreo, SubtipoPublicacion, TipoPublicacion } from '../types';
import { FASES } from '../fases';
import { HOJAS } from '../excel/importar';
import { fechaMasDias, renderPlantillaCorreo } from '../correo';
import { Icono } from './ui';
import { costoTotal, estadoISBN, fmtCOP, fmtFecha, fmtFechaCorta, hace, hoyISO, uid } from '../utils';

interface Props {
  libro: Libro;
  plantillaCorreo: PlantillaCorreo;
  enviarCorreo: (p: { para: string; cc?: string; asunto: string; cuerpo: string }) => Promise<string>;
  onToast: (msg: string) => void;
  cerrar: () => void;
  actualizar: (c: Partial<Libro>) => void;
  nota: (texto: string, fecha?: string) => void;
  borrarNota: (id: string) => void;
  eliminar: () => void;
}

/** Campo que guarda al salir (blur), para no registrar cada tecla en la bitácora */
function Campo({
  etiqueta, valor, onGuardar, tipo = 'texto', placeholder, filas,
}: {
  etiqueta: string;
  valor: string | number | null;
  onGuardar: (v: string) => void;
  tipo?: 'texto' | 'largo' | 'numero' | 'fecha';
  placeholder?: string;
  filas?: number;
}) {
  const [v, setV] = useState(valor == null ? '' : String(valor));
  useEffect(() => setV(valor == null ? '' : String(valor)), [valor]);
  const guardar = () => {
    if (v !== (valor == null ? '' : String(valor))) onGuardar(v);
  };
  return (
    <label className="campo">
      <span className="campo-et">{etiqueta}</span>
      {tipo === 'largo' ? (
        <textarea value={v} rows={filas ?? Math.min(7, Math.max(2, v.split('\n').length + 1))} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={guardar} />
      ) : (
        <input
          type={tipo === 'fecha' ? 'date' : 'text'}
          inputMode={tipo === 'numero' ? 'numeric' : undefined}
          value={tipo === 'numero' && v ? Number(v.replace(/\D/g, '') || 0).toLocaleString('es-CO') : v}
          placeholder={placeholder}
          onChange={(e) => setV(tipo === 'numero' ? e.target.value.replace(/\D/g, '') : e.target.value)}
          onBlur={guardar}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      )}
    </label>
  );
}

const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\D/g, '')) || null);

export function Ficha({ libro: l, plantillaCorreo, enviarCorreo, onToast, cerrar, actualizar, nota, borrarNota, eliminar }: Props) {
  const [texto, setTexto] = useState('');
  const [fechaNota, setFechaNota] = useState(hoyISO());
  const [confirmar, setConfirmar] = useState(false);
  const [parNombre, setParNombre] = useState('');
  const [parCorreo, setParCorreo] = useState('');
  const [parLimite, setParLimite] = useState(() => fechaMasDias(plantillaCorreo.diasPlazo));
  const [enviandoPar, setEnviandoPar] = useState<string | null>(null);
  const tituloRef = useRef<HTMLTextAreaElement>(null);
  const [titulo, setTitulo] = useState(l.titulo);
  useEffect(() => setTitulo(l.titulo), [l.titulo]);
  useEffect(() => {
    if (!l.titulo) tituloRef.current?.focus();
  }, [l.titulo]);

  const idxFase = FASES.findIndex((f) => f.id === l.fase);
  const notas = [...l.seguimiento].sort((a, b) => b.fecha.localeCompare(a.fecha));

  const agregarNota = () => {
    if (!texto.trim()) return;
    const ahora = new Date();
    const fecha = fechaNota === hoyISO() ? ahora.toISOString() : new Date(fechaNota + 'T12:00:00').toISOString();
    nota(texto.trim(), fecha);
    setTexto('');
    setFechaNota(hoyISO());
  };

  return (
    <>
      <div className="velo" onClick={cerrar} />
      <aside className="ficha" role="dialog" aria-label="Ficha del libro">
        <div className="ficha-cab">
          <span className="sobretitulo">Ficha N.º {l.no ?? '—'} · actualizado {hace(l.actualizado)}</span>
          <button className="icono-btn" onClick={cerrar} aria-label="Cerrar">
            <Icono n="cerrar" />
          </button>
        </div>

        <textarea
          ref={tituloRef}
          className="ficha-titulo"
          value={titulo}
          placeholder="Título del libro"
          rows={Math.max(1, Math.ceil(titulo.length / 42))}
          onChange={(e) => setTitulo(e.target.value)}
          onBlur={() => titulo !== l.titulo && actualizar({ titulo })}
        />

        <div className="recorrido" role="radiogroup" aria-label="Fase editorial">
          {FASES.filter((f) => f.id !== 'detenido').map((f, i) => (
            <button
              key={f.id}
              role="radio"
              aria-checked={l.fase === f.id}
              className={`paso ${i < idxFase && l.fase !== 'detenido' ? 'hecho' : ''} ${l.fase === f.id ? 'actual' : ''}`}
              style={{ ['--c' as string]: f.color }}
              onClick={() => actualizar({ fase: f.id })}
              title={f.nombre}
            >
              <span className="paso-punto" />
              <span className="paso-txt">{f.corto}</span>
            </button>
          ))}
        </div>
        <div className="recorrido-pie">
          <span>
            Fase actual: <strong>{FASES[idxFase].nombre}</strong>
          </span>
          {l.fase === 'detenido' ? (
            <button className="enlace" onClick={() => actualizar({ fase: 'sin_info' })}>Reactivar</button>
          ) : (
            <button className="enlace peligro" onClick={() => actualizar({ fase: 'detenido' })}>Marcar como detenido</button>
          )}
        </div>

        <div className="ficha-cuerpo">
          <section className="ficha-sec">
            <h3>Seguimiento</h3>
            <div className="nota-nueva">
              <textarea
                value={texto}
                rows={2}
                placeholder="¿Qué pasó con este libro? Ej.: se envió a la autora la versión diagramada"
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) agregarNota();
                }}
              />
              <div className="nota-nueva-pie">
                <input type="date" value={fechaNota} max={hoyISO()} onChange={(e) => setFechaNota(e.target.value)} />
                <button className="btn btn-primario btn-peq" onClick={agregarNota} disabled={!texto.trim()}>
                  Anotar
                </button>
              </div>
            </div>
            <ol className="linea">
              {notas.map((n) => (
                <li key={n.id} className={`linea-item ${n.tipo}`}>
                  <span className="linea-fecha">{fmtFecha(n.fecha)}</span>
                  <p>{n.texto}</p>
                  {n.tipo === 'nota' && (
                    <button className="linea-borrar" onClick={() => borrarNota(n.id)} aria-label="Borrar nota" title="Borrar nota">
                      ×
                    </button>
                  )}
                </li>
              ))}
              {notas.length === 0 && <li className="muted">Sin movimientos todavía.</li>}
            </ol>
          </section>

          <section className="ficha-sec">
            <h3>Clasificación y evaluación</h3>
            <div className="campos dos">
              <label className="campo">
                <span className="campo-et">Agrupación</span>
                <select
                  value={l.tipoPublicacion ?? 'arbitrada'}
                  onChange={(e) => {
                    const t = e.target.value as TipoPublicacion;
                    const s: SubtipoPublicacion = t === 'arbitrada' ? 'libro' : 'cartilla';
                    actualizar({ tipoPublicacion: t, subtipoPublicacion: s });
                  }}
                >
                  <option value="arbitrada">Publicación arbitrada</option>
                  <option value="no_arbitrada">Publicación no arbitrada</option>
                </select>
              </label>
              <label className="campo">
                <span className="campo-et">Categoría</span>
                <select
                  value={l.subtipoPublicacion ?? ((l.tipoPublicacion ?? 'arbitrada') === 'arbitrada' ? 'libro' : 'cartilla')}
                  onChange={(e) => actualizar({ subtipoPublicacion: e.target.value as SubtipoPublicacion })}
                >
                  {(l.tipoPublicacion ?? 'arbitrada') === 'arbitrada' ? (
                    <>
                      <option value="libro">Libro</option>
                      <option value="revista">Revista</option>
                    </>
                  ) : (
                    <>
                      <option value="cartilla">Cartilla</option>
                      <option value="memoria">Memoria</option>
                    </>
                  )}
                </select>
              </label>
            </div>
            <Campo etiqueta="Concepto de pares evaluadores" tipo="largo" filas={2} valor={l.conceptoPares ?? ''} onGuardar={(v) => actualizar({ conceptoPares: v })} placeholder="Concepto o observaciones de los pares" />
            <Campo etiqueta="Requerimiento" tipo="largo" filas={2} valor={l.requerimiento ?? ''} onGuardar={(v) => actualizar({ requerimiento: v })} placeholder="Requerimientos pendientes" />

            <div className="pares-ficha">
              <span className="campo-et">Pares evaluadores asignados ({l.pares?.length ?? 0})</span>
              <div className="pares-form">
                <input type="text" value={parNombre} onChange={(e) => setParNombre(e.target.value)} placeholder="Nombre del docente par" />
                <input type="email" value={parCorreo} onChange={(e) => setParCorreo(e.target.value)} placeholder="correo@docente.edu.co" />
                <input type="date" value={parLimite} onChange={(e) => setParLimite(e.target.value)} title="Fecha límite" />
                <button
                  type="button"
                  className="btn btn-peq btn-primario"
                  disabled={!parNombre.trim()}
                  onClick={() => {
                    const nuevoPar: ParEvaluador = {
                      id: uid(),
                      nombre: parNombre.trim(),
                      correo: parCorreo.trim(),
                      estado: 'pendiente',
                      fechaLimite: parLimite,
                    };
                    actualizar({ pares: [...(l.pares ?? []), nuevoPar] });
                    setParNombre('');
                    setParCorreo('');
                  }}
                >
                  <Icono n="mas" size={14} />
                </button>
              </div>
              {(l.pares ?? []).length > 0 && (
                <ul className="pares-lista">
                  {(l.pares ?? []).map((p) => (
                    <li key={p.id}>
                      <div>
                        <strong>{p.nombre}</strong>
                        <span>{p.correo || 'Sin correo'}{p.fechaLimite ? ` · Límite ${fmtFechaCorta(p.fechaLimite)}` : ''}</span>
                      </div>
                      <div className="pares-acc">
                        <select
                          className="select-peq"
                          value={p.estado}
                          onChange={(e) =>
                            actualizar({
                              pares: (l.pares ?? []).map((x) => (x.id === p.id ? { ...x, estado: e.target.value as EstadoPar } : x)),
                            })
                          }
                        >
                          <option value="pendiente">Por invitar</option>
                          <option value="invitado">Invitado</option>
                          <option value="aceptado">Aceptado</option>
                          <option value="evaluado">Evaluado</option>
                          <option value="vencido">Vencido</option>
                        </select>
                        <button
                          type="button"
                          className="btn btn-peq"
                          disabled={!p.correo || enviandoPar !== null}
                          title="Enviar correo de invitación"
                          onClick={async () => {
                            setEnviandoPar(p.id);
                            const { asunto, cuerpo } = renderPlantillaCorreo(plantillaCorreo, p.estado === 'pendiente' ? 'invitacion' : 'recordatorio', l, p);
                            try {
                              await enviarCorreo({ para: p.correo, cc: plantillaCorreo.cc, asunto, cuerpo });
                              const hoy = hoyISO();
                              actualizar({
                                pares: (l.pares ?? []).map((x) =>
                                  x.id === p.id
                                    ? {
                                        ...x,
                                        estado: x.estado === 'pendiente' ? 'invitado' : x.estado,
                                        fechaEnvio: x.fechaEnvio || hoy,
                                      }
                                    : x,
                                ),
                              });
                              nota(`Correo enviado a par evaluador ${p.nombre} (${p.correo}).`);
                              onToast(`Correo enviado a ${p.nombre}.`);
                            } catch (err) {
                              onToast(err instanceof Error ? err.message : 'Error al enviar correo');
                            } finally {
                              setEnviandoPar(null);
                            }
                          }}
                        >
                          {enviandoPar === p.id ? '…' : p.estado === 'pendiente' ? 'Invitar' : 'Recordar'}
                        </button>
                        <button
                          type="button"
                          className="icono-btn"
                          aria-label="Quitar par"
                          onClick={() => actualizar({ pares: (l.pares ?? []).filter((x) => x.id !== p.id) })}
                        >
                          <Icono n="cerrar" size={14} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="ficha-sec">
            <h3>Gestión</h3>
            <div className="campos dos">
              <Campo etiqueta="Responsable" valor={l.responsable} onGuardar={(v) => actualizar({ responsable: v })} placeholder="Quién lo lleva" />
              <Campo etiqueta="Fecha compromiso" tipo="fecha" valor={l.fechaCompromiso} onGuardar={(v) => actualizar({ fechaCompromiso: v })} />
            </div>
            <Campo etiqueta="Próxima acción" valor={l.proximaAccion} onGuardar={(v) => actualizar({ proximaAccion: v })} placeholder="Ej.: confirmar cotización con Federico" />
          </section>

          <section className="ficha-sec">
            <h3>Datos del proyecto</h3>
            <Campo etiqueta="Autores (uno por línea)" tipo="largo" valor={l.autores} onGuardar={(v) => actualizar({ autores: v })} />
            <Campo etiqueta="Líder de proyecto" valor={l.liderProyecto ?? ''} onGuardar={(v) => actualizar({ liderProyecto: v })} placeholder="Docente o investigador líder" />
            <div className="campos dos">
              <Campo etiqueta="CDP" valor={l.cdp} onGuardar={(v) => actualizar({ cdp: v })} />
              <Campo etiqueta="N.º en el registro" tipo="numero" valor={l.no} onGuardar={(v) => actualizar({ no: num(v) })} />
            </div>
            <Campo etiqueta="Proyecto" tipo="largo" filas={2} valor={l.proyecto} onGuardar={(v) => actualizar({ proyecto: v })} />
            <div className="campos dos">
              <Campo etiqueta="Costo (COP)" tipo="numero" valor={l.costo} onGuardar={(v) => actualizar({ costo: num(v) })} />
              <Campo etiqueta="Adicional (p. ej. ISBN)" tipo="numero" valor={l.costoAdicional} onGuardar={(v) => actualizar({ costoAdicional: num(v) })} />
            </div>
            {l.costoAdicional ? <p className="pequeno muted">Total: {fmtCOP(costoTotal(l))}</p> : null}
            <Campo etiqueta={`ISBN · ${estadoISBN(l.isbn) === 'asignado' ? 'asignado' : estadoISBN(l.isbn) === 'tramite' ? 'en trámite' : 'sin registrar'}`} tipo="largo" filas={2} valor={l.isbn} onGuardar={(v) => actualizar({ isbn: v })} />
          </section>

          <section className="ficha-sec">
            <h3>Estado según el Excel</h3>
            <Campo etiqueta="Observación (Proyectos)" tipo="largo" valor={l.observacion} onGuardar={(v) => actualizar({ observacion: v })} />
            <Campo etiqueta="Estado (Proyectos)" tipo="largo" valor={l.estado} onGuardar={(v) => actualizar({ estado: v })} />
            <Campo etiqueta="Etapa actual (Proceso de libros)" tipo="largo" valor={l.etapa} onGuardar={(v) => actualizar({ etapa: v })} />
            <Campo etiqueta="Observaciones de proceso" tipo="largo" valor={l.obsProceso} onGuardar={(v) => actualizar({ obsProceso: v })} />
          </section>

          <section className="ficha-sec">
            <h3>Publicación</h3>
            <div className="campos tres">
              <Campo etiqueta="Año digital" tipo="numero" valor={l.anioDigital} onGuardar={(v) => actualizar({ anioDigital: num(v) })} placeholder="2026" />
              <Campo etiqueta="Año físico" tipo="numero" valor={l.anioFisico} onGuardar={(v) => actualizar({ anioFisico: num(v) })} placeholder="2027" />
              <Campo etiqueta="Fecha de salida" tipo="fecha" valor={l.fechaSalida} onGuardar={(v) => actualizar({ fechaSalida: v })} />
            </div>
            <Campo etiqueta="Observación (Salen en 2026)" tipo="largo" valor={l.obsSalida} onGuardar={(v) => actualizar({ obsSalida: v })} />
            <Campo etiqueta="Observación (Pendientes 2027+)" tipo="largo" valor={l.obsPendiente} onGuardar={(v) => actualizar({ obsPendiente: v })} />
          </section>

          <section className="ficha-sec">
            <h3>Aparece en las hojas</h3>
            <div className="hojas-check">
              {HOJAS.map((h) => (
                <label key={h.id} className="check">
                  <input
                    type="checkbox"
                    checked={l.hojas[h.id]}
                    onChange={(e) => actualizar({ hojas: { ...l.hojas, [h.id as HojaId]: e.target.checked } })}
                  />
                  {h.etiqueta}
                </label>
              ))}
            </div>
          </section>

          <section className="ficha-sec zona-peligro">
            {confirmar ? (
              <div className="confirmar">
                <span>¿Eliminar este libro de todas las hojas?</span>
                <button className="btn btn-peq" onClick={() => setConfirmar(false)}>Cancelar</button>
                <button className="btn btn-peq btn-peligro" onClick={eliminar}>Sí, eliminar</button>
              </div>
            ) : (
              <button className="enlace peligro" onClick={() => setConfirmar(true)}>
                <Icono n="papelera" size={14} /> Eliminar libro
              </button>
            )}
          </section>
        </div>
      </aside>
    </>
  );
}
