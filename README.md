# Seguimiento editorial · Centro de control

Aplicación web para la gestión integral de publicaciones editoriales: controla libros, revistas, cartillas y memorias desde su evaluación hasta su publicación, sincroniza información con archivos Excel, centraliza la base de datos en un servidor local para trabajo en red, gestiona el Comité Editorial y permite administrar pares evaluadores con envío directo de correos electrónicos.

---

## 1. Tecnologías principales

- **Frontend:** React 19 + TypeScript + Vite 8.
- **Manejo de Excel:** `xlsx` (SheetJS) para lectura, combinación, exportación y generación de plantilla `.xlsx`.
- **Backend / API local:** Servidor HTTP en Node.js (`tsx server/index.ts`) con persistencia en JSON (`data/centro-editorial.json`) y envío de correos mediante `nodemailer`.
- **Estilos:** CSS puro con variables (`src/styles.css`), sin frameworks externos.

---

## 2. Requisitos e instalación

1. Tener instalado **Node.js** (versión 20 o superior).
2. Clonar el repositorio e instalar dependencias:

```bash
git clone https://github.com/sebasfb017/Editorial.git
cd Editorial
npm install
```

---

## 3. Cómo ejecutar el proyecto en desarrollo

El proyecto consta de **dos procesos** que trabajan juntos (el frontend en Vite y el backend de API/correos):

1. **Terminal 1 — Iniciar el servidor centralizado (API y correos):**
   ```bash
   npm run server
   ```
   Escucha en `http://127.0.0.1:48211` y guarda automáticamente los datos en `data/centro-editorial.json`.

2. **Terminal 2 — Iniciar la interfaz web (Vite):**
   ```bash
   npm run dev
   ```
   Abre en el puerto **`48210`** (`http://localhost:48210/` y también expuesto en la IP de red local gracias a `host: true` en `vite.config.ts`).  
   Todas las peticiones a `/api/*` desde Vite se redirigen automáticamente al servidor `127.0.0.1:48211` mediante el proxy configurado en `vite.config.ts`.

3. **Compilar para producción (verificación de TypeScript + bundle):**
   ```bash
   npm run build
   ```

---

## 4. Estructura del proyecto (mapa de archivos)

```text
├── server/
│   └── index.ts                 # Servidor HTTP Node: API (/api/estado, /api/correo/*) y envío SMTP con Nodemailer
├── data/                        # (Ignorado en Git) Base de datos JSON local: centro-editorial.json
├── public/                      # Archivos estáticos opcionales
├── scripts/
│   └── probar-importacion.ts    # Script de prueba para lectura y exportación de Excel
├── src/
│   ├── App.tsx                  # Componente raíz: navegación entre vistas, ficha lateral, modales y atajos (Esc, Ctrl+Z)
│   ├── main.tsx                 # Punto de entrada React
│   ├── types.ts                 # Tipos TypeScript (Libro, ParEvaluador, ComiteEditorial, PlantillaCorreo, etc.)
│   ├── store.ts                 # Estado global (useReducer), sincronización con /api/estado, respaldo localStorage y deshacer
│   ├── fases.ts                 # Catálogo de las 10 fases editoriales e inferencia automática desde texto libre
│   ├── correo.ts                # Renderizado de plantillas de correo con variables dinámicas
│   ├── utils.ts                 # Utilidades: formato COP, fechas, normalización y comparación de títulos (mismoTitulo)
│   ├── styles.css               # Hoja de estilos completa (paleta morado y rosa claro, diseño responsive)
│   ├── excel/
│   │   ├── importar.ts          # Lectura de Excel, unión de títulos repetidos entre hojas, clasificación y combinación
│   │   └── exportar.ts          # Exportación a Excel (.xlsx) y generador de la plantilla oficial descargable
│   └── components/
│       ├── Sidebar.tsx          # Menú lateral, contadores por hoja, botones de Excel e indicador Servidor/Local
│       ├── Resumen.tsx          # Dashboard principal: filtros, tarjetas KPI interactivas, fases, alertas, CDP y Comité Editorial
│       ├── Hoja.tsx             # Vista de tabla editable en línea para cada hoja del Excel
│       ├── Ficha.tsx            # Panel lateral completo de cada publicación (fases, campos, pares evaluadores y bitácora)
│       ├── NuevaPublicacion.tsx # Modal para crear publicaciones eligiendo Arbitrada / No arbitrada y todos sus campos
│       ├── Pares.tsx            # Módulo de Pares Evaluadores, bocetos de correo y configuración de cuenta SMTP
│       ├── Bitacora.tsx         # Historial cronológico global de notas y cambios
│       ├── Importar.tsx         # Modal de carga de Excel (Combinar / Reemplazar) y descarga de plantilla oficial
│       ├── Toast.tsx            # Notificaciones flotantes con botón de Deshacer
│       └── ui.tsx               # Componentes base compartidos (FaseTag, IsbnCell, Icono SVG)
├── vite.config.ts               # Configuración de Vite (puerto 48210 y proxy /api -> 48211)
└── package.json                 # Dependencias y scripts
```

---

## 5. Funcionalidades principales

### A. Agrupación editorial y filtro por año
- Cada publicación pertenece a una única agrupación:
  - **Publicaciones arbitradas:** `Libro` o `Revista`.
  - **Publicaciones no arbitradas:** `Cartilla` o `Memoria`.
- En **Resumen** (`src/components/Resumen.tsx`) se puede filtrar todo el tablero por agrupación y por **Año en trabajo** (detectado de los años digitales, físicos o fechas de salida).

### B. Tablero principal interactivo (`Resumen.tsx`)
- **Tarjetas superiores interactivas:** al hacer clic en cualquiera de los 5 indicadores (*Títulos en el registro maestro*, *Inversión comprometida*, *En producción editorial*, *Con ISBN asignado*, *Salen en 2026*), se despliega un panel con el desglose y acceso directo a los libros o a la hoja correspondiente.
- **Dónde está cada libro:** recorrido por las 10 fases editoriales (`Sin información` → `En evaluación` → `En cotización` → `Cotización aprobada` → `Corrección de estilo` → `Diagramación` → `Revisión del autor` → `Impresión / ISBN` → `Listo / publicado` / `Detenido`).
- **Requiere atención:** alertas automáticas por fechas vencidas, salidas próximas, falta de ISBN o costos pendientes.
- **Comité editorial:** agenda de próxima sesión, gestión de participantes, lista conectada de publicaciones en evaluación/aprobación con botones rápidos (**Aprobar** / **Detener**) y botón **Copiar orden del día**.

### C. Hojas tipo Excel y Ficha lateral (`Hoja.tsx`, `Ficha.tsx`, `NuevaPublicacion.tsx`)
- Un mismo título puede aparecer en varias hojas del Excel (`Proyectos 2026-2`, `Proceso de Libros`, `Libros que salen en 2026`, `Aprobados pendientes 2027`); el sistema los **unifica en una sola ficha** para evitar ediciones duplicadas.
- Permite edición directa haciendo doble clic en la tabla o abriendo la ficha lateral completa.
- Incluye campos de gestión y seguimiento: *Líder de proyecto*, *Concepto de pares evaluadores*, *Requerimiento*, *CDP*, *ISBN*, *Valor*, *Responsable*, *Próxima acción* y *Fecha compromiso*.

### D. Importación, exportación y plantilla Excel (`importar.ts`, `exportar.ts`)
- Desde **Cargar Excel** se puede descargar la **Plantilla oficial (.xlsx)** con los encabezados esperados y una hoja de instrucciones.
- Al subir un `.xlsx`, omite automáticamente filas de totales (`TOTAL...`), infiere fases desde textos libres, respeta la agrupación asignada y permite **Combinar** (conservando notas y gestiones previas) o **Reemplazar**.

### E. Módulo de Pares Evaluadores y envío de correos (`Pares.tsx`, `correo.ts`, `server/index.ts`)
- **Seguimiento de pares:** desde la ficha de cada libro o desde la pestaña **Pares y correos**, se asignan docentes pares con su correo, estado (*Por invitar*, *Invitado*, *Aceptado*, *Evaluado*, *Vencido*) y fecha límite.
- **Boceto de correo y reglas:** permite personalizar el asunto y cuerpo de *Invitación* y *Recordatorio* usando variables (`{nombrePar}`, `{titulo}`, `{autores}`, `{proyecto}`, `{liderProyecto}`, `{fechaLimite}`, `{requerimiento}`), definir copia `CC`, plazo en días y días de aviso previo.
- **Cuenta SMTP:** configuración de servidor SMTP, puerto, usuario y contraseña de aplicación (o variables de entorno `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_NAME`) con botón para probar la conexión antes de enviar.

---

## 6. Seguridad y datos en Git

- Las carpetas `node_modules/`, `dist/`, `data/` y archivos `.env*` están excluidos en `.gitignore`.
- **Nunca subas `data/centro-editorial.json` ni archivos `.env` al repositorio**, ya que contienen la base de datos local y las credenciales SMTP configuradas.

## 7. Guardado y recuperación

## 8. Registro de cambios

La primera tanda de mejoras incluye comentarios en los puntos donde se controla la revisión de guardado, la carga diferida de Excel, la conservación de filtros del tablero y la reconstrucción de la bitácora.

- Control de conflictos entre equipos mediante una revisión del estado.
- Respaldo `.bak` antes de cada escritura de la base.
- Validación de ISBN y fechas de calendario.
- Importación con identificadores estables, años separados y notas recuperables.
- Pruebas ejecutables con `npm test`.
- Carga diferida del importador y exportador de Excel.

Después de actualizar esta versión, reinicia el proceso `npm run server` y recarga los navegadores conectados. Cada guardado comprueba la versión de la base para detectar cambios hechos desde otro equipo. Los clientes de versiones anteriores deben recargarse antes de guardar.

Si aparece un conflicto, descarga el respaldo completo desde el aviso. El botón **Cargar versión del servidor** solicita confirmación y reemplaza los cambios de ese navegador. Puedes revisar el JSON descargado para recuperar los cambios que todavía necesites incorporar. Los errores de conexión conservan los cambios locales y permiten reintentar el guardado.

Antes de cada escritura, el servidor conserva la versión previa en `data/centro-editorial.json.bak`. Para restaurarla, detén el servidor, conserva una copia del archivo actual, copia el respaldo sobre `data/centro-editorial.json` y vuelve a iniciar el servidor. Los respaldos de esta carpeta contienen también la configuración SMTP y deben permanecer fuera de Git.

La exportación Excel incluye identificadores, años digital y físico separados, fecha de salida y datos para recuperar las notas de la bitácora. Conserva estas columnas al editar el archivo. Para un respaldo completo del servidor, conserva el JSON de `data`.

Ejecuta `npm test` para comprobar las regresiones de importación, fechas, ISBN, concurrencia y respaldos. La prueba del servidor utiliza un directorio temporal y un puerto asignado automáticamente.
