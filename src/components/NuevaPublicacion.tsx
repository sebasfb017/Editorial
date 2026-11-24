import { useState, type FormEvent } from 'react';
import type { FaseId, HojaId, Libro, SubtipoPublicacion, TipoPublicacion } from '../types';
import { FASES } from '../fases';
import { HOJAS, libroVacio } from '../excel/importar';
import { Icono } from './ui';

interface Props {
  siguienteNo: number;
  hojaInicial?: HojaId;
  anioInicial?: number | null;
  cerrar: () => void;
  crear: (libro: Libro) => void;
}

const SUBTIPOS: Record<TipoPublicacion, { id: SubtipoPublicacion; etiqueta: string }[]> = {
  arbitrada: [
    { id: 'libro', etiqueta: 'Libro' },
    { id: 'revista', etiqueta: 'Revista' },
  ],
  no_arbitrada: [
    { id: 'cartilla', etiqueta: 'Cartilla' },
    { id: 'memoria', etiqueta: 'Memoria' },
  ],
};

export function NuevaPublicacion({ siguienteNo, hojaInicial = 'proyectos', anioInicial = 2026, cerrar, crear }: Props) {
  const [tipo, setTipo] = useState<TipoPublicacion>('arbitrada');
  const [subtipo, setSubtipo] = useState<SubtipoPublicacion>('libro');
  const [titulo, setTitulo] = useState('');
  const [costo, setCosto] = useState('');
  const [proyecto, setProyecto] = useState('');
  const [liderProyecto, setLiderProyecto] = useState('');
  const [autores, setAutores] = useState('');
  const [conceptoPares, setConceptoPares] = useState('');
  const [requerimiento, setRequerimiento] = useState('');
  const [cdp, setCdp] = useState('');
  const [anio, setAnio] = useState(anioInicial ? String(anioInicial) : '2026');
  const [fase, setFase] = useState<FaseId>('evaluacion');
  const [hojas, setHojas] = useState<Record<HojaId, boolean>>({
    proyectos: true,
    proceso: hojaInicial === 'proceso',
    salida: hojaInicial === 'salida' || (anioInicial ?? 2026) <= 2026,
    pendientes: hojaInicial === 'pendientes' || (anioInicial ?? 2026) >= 2027,
  });

  const cambiarTipo = (nuevoTipo: TipoPublicacion) => {
    setTipo(nuevoTipo);
    setSubtipo(SUBTIPOS[nuevoTipo][0].id);
  };

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) return;
    const anioNum = Number(anio.replace(/\D/g, '')) || null;
    const valorNum = costo.trim() ? Number(costo.replace(/\D/g, '')) || null : null;
    const labelTipo = tipo === 'arbitrada' ? 'Publicación arbitrada' : 'Publicación no arbitrada';
    const labelSub = SUBTIPOS[tipo].find((s) => s.id === subtipo)?.etiqueta ?? subtipo;

    const nuevo = libroVacio({
      no: siguienteNo,
      tipoPublicacion: tipo,
      subtipoPublicacion: subtipo,
      titulo: titulo.trim(),
      costo: valorNum,
      proyecto: proyecto.trim(),
      liderProyecto: liderProyecto.trim(),
      autores: autores.trim(),
      conceptoPares: conceptoPares.trim(),
      requerimiento: requerimiento.trim(),
      cdp: cdp.trim(),
      anioFisico: anioNum,
      anioDigital: anioNum,
      fase,
      hojas,
      seguimiento: [
        {
          id: 'n0',
          fecha: new Date().toISOString(),
          tipo: 'sistema',
          texto: `Creado en ${labelTipo} (${labelSub})${anioNum ? ` · año ${anioNum}` : ''}.`,
        },
      ],
    });
    crear(nuevo);
  };

  return (
    <div className="modal-fondo" onClick={cerrar}>
      <div className="modal modal-ancho" role="dialog" aria-label="Nueva publicación" onClick={(e) => e.stopPropagation()}>
        <div className="modal-cab">
          <div>
            <p className="sobretitulo">Registro editorial</p>
            <h2>Nueva publicación</h2>
          </div>
          <button className="icono-btn" onClick={cerrar} aria-label="Cerrar">
            <Icono n="cerrar" />
          </button>
        </div>

        <form className="form-nueva" onSubmit={enviar}>
          <div className="tipo-grupo">
            <button
              type="button"
              className={`tipo-card ${tipo === 'arbitrada' ? 'activo' : ''}`}
              onClick={() => cambiarTipo('arbitrada')}
            >
              <strong>Publicación arbitrada</strong>
              <span>Revistas y libros con evaluación de pares</span>
            </button>
            <button
              type="button"
              className={`tipo-card ${tipo === 'no_arbitrada' ? 'activo' : ''}`}
              onClick={() => cambiarTipo('no_arbitrada')}
            >
              <strong>Publicación no arbitrada</strong>
              <span>Cartillas y memorias institucionales</span>
            </button>
          </div>

          <div className="campos tres">
            <label className="campo">
              <span className="campo-et">Categoría</span>
              <select value={subtipo} onChange={(e) => setSubtipo(e.target.value as SubtipoPublicacion)}>
                {SUBTIPOS[tipo].map((s) => (
                  <option key={s.id} value={s.id}>{s.etiqueta}</option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span className="campo-et">Año de trabajo</span>
              <input
                type="text"
                inputMode="numeric"
                value={anio}
                onChange={(e) => setAnio(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="2026"
              />
            </label>
            <label className="campo">
              <span className="campo-et">Fase inicial</span>
              <select value={fase} onChange={(e) => setFase(e.target.value as FaseId)}>
                {FASES.map((f) => (
                  <option key={f.id} value={f.id}>{f.nombre}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="campo">
            <span className="campo-et">Título del libro / publicación *</span>
            <input
              type="text"
              required
              autoFocus
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej.: Gestión pública y territorios sostenibles"
            />
          </label>

          <div className="campos dos">
            <label className="campo">
              <span className="campo-et">Autores</span>
              <input
                type="text"
                value={autores}
                onChange={(e) => setAutores(e.target.value)}
                placeholder="Nombre completo de los autores"
              />
            </label>
            <label className="campo">
              <span className="campo-et">Líder de proyecto</span>
              <input
                type="text"
                value={liderProyecto}
                onChange={(e) => setLiderProyecto(e.target.value)}
                placeholder="Docente o investigador líder"
              />
            </label>
          </div>

          <div className="campos tres">
            <label className="campo">
              <span className="campo-et">Proyecto</span>
              <input
                type="text"
                value={proyecto}
                onChange={(e) => setProyecto(e.target.value)}
                placeholder="Código o nombre del proyecto"
              />
            </label>
            <label className="campo">
              <span className="campo-et">Valor (COP)</span>
              <input
                type="text"
                inputMode="numeric"
                value={costo ? Number(costo).toLocaleString('es-CO') : ''}
                onChange={(e) => setCosto(e.target.value.replace(/\D/g, ''))}
                placeholder="Ej.: 8.500.000"
              />
            </label>
            <label className="campo">
              <span className="campo-et">CDP</span>
              <input
                type="text"
                value={cdp}
                onChange={(e) => setCdp(e.target.value)}
                placeholder="N.º CDP"
              />
            </label>
          </div>

          <label className="campo">
            <span className="campo-et">Concepto de pares evaluadores</span>
            <textarea
              rows={2}
              value={conceptoPares}
              onChange={(e) => setConceptoPares(e.target.value)}
              placeholder="Resumen del concepto o estado de evaluación de pares"
            />
          </label>

          <label className="campo">
            <span className="campo-et">Requerimiento</span>
            <textarea
              rows={2}
              value={requerimiento}
              onChange={(e) => setRequerimiento(e.target.value)}
              placeholder="Requerimientos editoriales, técnicos o administrativos pendientes"
            />
          </label>

          <div className="campo">
            <span className="campo-et">Incluir en las hojas del Excel</span>
            <div className="hojas-check">
              {HOJAS.map((h) => (
                <label key={h.id} className="check">
                  <input
                    type="checkbox"
                    checked={hojas[h.id]}
                    onChange={(e) => setHojas((prev) => ({ ...prev, [h.id]: e.target.checked }))}
                  />
                  <span>{h.etiqueta}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="modal-pie">
            <button type="button" className="btn" onClick={cerrar}>Cancelar</button>
            <button type="submit" className="btn btn-primario" disabled={!titulo.trim()}>
              <Icono n="mas" /> Guardar y abrir ficha
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
