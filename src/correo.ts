import type { Libro, ParEvaluador, PlantillaCorreo } from './types';
import { fmtFechaCorta, tituloCorto } from './utils';

export function renderPlantillaCorreo(
  plantilla: PlantillaCorreo,
  tipo: 'invitacion' | 'recordatorio',
  libro: Libro,
  par: Pick<ParEvaluador, 'nombre' | 'fechaLimite'>,
): { asunto: string; cuerpo: string } {
  const vars: Record<string, string> = {
    '{nombrePar}': par.nombre || 'Docente',
    '{titulo}': tituloCorto(libro.titulo) || 'Publicación sin título',
    '{autores}': libro.autores ? libro.autores.replace(/\n+/g, ', ') : 'Por definir',
    '{proyecto}': libro.proyecto || 'No especificado',
    '{liderProyecto}': libro.liderProyecto || 'No especificado',
    '{fechaLimite}': par.fechaLimite ? fmtFechaCorta(par.fechaLimite) : `en ${plantilla.diasPlazo} días`,
    '{requerimiento}': libro.requerimiento || 'Ninguno especificado',
  };

  const reemplazar = (txt: string) => {
    let out = txt;
    for (const [k, v] of Object.entries(vars)) out = out.split(k).join(v);
    return out;
  };

  const asunto = reemplazar(tipo === 'invitacion' ? plantilla.asuntoInvitacion : plantilla.asuntoRecordatorio);
  const cuerpo = reemplazar(tipo === 'invitacion' ? plantilla.cuerpoInvitacion : plantilla.cuerpoRecordatorio);
  return { asunto, cuerpo };
}

export function fechaMasDias(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}
