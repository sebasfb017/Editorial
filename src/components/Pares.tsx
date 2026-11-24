/**
 * Vista de "Pares y correos" con tres pestañas:
 * 1. Seguimiento de pares: listado global de docentes pares con envío de invitación/recordatorio.
 * 2. Boceto de correo y condiciones: editor de plantillas con variables y vista previa en vivo.
 * 3. Cuenta de correo (SMTP): configuración y prueba de conexión del remitente en el servidor.
 */
import { useMemo, useState, type FormEvent } from 'react';
import type { CorreoConfigPublica, EstadoPar, Libro, ParEvaluador, PlantillaCorreo } from '../types';
import { renderPlantillaCorreo } from '../correo';
import { Icono } from './ui';
import { diasDesde, fmtFechaCorta, hoyISO, tituloCorto } from '../utils';

interface Props {
  libros: Libro[];
  correoConfig: CorreoConfigPublica;
  plantillaCorreo: PlantillaCorreo;
  servidorActivo: boolean;
  abrir: (id: string) => void;
  actualizar: (id: string, c: Partial<Libro>) => void;
  nota: (id: string, texto: string) => void;
  guardarCorreoConfig: (cfg: Partial<CorreoConfigPublica> & { pass?: string }, plantilla?: Partial<PlantillaCorreo>) => Promise<void>;
  probarCorreo: () => Promise<string>;
  enviarCorreo: (p: { para: string; cc?: string; asunto: string; cuerpo: string }) => Promise<string>;
  onToast: (msg: string) => void;
}

const ESTADO_LABEL: Record<EstadoPar, string> = {
  pendiente: 'Por invitar',
  invitado: 'Invitado',
  aceptado: 'Aceptado',
  evaluado: 'Evaluado',
  vencido: 'Vencido',
};

export function Pares({
  libros,
  correoConfig,
  plantillaCorreo,
  servidorActivo,
  abrir,
  actualizar,
  nota,
  guardarCorreoConfig,
  probarCorreo,
  enviarCorreo,
  onToast,
}: Props) {
  const [tab, setTab] = useState<'seguimiento' | 'boceto' | 'cuenta'>('seguimiento');
  const [filtroEstado, setFiltroEstado] = useState<'todos' | EstadoPar | 'recordar'>('todos');
  const [enviandoKey, setEnviandoKey] = useState<string | null>(null);

  // Estado local del formulario de boceto
  const [plantilla, setPlantilla] = useState<PlantillaCorreo>(plantillaCorreo);
  // Estado local de cuenta SMTP
  const [host, setHost] = useState(correoConfig.host);
  const [port, setPort] = useState(String(correoConfig.port || 587));
  const [secure, setSecure] = useState(correoConfig.secure);
  const [user, setUser] = useState(correoConfig.user);
  const [pass, setPass] = useState('');
  const [fromName, setFromName] = useState(correoConfig.fromName || 'Coordinación Editorial');
  const [guardandoCfg, setGuardandoCfg] = useState(false);

  const filas = useMemo(() => {
    const out: { libro: Libro; par: ParEvaluador; requiereRecordatorio: boolean }[] = [];
    for (const l of libros) {
      for (const p of l.pares ?? []) {
        let requiereRecordatorio = false;
        if ((p.estado === 'invitado' || p.estado === 'aceptado') && p.fechaLimite) {
          const faltan = -diasDesde(p.fechaLimite);
          if (faltan <= plantillaCorreo.diasAvisoAntes) requiereRecordatorio = true;
        }
        out.push({ libro: l, par: p, requiereRecordatorio });
      }
    }
    return out;
  }, [libros, plantillaCorreo.diasAvisoAntes]);

  const filtradas = useMemo(() => {
    return filas.filter((f) => {
      if (filtroEstado === 'todos') return true;
      if (filtroEstado === 'recordar') return f.requiereRecordatorio;
      return f.par.estado === filtroEstado;
    });
  }, [filas, filtroEstado]);

  const enviar = async (libro: Libro, par: ParEvaluador, tipo: 'invitacion' | 'recordatorio') => {
    if (!par.correo.trim()) {
      onToast('Este par no tiene correo registrado.');
      return;
    }
    const key = `${libro.id}:${par.id}:${tipo}`;
    setEnviandoKey(key);
    const { asunto, cuerpo } = renderPlantillaCorreo(plantillaCorreo, tipo, libro, par);
    try {
      await enviarCorreo({ para: par.correo, cc: plantillaCorreo.cc, asunto, cuerpo });
      const hoy = hoyISO();
      const paresActualizados = (libro.pares ?? []).map((x) =>
        x.id === par.id
          ? {
              ...x,
              estado: tipo === 'invitacion' && x.estado === 'pendiente' ? ('invitado' as EstadoPar) : x.estado,
              fechaEnvio: tipo === 'invitacion' ? x.fechaEnvio || hoy : x.fechaEnvio,
              ultimoRecordatorio: tipo === 'recordatorio' ? hoy : x.ultimoRecordatorio,
            }
          : x,
      );
      actualizar(libro.id, { pares: paresActualizados });
      nota(libro.id, `Correo de ${tipo === 'invitacion' ? 'invitación' : 'recordatorio'} enviado a ${par.nombre} (${par.correo}).`);
      onToast(`Correo enviado a ${par.nombre}.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al enviar correo';
      onToast(msg);
    } finally {
      setEnviandoKey(null);
    }
  };

  const cambiarEstadoPar = (libro: Libro, parId: string, estado: EstadoPar) => {
    actualizar(libro.id, {
      pares: (libro.pares ?? []).map((x) => (x.id === parId ? { ...x, estado } : x)),
    });
  };

  const guardarPlantilla = async (e: FormEvent) => {
    e.preventDefault();
    setGuardandoCfg(true);
    try {
      await guardarCorreoConfig({}, plantilla);
      onToast('Boceto de correo y reglas guardados en el servidor.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'No se pudo guardar.');
    } finally {
      setGuardandoCfg(false);
    }
  };

  const guardarCuenta = async (e: FormEvent) => {
    e.preventDefault();
    setGuardandoCfg(true);
    try {
      await guardarCorreoConfig({
        host: host.trim(),
        port: Number(port) || 587,
        secure,
        user: user.trim(),
        fromName: fromName.trim(),
        ...(pass.trim() ? { pass: pass.trim() } : {}),
      });
      setPass('');
      onToast('Cuenta de correo guardada en el servidor.');
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'No se pudo guardar la cuenta.');
    } finally {
      setGuardandoCfg(false);
    }
  };

  const verificarCuenta = async () => {
    setGuardandoCfg(true);
    try {
      const msg = await probarCorreo();
      onToast(msg);
    } catch (err) {
      onToast(err instanceof Error ? err.message : 'Falló la verificación SMTP.');
    } finally {
      setGuardandoCfg(false);
    }
  };

  const libroEjemplo = libros[0];

  return (
    <div className="pagina">
      <header className="cabecera">
        <div>
          <p className="sobretitulo">Evaluación académica</p>
          <h1>Pares evaluadores y correos</h1>
          <p className="cabecera-desc">
            Gestiona los docentes pares asignados a cada publicación, configura tu boceto de correo y envía invitaciones o recordatorios directamente.
          </p>
        </div>
        <div className="cabecera-acciones">
          <span className={`estado-srv ${servidorActivo ? 'ok' : ''}`}>
            {servidorActivo ? '● Servidor conectado' : '○ Solo modo local'}
          </span>
        </div>
      </header>

      <div className="barra-contexto">
        <div className="grupo-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'seguimiento'} className={`grupo-tab ${tab === 'seguimiento' ? 'activo' : ''}`} onClick={() => setTab('seguimiento')}>
            Seguimiento de pares <span>{filas.length}</span>
          </button>
          <button role="tab" aria-selected={tab === 'boceto'} className={`grupo-tab ${tab === 'boceto' ? 'activo' : ''}`} onClick={() => setTab('boceto')}>
            Boceto de correo y condiciones
          </button>
          <button role="tab" aria-selected={tab === 'cuenta'} className={`grupo-tab ${tab === 'cuenta' ? 'activo' : ''}`} onClick={() => setTab('cuenta')}>
            Cuenta de correo (SMTP) {correoConfig.tienePass ? <span>Lista</span> : null}
          </button>
        </div>
      </div>

      {tab === 'seguimiento' && (
        <section className="panel">
          <div className="panel-cab">
            <h2>Listado de pares asignados</h2>
            <div className="filtros">
              <button className={`chip ${filtroEstado === 'todos' ? 'activo' : ''}`} onClick={() => setFiltroEstado('todos')}>
                Todos <span>{filas.length}</span>
              </button>
              <button className={`chip ${filtroEstado === 'pendiente' ? 'activo' : ''}`} onClick={() => setFiltroEstado('pendiente')}>
                Por invitar <span>{filas.filter((f) => f.par.estado === 'pendiente').length}</span>
              </button>
              <button className={`chip ${filtroEstado === 'recordar' ? 'activo' : ''}`} onClick={() => setFiltroEstado('recordar')}>
                Por recordar <span>{filas.filter((f) => f.requiereRecordatorio).length}</span>
              </button>
              <button className={`chip ${filtroEstado === 'evaluado' ? 'activo' : ''}`} onClick={() => setFiltroEstado('evaluado')}>
                Evaluados <span>{filas.filter((f) => f.par.estado === 'evaluado').length}</span>
              </button>
            </div>
          </div>

          {filtradas.length === 0 ? (
            <p className="muted">
              No hay pares evaluadores en esta vista. Abre cualquier publicación en su ficha lateral para asignar docentes pares.
            </p>
          ) : (
            <div className="tabla-marco">
              <table className="tabla" style={{ minWidth: 880 }}>
                <thead>
                  <tr>
                    <th>Docente par</th>
                    <th>Correo</th>
                    <th>Publicación</th>
                    <th>Estado</th>
                    <th>Límite</th>
                    <th className="der">Acciones de correo</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map(({ libro, par, requiereRecordatorio }) => (
                    <tr key={`${libro.id}:${par.id}`}>
                      <td>
                        <strong>{par.nombre}</strong>
                        {par.institucion && <span className="titulo-sub">{par.institucion}</span>}
                      </td>
                      <td className="mono">{par.correo || '—'}</td>
                      <td>
                        <button className="titulo-btn" onClick={() => abrir(libro.id)}>
                          {tituloCorto(libro.titulo)}
                        </button>
                      </td>
                      <td>
                        <select
                          className="select-peq"
                          value={par.estado}
                          onChange={(e) => cambiarEstadoPar(libro, par.id, e.target.value as EstadoPar)}
                        >
                          {(Object.keys(ESTADO_LABEL) as EstadoPar[]).map((est) => (
                            <option key={est} value={est}>{ESTADO_LABEL[est]}</option>
                          ))}
                        </select>
                      </td>
                      <td className="mono">
                        {par.fechaLimite ? fmtFechaCorta(par.fechaLimite) : '—'}
                        {requiereRecordatorio && <span className="aviso" style={{ display: 'block', fontSize: 11 }}>Próximo / vencido</span>}
                      </td>
                      <td className="der">
                        <div style={{ display: 'inline-flex', gap: 6 }}>
                          <button
                            className="btn btn-peq btn-primario"
                            disabled={!par.correo || enviandoKey !== null}
                            onClick={() => enviar(libro, par, 'invitacion')}
                          >
                            {enviandoKey === `${libro.id}:${par.id}:invitacion` ? 'Enviando…' : 'Invitar'}
                          </button>
                          <button
                            className="btn btn-peq"
                            disabled={!par.correo || enviandoKey !== null}
                            onClick={() => enviar(libro, par, 'recordatorio')}
                          >
                            {enviandoKey === `${libro.id}:${par.id}:recordatorio` ? 'Enviando…' : 'Recordar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === 'boceto' && (
        <section className="panel">
          <div className="panel-cab">
            <div>
              <h2>Boceto de correo y condiciones de envío</h2>
              <p className="panel-nota">
                Variables disponibles: <code>{'{nombrePar}'}</code>, <code>{'{titulo}'}</code>, <code>{'{autores}'}</code>, <code>{'{proyecto}'}</code>, <code>{'{liderProyecto}'}</code>, <code>{'{fechaLimite}'}</code>, <code>{'{requerimiento}'}</code>.
              </p>
            </div>
          </div>

          <form className="form-nueva" onSubmit={guardarPlantilla}>
            <div className="campos tres">
              <label className="campo">
                <span className="campo-et">Copia (CC) siempre a</span>
                <input
                  type="text"
                  value={plantilla.cc}
                  onChange={(e) => setPlantilla({ ...plantilla, cc: e.target.value })}
                  placeholder="editorial@institucion.edu.co"
                />
              </label>
              <label className="campo">
                <span className="campo-et">Plazo por defecto (días)</span>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={plantilla.diasPlazo}
                  onChange={(e) => setPlantilla({ ...plantilla, diasPlazo: Number(e.target.value) || 15 })}
                />
              </label>
              <label className="campo">
                <span className="campo-et">Alertar recordatorio (días antes)</span>
                <input
                  type="number"
                  min={0}
                  max={30}
                  value={plantilla.diasAvisoAntes}
                  onChange={(e) => setPlantilla({ ...plantilla, diasAvisoAntes: Number(e.target.value) || 3 })}
                />
              </label>
            </div>

            <div className="cifra-cols">
              <div className="form-nueva">
                <p className="cifra-sub">1. Correo de invitación inicial</p>
                <label className="campo">
                  <span className="campo-et">Asunto</span>
                  <input
                    type="text"
                    value={plantilla.asuntoInvitacion}
                    onChange={(e) => setPlantilla({ ...plantilla, asuntoInvitacion: e.target.value })}
                  />
                </label>
                <label className="campo">
                  <span className="campo-et">Cuerpo del mensaje</span>
                  <textarea
                    rows={9}
                    value={plantilla.cuerpoInvitacion}
                    onChange={(e) => setPlantilla({ ...plantilla, cuerpoInvitacion: e.target.value })}
                  />
                </label>
              </div>

              <div className="form-nueva">
                <p className="cifra-sub">2. Correo de recordatorio</p>
                <label className="campo">
                  <span className="campo-et">Asunto</span>
                  <input
                    type="text"
                    value={plantilla.asuntoRecordatorio}
                    onChange={(e) => setPlantilla({ ...plantilla, asuntoRecordatorio: e.target.value })}
                  />
                </label>
                <label className="campo">
                  <span className="campo-et">Cuerpo del mensaje</span>
                  <textarea
                    rows={9}
                    value={plantilla.cuerpoRecordatorio}
                    onChange={(e) => setPlantilla({ ...plantilla, cuerpoRecordatorio: e.target.value })}
                  />
                </label>
              </div>
            </div>

            {libroEjemplo && (
              <div className="preview-correo">
                <p className="cifra-sub">Vista previa con «{tituloCorto(libroEjemplo.titulo)}»</p>
                <strong>{renderPlantillaCorreo(plantilla, 'invitacion', libroEjemplo, { nombre: 'Dr. Carlos Pérez', fechaLimite: hoyISO() }).asunto}</strong>
                <pre>{renderPlantillaCorreo(plantilla, 'invitacion', libroEjemplo, { nombre: 'Dr. Carlos Pérez', fechaLimite: hoyISO() }).cuerpo}</pre>
              </div>
            )}

            <div className="modal-pie">
              <span />
              <button type="submit" className="btn btn-primario" disabled={guardandoCfg}>
                {guardandoCfg ? 'Guardando…' : 'Guardar boceto y reglas'}
              </button>
            </div>
          </form>
        </section>
      )}

      {tab === 'cuenta' && (
        <section className="panel" style={{ maxWidth: 680 }}>
          <div className="panel-cab">
            <div>
              <h2>Cuenta de correo remitente (SMTP)</h2>
              <p className="panel-nota">
                Las credenciales se guardan únicamente en el servidor local (<code>data/centro-editorial.json</code>). Para Gmail u Outlook usa una contraseña de aplicación.
              </p>
            </div>
          </div>
          <form className="form-nueva" onSubmit={guardarCuenta}>
            <div className="campos dos">
              <label className="campo">
                <span className="campo-et">Servidor SMTP (Host)</span>
                <input type="text" value={host} onChange={(e) => setHost(e.target.value)} placeholder="smtp.office365.com o smtp.gmail.com" />
              </label>
              <label className="campo">
                <span className="campo-et">Puerto</span>
                <input type="text" inputMode="numeric" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} placeholder="587" />
              </label>
            </div>
            <div className="campos dos">
              <label className="campo">
                <span className="campo-et">Correo remitente (usuario)</span>
                <input type="email" value={user} onChange={(e) => setUser(e.target.value)} placeholder="editorial@institucion.edu.co" />
              </label>
              <label className="campo">
                <span className="campo-et">Contraseña / App Password {correoConfig.tienePass ? '(ya configurada)' : ''}</span>
                <input type="password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder={correoConfig.tienePass ? 'Dejar vacío para mantener la actual' : '••••••••••••'} />
              </label>
            </div>
            <div className="campos dos">
              <label className="campo">
                <span className="campo-et">Nombre visible del remitente</span>
                <input type="text" value={fromName} onChange={(e) => setFromName(e.target.value)} placeholder="Coordinación Editorial" />
              </label>
              <label className="check" style={{ alignSelf: 'end', paddingBottom: 6 }}>
                <input type="checkbox" checked={secure} onChange={(e) => setSecure(e.target.checked)} />
                <span>Usar SSL/TLS directo (puerto 465)</span>
              </label>
            </div>
            <div className="modal-pie">
              <button type="button" className="btn" onClick={verificarCuenta} disabled={guardandoCfg}>
                <Icono n="alerta" size={14} /> Probar conexión SMTP
              </button>
              <button type="submit" className="btn btn-primario" disabled={guardandoCfg}>
                {guardandoCfg ? 'Guardando…' : 'Guardar cuenta SMTP'}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
