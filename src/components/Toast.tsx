import { useEffect } from 'react';

export interface ToastMsg {
  texto: string;
  accion?: { etiqueta: string; fn: () => void };
}

export function Toast({ msg, cerrar }: { msg: ToastMsg; cerrar: () => void }) {
  useEffect(() => {
    const t = setTimeout(cerrar, msg.accion ? 7000 : 3500);
    return () => clearTimeout(t);
  }, [msg, cerrar]);
  return (
    <div className="toast" role="status">
      <span>{msg.texto}</span>
      {msg.accion && (
        <button
          className="toast-accion"
          onClick={() => {
            msg.accion!.fn();
            cerrar();
          }}
        >
          {msg.accion.etiqueta}
        </button>
      )}
      <button className="toast-x" onClick={cerrar} aria-label="Cerrar">
        ×
      </button>
    </div>
  );
}
