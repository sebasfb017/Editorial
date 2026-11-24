/**
 * Modal de carga de archivos Excel (.xlsx / .xls / .xlsm):
 * - Permite arrastrar o seleccionar un archivo, previsualiza las hojas reconocidas y los cambios detectados.
 * - Ofrece elegir entre "Combinar" (conserva notas/gestión) o "Reemplazar todo", y descargar la plantilla oficial.
 */
import { useEffect, useRef, useState } from 'react';
import type { Libro } from '../types';
import {
  aplicarCombinacion, HOJA_MAP, leerExcel, planificarCombinacion, prepararReemplazo,
  type PlanImportacion, type ResultadoLectura,
} from '../excel/importar';
import { exportarPlantillaExcel } from '../excel/exportar';
import { Icono } from './ui';
import { descargar, tituloCorto } from '../utils';

interface Props {
  archivoInicial: File | null;
  actuales: Libro[];
  cerrar: () => void;
  aplicar: (libros: Libro[], archivo: string, resumen: string) => void;
}

export function Importar({ archivoInicial, actuales, cerrar, aplicar }: Props) {
  const [archivo, setArchivo] = useState<File | null>(archivoInicial);
  const [lectura, setLectura] = useState<ResultadoLectura | null>(null);
  const [plan, setPlan] = useState<PlanImportacion | null>(null);
  const [error, setError] = useState('');
  const [modo, setModo] = useState<'combinar' | 'reemplazar'>('combinar');
  const [arrastre, setArrastre] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!archivo) return;
    setError('');
    archivo
      .arrayBuffer()
      .then((buf) => {
        const r = leerExcel(buf);
        if (!r.libros.length) throw new Error('No se encontraron libros en el archivo. Revisa que las hojas tengan la columna de título.');
        setLectura(r);
        setPlan(planificarCombinacion(actuales, r.libros));
      })
      .catch((e: Error) => setError(e.message || 'No se pudo leer el archivo.'));
  }, [archivo, actuales]);

  const confirmar = () => {
    if (!lectura || !plan || !archivo) return;
    if (modo === 'reemplazar' || actuales.length === 0) {
      aplicar(prepararReemplazo(lectura.libros), archivo.name, `Se cargaron ${lectura.libros.length} libros desde ${archivo.name}.`);
    } else {
      aplicar(
        aplicarCombinacion(actuales, plan),
        archivo.name,
        `${plan.nuevos.length} nuevos y ${plan.actualizados.length} actualizados desde ${archivo.name}.`,
      );
    }
  };

  return (
    <div className="modal-fondo" onMouseDown={(e) => e.target === e.currentTarget && cerrar()}>
      <div className="modal" role="dialog" aria-label="Cargar Excel">
        <div className="modal-cab">
          <h2>Cargar Excel</h2>
          <button className="icono-btn" onClick={cerrar} aria-label="Cerrar">
            <Icono n="cerrar" />
          </button>
        </div>

        {!lectura && (
          <>
            <div
              className={`zona-carga ${arrastre ? 'encima' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setArrastre(true);
              }}
              onDragLeave={() => setArrastre(false)}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setArrastre(false);
                const f = e.dataTransfer.files[0];
                if (f) setArchivo(f);
              }}
              onClick={() => input.current?.click()}
            >
              <Icono n="subir" size={22} />
              <p><strong>Arrastra el archivo aquí</strong> o haz clic para buscarlo</p>
              <p className="muted pequeno">
                Se leen las hojas Proyectos, Proceso de libros, Libros que salen, Aprobados pendientes y los nuevos campos de agrupación. Formato .xlsx
              </p>
              <input
                ref={input}
                type="file"
                accept=".xlsx,.xls,.xlsm"
                hidden
                onChange={(e) => e.target.files?.[0] && setArchivo(e.target.files[0])}
              />
            </div>
            <div className="modal-pie" style={{ marginTop: 12 }}>
              <span className="muted pequeno">¿Quieres un formato listo para llenar sin errores?</span>
              <button
                type="button"
                className="btn btn-peq"
                onClick={() => descargar(exportarPlantillaExcel(), 'Plantilla Seguimiento Editorial.xlsx')}
              >
                <Icono n="bajar" size={14} /> Descargar plantilla (.xlsx)
              </button>
            </div>
          </>
        )}

        {error && <p className="error">{error}</p>}

        {lectura && plan && (
          <div className="importe">
            <p className="importe-archivo">
              <Icono n="libro" /> {archivo?.name}
            </p>
            <table className="mini-tabla">
              <thead>
                <tr><th>Hoja encontrada</th><th>Se interpreta como</th><th className="der">Filas</th></tr>
              </thead>
              <tbody>
                {lectura.hojas.map((h) => (
                  <tr key={h.nombre} className={h.tipo ? '' : 'muted'}>
                    <td>{h.nombre}</td>
                    <td>{h.tipo ? HOJA_MAP[h.tipo].etiqueta : 'No reconocida'}</td>
                    <td className="der mono">{h.filas}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="pequeno">
              Son <strong>{lectura.libros.length} libros distintos</strong>: los títulos que se repiten entre hojas se unieron en una sola ficha.
            </p>
            {lectura.advertencias.map((a) => (
              <p key={a} className="aviso pequeno">{a}</p>
            ))}

            {actuales.length > 0 && (
              <>
                <div className="opciones">
                  <label className={`opcion ${modo === 'combinar' ? 'activa' : ''}`}>
                    <input type="radio" checked={modo === 'combinar'} onChange={() => setModo('combinar')} />
                    <div>
                      <strong>Combinar con lo que ya hay</strong>
                      <span>
                        {plan.nuevos.length} nuevos · {plan.actualizados.length} con cambios · {plan.sinCambios} iguales. Se conservan
                        notas, responsables y fechas.
                      </span>
                    </div>
                  </label>
                  <label className={`opcion ${modo === 'reemplazar' ? 'activa' : ''}`}>
                    <input type="radio" checked={modo === 'reemplazar'} onChange={() => setModo('reemplazar')} />
                    <div>
                      <strong>Reemplazar todo</strong>
                      <span>Borra los {actuales.length} libros actuales y su bitácora, y deja solo lo del Excel.</span>
                    </div>
                  </label>
                </div>
                {modo === 'combinar' && plan.actualizados.length > 0 && (
                  <details className="detalle-cambios">
                    <summary>Ver qué cambia</summary>
                    <ul>
                      {plan.actualizados.map((u) => (
                        <li key={u.antes.id}>
                          <strong>{tituloCorto(u.antes.titulo)}</strong>: {u.cambios.join(', ')}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            )}

            <div className="modal-pie">
              <button className="btn" onClick={() => { setLectura(null); setPlan(null); setArchivo(null); }}>
                Elegir otro archivo
              </button>
              <button className="btn btn-primario" onClick={confirmar}>
                {actuales.length === 0 ? 'Cargar libros' : modo === 'combinar' ? 'Combinar' : 'Reemplazar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
