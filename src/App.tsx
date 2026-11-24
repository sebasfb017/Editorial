/**
 * Componente raíz de la aplicación:
 * - Orquesta la navegación entre vistas (`resumen`, hojas del Excel, `bitacora`, `pares`).
 * - Gestiona los modales/paneles globales: Ficha lateral, Importar Excel y Nueva Publicación.
 * - Registra atajos de teclado globales (`Esc` para cerrar ficha, `Ctrl+Z` para deshacer) y arrastrar-y-soltar Excel.
 */
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import type { FaseId, HojaId, Libro, TipoPublicacion, Vista } from './types';
import { useLibros } from './store';
import { Sidebar } from './components/Sidebar';
import { Resumen } from './components/Resumen';
import { Hoja } from './components/Hoja';
import { Ficha } from './components/Ficha';
import { Bitacora } from './components/Bitacora';
import { Pares } from './components/Pares';
import { NuevaPublicacion } from './components/NuevaPublicacion';
import { Toast, type ToastMsg } from './components/Toast';
import { descargar, hoyISO } from './utils';

// Excel pesa más que el resto de la interfaz. Se descarga solo al abrir el importador.
const ImportadorDiferido = lazy(() => import('./components/Importar').then((mod) => ({ default: mod.Importar })));

export default function App() {
  const store = useLibros();
  const { libros } = store;
  const [vista, setVista] = useState<Vista>(() => (localStorage.getItem('ce.vista') as Vista) || 'resumen');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [importando, setImportando] = useState<File | null | 'abrir'>(null);
  const [creandoEn, setCreandoEn] = useState<HojaId | null>(null);
  const [filtroFase, setFiltroFase] = useState<FaseId | null>(null);
  const [filtroGrupo, setFiltroGrupo] = useState<'todas' | TipoPublicacion>('todas');
  const [filtroAnio, setFiltroAnio] = useState<number | 'todos'>('todos');
  const [toast, setToast] = useState<ToastMsg | null>(null);

  useEffect(() => localStorage.setItem('ce.vista', vista), [vista]);

  // Solo en desarrollo: ?cargar=archivo.xlsx (desde /public) abre el importador con ese archivo
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const ruta = new URLSearchParams(location.search).get('cargar');
    if (!ruta) return;
    fetch('/' + ruta)
      .then((r) => r.blob())
      .then((b) => setImportando(new File([b], ruta)));
  }, []);

  const libroAbierto = useMemo(() => libros.find((l) => l.id === abierto) ?? null, [libros, abierto]);

  const irA = useCallback((v: Vista, fase: FaseId | null = null, contexto?: { grupo?: 'todas' | TipoPublicacion; anio?: number | 'todos' }) => {
    setVista(v);
    setFiltroFase(fase);
    if (contexto?.grupo) setFiltroGrupo(contexto.grupo);
    if (contexto?.anio !== undefined) setFiltroAnio(contexto.anio);
  }, []);

  const nuevo = (hoja: HojaId) => setCreandoEn(hoja);

  const eliminar = (l: Libro) => {
    store.eliminar(l.id);
    setAbierto(null);
    setToast({
      texto: `Se eliminó «${l.titulo.split('\n')[0] || 'Sin título'}»`,
      accion: { etiqueta: 'Deshacer', fn: () => store.deshacer() },
    });
  };

  // Mantener Excel fuera del paquete inicial acelera la apertura del tablero.
  const exportar = async () => {
    if (!libros.length) return;
    try {
      const { exportarExcel } = await import('./excel/exportar');
      descargar(exportarExcel(libros), `Seguimiento Proyectos ${hoyISO()}.xlsx`);
      setToast({ texto: 'Excel generado con las 4 hojas y la bitácora.' });
    } catch {
      setToast({ texto: 'No se pudo generar el archivo Excel.' });
    }
  };

  // Atajos: Esc cierra la ficha
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && abierto && !(e.target as HTMLElement).closest('input,textarea,select')) setAbierto(null);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target as HTMLElement).closest('input,textarea')) {
        if (store.deshacer()) setToast({ texto: 'Cambio deshecho.' });
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [abierto, store]);

  // Arrastrar un Excel a cualquier parte de la ventana
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f && /\.xlsx?$|\.xlsm$/i.test(f.name)) setImportando(f);
    };
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, []);

  if (store.cargando) return <div className="vacio" role="status">Cargando el registro editorial…</div>;

  return (
    <div className="app">
      <Sidebar
        vista={vista}
        irA={irA}
        libros={libros}
        guardado={store.guardado}
        servidorActivo={store.servidorActivo}
        archivo={store.archivo}
        onImportar={() => setImportando('abrir')}
        onExportar={exportar}
      />
      <main className="main">
        {(store.pendiente || store.errorGuardado) && (
          <section className="panel" role="status">
            <p>{store.errorGuardado || 'Guardando cambios en el servidor…'}</p>
            <button className="btn btn-peq" onClick={store.reintentar}>Reintentar guardado</button>
            <button className="btn btn-peq" onClick={() => descargar(new Blob([JSON.stringify({ libros, comite: store.comite, archivo: store.archivo }, null, 2)], { type: 'application/json' }), `Respaldo editorial ${hoyISO()}.json`)}>Descargar respaldo completo</button>
            <button className="btn btn-peq" onClick={() => {
              if (window.confirm('Se cargarán los datos del servidor y se reemplazarán los cambios de este navegador. Descarga primero tu respaldo si necesitas conservarlos. ¿Continuar?')) void store.cargarServidor();
            }}>Cargar versión del servidor</button>
          </section>
        )}
        {vista === 'resumen' && (
          <Resumen
            libros={libros}
            comite={store.comite}
            actualizarComite={store.actualizarComite}
            actualizarLibro={store.actualizar}
            notaLibro={store.nota}
            archivo={store.archivo}
            abrir={setAbierto}
            irA={irA}
            grupoActivo={filtroGrupo}
            anioActivo={filtroAnio}
            onImportar={() => setImportando('abrir')}
            onNueva={() => setCreandoEn('proyectos')}
            onToast={(texto) => setToast({ texto })}
          />
        )}
        {(vista === 'proyectos' || vista === 'proceso' || vista === 'salida' || vista === 'pendientes') && (
          <Hoja
            key={vista}
            hoja={vista}
            libros={libros}
            filtroFaseInicial={filtroFase}
            filtroGrupoInicial={filtroGrupo}
            filtroAnioInicial={filtroAnio}
            abrir={setAbierto}
            abiertoId={abierto}
            actualizar={store.actualizar}
            nuevo={() => nuevo(vista)}
            onImportar={() => setImportando('abrir')}
          />
        )}
        {vista === 'bitacora' && <Bitacora libros={libros} abrir={setAbierto} nota={store.nota} />}
        {vista === 'pares' && (
          <Pares
            libros={libros}
            correoConfig={store.correoConfig}
            plantillaCorreo={store.plantillaCorreo}
            servidorActivo={store.servidorActivo}
            abrir={setAbierto}
            actualizar={store.actualizar}
            nota={store.nota}
            guardarCorreoConfig={store.guardarCorreoConfig}
            probarCorreo={store.probarCorreo}
            enviarCorreo={store.enviarCorreo}
            onToast={(texto) => setToast({ texto })}
          />
        )}
      </main>

      {libroAbierto && (
        <Ficha
          key={libroAbierto.id}
          libro={libroAbierto}
          plantillaCorreo={store.plantillaCorreo}
          enviarCorreo={store.enviarCorreo}
          onToast={(texto) => setToast({ texto })}
          cerrar={() => setAbierto(null)}
          actualizar={(c) => store.actualizar(libroAbierto.id, c)}
          nota={(t, f) => store.nota(libroAbierto.id, t, f)}
          borrarNota={(n) => store.borrarNota(libroAbierto.id, n)}
          eliminar={() => eliminar(libroAbierto)}
        />
      )}

      {importando && <Suspense fallback={<div className="modal-fondo"><div className="modal" role="status">Cargando el importador…</div></div>}>
        <ImportadorDiferido
          archivoInicial={importando === 'abrir' ? null : importando}
          actuales={libros}
          cerrar={() => setImportando(null)}
          aplicar={(nuevos, archivo, resumen) => {
            store.cargar(nuevos, archivo);
            setImportando(null);
            setToast({ texto: resumen, accion: { etiqueta: 'Deshacer', fn: () => store.deshacer() } });
          }}
        />
      </Suspense>}

      {creandoEn && (
        <NuevaPublicacion
          siguienteNo={Math.max(0, ...libros.map((l) => l.no ?? 0)) + 1}
          hojaInicial={creandoEn}
          cerrar={() => setCreandoEn(null)}
          crear={(l) => {
            store.crear(l);
            setCreandoEn(null);
            setAbierto(l.id);
            setToast({ texto: 'Publicación agregada.' });
          }}
        />
      )}

      {toast && <Toast msg={toast} cerrar={() => setToast(null)} />}
    </div>
  );
}
