/**
 * Servidor HTTP local del Centro Editorial (puerto 48211 por defecto).
 * - Centraliza la base de datos en `data/centro-editorial.json` para que varios equipos en red compartan la información.
 * - Expone rutas REST para estado (`/api/estado`) y envío/configuración de correos SMTP (`/api/correo/*`).
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import type { ComiteEditorial, CorreoConfigPublica, Libro, PlantillaCorreo } from '../src/types';
import { FASE_MAP } from '../src/fases';

const PORT = Number(process.env.API_PORT || 48211);
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'centro-editorial.json');

interface CorreoConfigInterna {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
}

interface DbEstado {
  revision: string;
  libros: Libro[];
  comite: ComiteEditorial;
  archivo: string | null;
  guardado: string | null;
  correoConfig: CorreoConfigInterna;
  plantillaCorreo: PlantillaCorreo;
}

const PLANTILLA_DEFECTO: PlantillaCorreo = {
  asuntoInvitacion: 'Invitación como par evaluador · {titulo}',
  cuerpoInvitacion:
    'Estimado(a) docente {nombrePar},\n\nCordial saludo.\n\nDesde la Coordinación Editorial le extendemos una cordial invitación para participar como par evaluador de la publicación:\n\n• Título: {titulo}\n• Autores: {autores}\n• Proyecto: {proyecto}\n• Fecha límite sugerida: {fechaLimite}\n\nAgradecemos nos confirme su disponibilidad respondiendo a este correo para remitirle el manuscrito y el formato de evaluación.\n\nAtentamente,\nCoordinación Editorial',
  asuntoRecordatorio: 'Recordatorio de evaluación · {titulo}',
  cuerpoRecordatorio:
    'Estimado(a) docente {nombrePar},\n\nCordial saludo.\n\nLe recordamos amablemente que la fecha límite para el envío del concepto de evaluación de la publicación "{titulo}" es el {fechaLimite}.\n\nQuedamos atentos a cualquier inquietud.\n\nAtentamente,\nCoordinación Editorial',
  cc: '',
  diasPlazo: 15,
  diasAvisoAntes: 3,
};

const DB_DEFECTO: DbEstado = {
  revision: 'inicial',
  libros: [],
  comite: { proximaSesion: '', lugarOEnlace: '', notasComite: '', participantes: [] },
  archivo: null,
  guardado: null,
  correoConfig: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    fromName: process.env.SMTP_FROM_NAME || 'Coordinación Editorial',
  },
  plantillaCorreo: PLANTILLA_DEFECTO,
};

function leerDb(): DbEstado {
  try {
    if (!fs.existsSync(DB_FILE)) return structuredClone(DB_DEFECTO);
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DbEstado>;
    return {
      revision: parsed.revision ?? parsed.guardado ?? 'inicial',
      libros: parsed.libros ?? [],
      comite: { ...DB_DEFECTO.comite, ...(parsed.comite ?? {}) },
      archivo: parsed.archivo ?? null,
      guardado: parsed.guardado ?? null,
      correoConfig: { ...DB_DEFECTO.correoConfig, ...(parsed.correoConfig ?? {}) },
      plantillaCorreo: { ...PLANTILLA_DEFECTO, ...(parsed.plantillaCorreo ?? {}) },
    };
  } catch {
    throw new Error('No se pudo leer la base de datos. Revisa el archivo o restaura un respaldo antes de guardar.');
  }
}

/** Escritura atómica en disco (archivo temporal + rename) para evitar corrupción si se cierra de golpe. */
function guardarDb(db: DbEstado) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = `${DB_FILE}.tmp`;
  if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, `${DB_FILE}.bak`);
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function configPublica(c: CorreoConfigInterna): CorreoConfigPublica {
  return {
    host: c.host,
    port: c.port,
    secure: c.secure,
    user: c.user,
    fromName: c.fromName,
    tienePass: Boolean(c.pass),
  };
}

function leerBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res: http.ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function crearTransporter(c: CorreoConfigInterna) {
  if (!c.host || !c.user || !c.pass) {
    throw new Error('Falta configurar el servidor SMTP, usuario o contraseña en la pestaña Cuenta de correo.');
  }
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    secure: c.secure,
    auth: { user: c.user, pass: c.pass },
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  try {
    // 1. Obtener estado completo (sin exponer la contraseña SMTP al navegador)
    if (req.method === 'GET' && url.pathname === '/api/estado') {
      const db = leerDb();
      return json(res, 200, {
        revision: db.revision,
        libros: db.libros,
        comite: db.comite,
        archivo: db.archivo,
        guardado: db.guardado,
        correoConfig: configPublica(db.correoConfig),
        plantillaCorreo: db.plantillaCorreo,
      });
    }

    // 2. Guardar cambios de libros, comité o archivo fuente
    if (req.method === 'PUT' && url.pathname === '/api/estado') {
      const body = JSON.parse(await leerBody(req)) as {
        libros?: Libro[];
        comite?: ComiteEditorial;
        archivo?: string | null;
        revision?: string;
      };
      const db = leerDb();
      if (!body.revision) return json(res, 428, { error: 'Actualiza la aplicación antes de guardar.' });
      // Evita que el último equipo que guarda borre silenciosamente el trabajo de otro.
      if (body.revision !== db.revision) {
        return json(res, 409, { error: 'Otro equipo guardó cambios. Descarga tu respaldo y carga la versión del servidor para revisar las diferencias.' });
      }
      if (!Array.isArray(body.libros) || !body.comite || !Array.isArray(body.comite.participantes)) {
        return json(res, 400, { error: 'El registro enviado tiene un formato inválido.' });
      }
      const ids = new Set(body.libros.map((l) => l?.id));
      if (ids.size !== body.libros.length || body.libros.some((l) =>
        !l || typeof l.id !== 'string' || !l.id || typeof l.titulo !== 'string' ||
        !Object.hasOwn(FASE_MAP, l.fase) || !Array.isArray(l.seguimiento) || !l.hojas ||
        ['proyectos', 'proceso', 'salida', 'pendientes'].some((h) => typeof l.hojas[h as keyof Libro['hojas']] !== 'boolean')
      )) {
        return json(res, 400, { error: 'Hay publicaciones con datos inválidos o identificadores duplicados.' });
      }
      if (body.libros !== undefined) db.libros = body.libros;
      if (body.comite !== undefined) db.comite = body.comite;
      if (body.archivo !== undefined) db.archivo = body.archivo;
      db.guardado = new Date().toISOString();
      // Cada escritura genera una revisión nueva para el siguiente guardado.
      db.revision = randomUUID();
      guardarDb(db);
      return json(res, 200, { ok: true, guardado: db.guardado, revision: db.revision });
    }

    // 3. Guardar configuración SMTP y/o bocetos de correo
    if (req.method === 'PUT' && url.pathname === '/api/correo/config') {
      const body = JSON.parse(await leerBody(req)) as {
        correoConfig?: Partial<CorreoConfigInterna>;
        plantillaCorreo?: Partial<PlantillaCorreo>;
      };
      const db = leerDb();
      if (body.correoConfig) {
        const { pass, ...resto } = body.correoConfig;
        db.correoConfig = {
          ...db.correoConfig,
          ...resto,
          ...(pass && pass.trim() ? { pass: pass.trim() } : {}),
        };
      }
      if (body.plantillaCorreo) {
        db.plantillaCorreo = { ...db.plantillaCorreo, ...body.plantillaCorreo };
      }
      guardarDb(db);
      return json(res, 200, {
        ok: true,
        correoConfig: configPublica(db.correoConfig),
        plantillaCorreo: db.plantillaCorreo,
      });
    }

    // 4. Verificar conexión SMTP antes de enviar correos reales
    if (req.method === 'POST' && url.pathname === '/api/correo/probar') {
      const db = leerDb();
      const transporter = crearTransporter(db.correoConfig);
      await transporter.verify();
      return json(res, 200, { ok: true, mensaje: 'Conexión SMTP verificada correctamente.' });
    }

    // 5. Enviar correo electrónico real a un par evaluador mediante Nodemailer
    if (req.method === 'POST' && url.pathname === '/api/correo/enviar') {
      const body = JSON.parse(await leerBody(req)) as {
        para: string;
        cc?: string;
        asunto: string;
        cuerpo: string;
      };
      if (!body.para || !body.asunto || !body.cuerpo) {
        return json(res, 400, { ok: false, error: 'Faltan destinatario, asunto o cuerpo del correo.' });
      }
      const db = leerDb();
      const transporter = crearTransporter(db.correoConfig);
      const from = db.correoConfig.fromName
        ? `"${db.correoConfig.fromName}" <${db.correoConfig.user}>`
        : db.correoConfig.user;

      const info = await transporter.sendMail({
        from,
        to: body.para,
        cc: body.cc?.trim() || undefined,
        subject: body.asunto,
        text: body.cuerpo,
      });
      return json(res, 200, { ok: true, messageId: info.messageId });
    }

    return json(res, 404, { error: 'Ruta no encontrada' });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error interno del servidor';
    return json(res, 500, { ok: false, error: mensaje });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const direccion = server.address();
  const puerto = direccion && typeof direccion === 'object' ? direccion.port : PORT;
  console.log(`API Centro Editorial lista en http://127.0.0.1:${puerto} (BD: ${DB_FILE})`);
});
