# Guía de defensa — GOMLIVE

Guía de estudio basada en el código actual de GOMLIVE (carpeta `simple-webrtc`).
Los números de línea son aproximados: si editas un archivo, búscalos por nombre de función o selector.

**Índice:** 1. Arquitectura y tecnologías · 2. Archivos · 3. Componentes · 4. Chat · 5. Reacciones · 6. Streaming y pantalla compartida · 7. Personalización · 8. Modificaciones rápidas · 9. Preguntas · 10. Guion · 11. Pruebas · 12. Limitaciones

---

## 1. Resumen de arquitectura

```text
                 ┌──────────────────────────────────┐
                 │  server.js (Express)              │  ① HTTP: sirve las páginas
                 │  + chat-server.js (WebSocket)     │  ② WebSocket /chat: CHAT y REACCIONES
                 └──────────────┬───────────────────┘
                  HTTP + WS /chat│
          ┌─────────────────────┴─────────────────────┐
          ▼                                           ▼
   EMISOR (moderador)                          RECEPTOR (espectador) × N
   emisor/index.html                           receptor/index.html
   emisor.js + gomlive-ui.js                   receptor.js + gomlive-ui.js
          │                                           │
          │   ③ Señalización WebRTC (offer/answer/ICE) │
          │      espectadores, EN VIVO, ¿comparte?      │
          └──────────► Firebase Realtime Database ◄────┘
                       rooms/gomlive/...
          │                                           ▲
          └──── ④ Video y audio: WebRTC P2P directo ──┘
                (una RTCPeerConnection por espectador)
```

| Tecnología | Para qué se usa en GOMLIVE | Ventaja | Desventaja |
|---|---|---|---|
| **WebRTC** `RTCPeerConnection` + `getUserMedia` | Video y audio del moderador a cada espectador, directo (P2P) | Baja latencia; el video no pasa por nuestro servidor | En estrella, el emisor sube una copia por espectador (límite ~4–10) |
| **`getDisplayMedia`** | Capturar pantalla, ventana o pestaña | Nativa, sin librerías ni extensiones | Solo en computadora; requiere `localhost` o `https` |
| **`RTCRtpSender.replaceTrack`** | Cambiar cámara ↔ pantalla | No renegocia: los espectadores no se desconectan | Solo cambia una pista por otra del mismo tipo |
| **Firebase Realtime Database** (SDK compat 10.12.2) | Señalización, lista de espectadores, EN VIVO, nombre del moderador, si comparte pantalla | Tiempo real y `onDisconnect` (limpia al cerrar la pestaña) | Proyecto compartido con otros usuarios del curso; sin autenticación |
| **WebSocket** (`ws` 8.22 en el servidor, nativo en el navegador) | Chat y reacciones | Bidireccional e inmediato; servidor propio que valida | El historial vive en memoria; requiere el servidor Node encendido |
| **Express** (`server.js`) | Sirve las páginas; sobre su puerto se monta el WebSocket | Simple, un solo puerto para todo | No sirve como sitio estático (GitHub Pages) |
| **CSS** Grid, Flexbox, variables, media queries, `@keyframes` | Layout de 3 columnas, temas, móvil, animaciones | Sin frameworks; animaciones en la tarjeta gráfica | Hay que mantener a mano los breakpoints |
| **HTML + JavaScript puro** | Toda la interfaz | Se entiende sin conocer frameworks | Más código manual para actualizar el DOM |
| **Google Fonts** (IBM Plex Sans, IBM Plex Mono) | Texto (Sans) y datos técnicos (Mono) | Identidad propia, sobria | Necesita internet al cargar |

**No se instaló ninguna librería para pantalla compartida ni reacciones:** todo usa APIs nativas y el WebSocket que ya existía.

**¿Qué tecnología usan el chat y las reacciones?** **WebSocket propio.** El navegador abre una conexión `ws://<servidor>/chat` con nuestro servidor Node.js; `chat-server.js` recibe cada mensaje, lo valida, le pone id y hora, lo guarda en un historial en memoria (últimos 60) y lo reenvía a todos los conectados (*broadcast*). Las reacciones usan **la misma conexión** con otro tipo de mensaje (`type: 'reaction'`), pero no se guardan.

Primera versión (antes del cambio): el chat usaba Firebase (`push` + `child_added`). Se cambió a WebSocket para tener un servidor de chat propio, controlado por nosotros; el resto del programa no se tocó.

Estructura en la base de datos:

```text
rooms/gomlive
 ├─ active: true                    ← la transmisión está en vivo
 ├─ host: { name, sharing }         ← nombre del moderador y si comparte pantalla
 └─ viewers/{viewerId}
     ├─ ready, name                 ← el espectador se registra
     ├─ offer, answer               ← SDP de WebRTC
     ├─ callerCandidates/           ← ICE del emisor
     └─ calleeCandidates/           ← ICE del espectador
```

### Historia del proyecto (qué era original y qué no)

1. **Commit `cd96363` (original del curso):** WebRTC 1 a 1. Un solo `offer`/`answer` en `rooms/main`. Solo una persona podía ver.
2. **Cambio 1:N (hecho por el equipo antes del rediseño, sin commit):** `emisor.js` pasó a tener un `Map` `peers` con una conexión por espectador; `receptor.js` se registra en `viewers/{id}`; se añadieron credenciales en `firebase-config.js`.
3. **Rediseño GOMLIVE (este trabajo):** nueva interfaz, chat, compartir pantalla, mic/cámara, temas, responsive y dos correcciones de errores.
4. **Chat por WebSocket:** el chat pasó de Firebase a un servidor WebSocket propio (`chat-server.js`). Solo cambiaron el servidor y la función `initChat()`.
5. **Identidad GOMLIVE, pantalla compartida y reacciones:** se unificó el nombre (archivo `gomlive-ui.js`, objeto `GomliveUI`), la sala pasó a `rooms/gomlive` para no chocar con otros grupos, se mejoró compartir pantalla (errores, liberación de pistas, aviso a los espectadores) y se agregaron reacciones en vivo por el WebSocket.

---

## 2. Archivos creados y modificados

| Archivo | Responsabilidad | Cambio realizado | Importancia |
|---|---|---|---|
| `public/gomlive-ui.js` | Toda la capa de interfaz compartida: temas, chat, reacciones, participantes, ajustes, emojis, avisos, pestañas móviles | **Creado** en el rediseño; luego ampliado con reacciones | Sin él no hay chat, ni reacciones, ni temas, ni botones funcionando. El streaming seguiría funcionando |
| `public/style.css` | Todo el diseño visual | **Reescrito** (antes: ~57 líneas con fondo gris y botones azules) | Define colores, layout de 3 columnas y responsive |
| `public/emisor/index.html` | Estructura de la página del moderador | **Reescrito**, conservando los IDs originales | Si se cambia un `id` usado por `emisor.js`, el streaming se rompe |
| `public/receptor/index.html` | Estructura de la página del espectador | **Reescrito**, conservando los IDs originales | Igual que el anterior con `receptor.js` |
| `public/emisor/emisor.js` | Captura cámara/mic y envía a cada espectador; compartir pantalla | **Ganchos añadidos** (mic, cámara, compartir pantalla, nombre, avisos a la UI) + corrección de `.off()` + mejoras de pantalla compartida (errores, `contentHint`, liberar pistas, `host/sharing`) | Es el corazón del streaming |
| `public/receptor/receptor.js` | Se conecta y reproduce el video | **Ganchos añadidos** (nombre, vista local, silenciar) + 2 correcciones | Sin él el espectador no ve nada |
| `public/firebase-config.js` | Credenciales Firebase, `db`, `ROOM_PATH`, `RTC_CONFIG` (STUN) | `ROOM_PATH` pasó de `'rooms/main'` a `'rooms/gomlive'`, y las credenciales apuntan al proyecto propio `rtcsgomez` (cambio hecho por ti) | Lo usan todos los JS; emisor y receptor cargan este mismo archivo, así que siempre comparten proyecto y sala |
| `chat-server.js` | Servidor WebSocket: chat (historial, validación, broadcast) y reacciones (lista blanca, límite, broadcast sin guardar), ping | **Creado** y luego ampliado con `handleReaction` | Sin él no hay chat ni reacciones; el video sigue funcionando |
| `server.js` | Express: rutas `/emisor`, `/receptor`, estáticos | **Modificado**: guarda el servidor HTTP (`const server = app.listen(...)`) y le monta el chat con `attachChat(server)` | Arranca la app y el chat |
| `package.json` | Dependencias `express` y `ws`, script `npm start` | **Modificado**: se agregó `ws`; `name` pasó a `gomlive` | Sin `npm install` no arranca |
| `GUIA_DEFENSA_GOMLIVE.md` | Esta guía | Creado | — |

### Detalle por archivo

#### `public/gomlive-ui.js` (nuevo)
- **Para qué sirve:** separar la interfaz de la lógica WebRTC. Expone un objeto global `GomliveUI` con `init`, `getName`, `setControl`, `setStageActive`, `setScreenSharing`, `setSelfVideo`, `setSelfViewer`, `setParticipantState` y `toast`.
- **Por qué:** así `emisor.js` y `receptor.js` casi no cambian; solo "avisan" a la interfaz.
- **Se relaciona con:** `firebase-config.js` (usa `db` y `ROOM_PATH`), ambos `index.html` (busca elementos por `id`), `emisor.js`/`receptor.js` (le pasan sus acciones en `GomliveUI.init`).
- **Funciones clave:** `injectChrome` (iconos SVG, popovers con la fila de reacciones, diálogo de ajustes), `initThemes`/`applyTheme`/`cycleTheme`, `bindActions`/`setControl`, `watchRoom` (incluye `host/sharing`), `setScreenSharing`, `watchViewers`/`renderPeople`, `initChat`/`renderMessage`/`flashChat`, `sendReaction`/`showReaction`, `setTab`.
- **Si se borra:** el streaming funciona, pero ningún botón de la barra responde, no hay chat ni iconos (los iconos se inyectan desde aquí).
- **Orden de carga obligatorio:** en el HTML va **después** de `firebase-config.js` y **antes** de `emisor.js`/`receptor.js`.

#### `public/style.css` (reescrito)
- **Contenía:** estilos básicos (fondo `#121212`, botones azules `#2d7dff`).
- **Ahora:** variables de tema → base → superficies (`.panel`) → layout (`.app`, `.layout`) → encabezado → tarjetas → escenario → chat → barra → tooltips/popovers/diálogo → responsive → movimiento reducido.
- **Si se modifica mal:** al ser CSS, nunca rompe el streaming; como mucho rompe la apariencia.

#### `public/emisor/index.html` y `public/receptor/index.html` (reescritos)
- **IDs que NO se deben cambiar** (los usa la lógica original):
  - Emisor: `localVideo`, `startBtn`, `stopBtn`, `status`. Nuevo: `stageVideo`.
  - Receptor: `remoteVideo`, `connectBtn`, `disconnectBtn`, `status`. Nuevo: `localVideo` (vista local).
  - Interfaz: `chatPanel`, `chatList`, `chatForm`, `chatInput`, `meTile`, `peopleGrid`, `stage`, `liveBadge`, `themeSelect`, `reactionsLayer` (capa de reacciones dentro de `#stage`), `screenPill` (etiqueta "Pantalla compartida"), etc.
- **Orden de scripts:** Firebase app → Firebase database → `firebase-config.js` → `gomlive-ui.js` → script de la página.

#### `public/emisor/emisor.js` (ganchos)
- Se añadió: `stageVideo`, llamadas a `GomliveUI.*` en `start()`, `stop()` y `handleNewViewer()`; nombre del moderador en `rooms/gomlive/host`; funciones nuevas `syncMediaControls`, `toggleTrack`, `replaceOutgoingVideo`, `toggleScreenShare`, `stopScreenShare`, `publishSharing`; la tabla `SCREEN_ERRORS`; y `GomliveUI.init({...})` al final.
- Si el navegador no tiene `getDisplayMedia` (móviles), el botón Compartir queda deshabilitado con su explicación.
- **Corrección:** antes `viewersRef.off()` sin argumentos borraba **todos** los listeners de esa ruta, incluidos los de la interfaz, y la lista de participantes quedaba congelada al detener. Ahora se guarda el callback (`onViewerAdded`, `onViewerRemoved`) y se quita solo ese.

#### `public/receptor/receptor.js` (ganchos)
- Se añadió: registro con nombre (`viewerRef.update({ ready: true, name })`), `GomliveUI.setStageActive`, `GomliveUI.setSelfViewer`, `toggleRemoteAudio`, `togglePreview` y `GomliveUI.init`.
- **Correcciones:** (1) el mismo problema de `.off()` en `rooms/gomlive/active` (ahora `onActiveChange`); (2) el estado quedaba en "Estableciendo conexión…" aunque ya estuviera conectado.

---

## 3. Componentes principales (código importante)

### 3.1 Estructura de tres columnas
**Ubicación:** `style.css` → `.layout` (~línea 145)
```css
.layout {
  display: grid;
  grid-template-columns: minmax(230px, 22.5fr) minmax(0, 51.5fr) minmax(290px, 26fr);
  gap: 14px;
  min-height: 0;
}
```
**Explicación:** un grid de 3 columnas: participantes, moderador y chat. `fr` reparte el espacio proporcionalmente (22.5 / 51.5 / 26). `minmax(230px, …)` impide que la columna baje de 230 px. La central usa `minmax(0, …)` para que el video pueda encogerse sin desbordar.
**Justificación:** Grid permite controlar filas y columnas a la vez; con proporciones en `fr` el diseño escala en cualquier monitor.
**Modificación posible:** cambiar `22.5fr` / `51.5fr` / `26fr`.

Además, `.app` es otro grid con 3 filas: encabezado, contenido y barra (`grid-template-rows: auto minmax(0, 1fr) auto`).

### 3.2 Mi cámara destacada ("Yo")
**Ubicación:** `index.html` → `<div class="tile tile-me" id="meTile">` (primer hijo de `<aside class="people panel">`); `style.css` → `.tile-me`
```css
.tile-me {
  flex: none;
  aspect-ratio: 16 / 10.5;
  border: 2px solid var(--a);
  box-shadow: 0 0 calc(10px * var(--g)) rgba(var(--a-rgb), .3);
}
```
**Explicación:** es la primera tarjeta de la columna izquierda, por eso queda arriba a la izquierda. Borde con el color de acento `--a` (verde en el tema Neon) y un brillo suave que se apaga con el botón del sol. `aspect-ratio` mantiene la proporción de video. El `<video>` interno tiene la clase `.mirror` (`transform: scaleX(-1)`) para verse como un espejo.
**Cuándo muestra video:** `GomliveUI.setSelfVideo(true)` añade la clase `.has-video`; sin ella se ve el avatar (`.tile-ph`).
- Emisor: cámara real (`localVideo.srcObject = localStream` en `start()`).
- Receptor: vista local opcional con el botón Cámara (`togglePreview`). **No se transmite.**

### 3.3 Tarjetas de participantes
**Ubicación:** `gomlive-ui.js` → `watchViewers()` y `renderPeople()`; `style.css` → `.people-grid`, `.tile-peer`
```js
function watchViewers() {
  const ref = db.ref(ROOM_PATH + '/viewers');
  ref.on('child_added', (snap) => upsertParticipant(snap.key, { name: snap.val()?.name || 'Espectador' }));
  ...
  ref.on('child_removed', (snap) => removeParticipant(snap.key));
}
```
**Explicación:** la lista sale del mismo nodo `viewers` que usa WebRTC: cada espectador real es una tarjeta. `renderPeople()` dibuja hasta `MAX_TILES = 6` y el resto como "+N participantes". En el emisor, `setParticipantState` pinta el estado real de la conexión (`connected`, `failed`…) mediante `data-state`.
**Limitación honesta:** los espectadores **no envían** cámara ni audio (la arquitectura es 1:N), por eso sus tarjetas muestran avatar con iniciales y micrófono en rojo.

### 3.4 Video central del moderador
**Ubicación:** `index.html` → `<section class="stage" id="stage">`; `style.css` → `.stage`, `.stage video`
```css
.stage video {
  position: absolute; inset: 0;
  width: 100%; height: 100%;
  object-fit: contain;
  ...
  opacity: 0;
}
.stage.has-video video { opacity: 1; }
```
**Explicación:** el video ocupa todo el contenedor. `object-fit: contain` muestra la imagen completa sin recortar, importante al compartir pantalla. Mientras no hay video se ve `.stage-empty` con el botón Iniciar/Conectar. Encima van capas `position: absolute`: estado + espectadores (`.stage-top`) y etiqueta Moderador + controles (`.stage-bottom`).
- Emisor: `stageVideo` (lo que ven los espectadores).
- Receptor: `remoteVideo` (el stream recibido).

### 3.5 Panel del chat
**Ubicación:** `index.html` → `<aside class="chat panel" id="chatPanel">`; `style.css` → `.chat`
```css
.chat {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  grid-template-columns: minmax(0, 1fr);
  ...
}
```
**Explicación:** 3 filas: encabezado, mensajes (`1fr`, con scroll propio en `.chat-list`) y caja de escritura fija abajo. `grid-template-columns: minmax(0, 1fr)` es la **corrección del botón Enviar** (ver sección 4).

### 3.6 Barra inferior de controles
**Ubicación:** `index.html` → `<nav class="dock">`; `style.css` → `.dock`, `.dock-btn`, `.dock-ic`, `.share-btn`
```css
.dock {
  justify-self: center;
  width: min(960px, 100%);
  display: flex; align-items: center; gap: 18px;
  border-radius: var(--r-xl);
  border: 1px solid var(--line);
  background: var(--panel-2);
}
```
**Explicación:** Flexbox horizontal y centrado, con un borde fino. Todos los botones (`.dock-ic`) tienen el mismo fondo neutro: el color solo indica estado. Micrófono y cámara encendidos se ven en verde (`[aria-pressed="true"]`) y apagados en rojo (`.is-off`). `.share-btn` va separado por `.dock-sep`, a la derecha, con borde celeste.

### 3.7 Cómo responden los botones (delegación de eventos)
**Ubicación:** `gomlive-ui.js` → `bindActions()` y `setControl()`
```js
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  ...
  const fn = actions[name] || builtInActions[name];
  if (fn) fn(btn);
});
```
**Explicación:** un único listener en el documento. Cada botón dice qué hace con `data-action="mic"`, `"cam"`, `"share"`… Las acciones de streaming las registra cada página en `GomliveUI.init({ actions })`; las de interfaz (`theme`, `settings`, `emoji`, `fullscreen`, `glow`) están en `builtInActions`.
**Justificación:** el mismo botón de micrófono aparece dos veces (barra y video) y ambos funcionan sin duplicar código. `setControl('mic', { on })` actualiza a la vez todos los botones e indicadores (`data-state-of`) de esa acción.
Un botón con `aria-disabled="true"` no ejecuta nada: muestra un aviso con `data-reason` (ej.: "Solo el moderador puede compartir pantalla").

### 3.8 Cámara y micrófono (emisor)
**Ubicación:** `emisor.js` → `toggleTrack(kind)`
```js
const tracks = kind === 'audio' ? localStream.getAudioTracks() : localStream.getVideoTracks();
// enabled = false envía silencio / imagen negra a todos los espectadores sin renegociar.
tracks.forEach((track) => { track.enabled = !track.enabled; });
syncMediaControls();
```
**Explicación:** no se cierra la cámara ni la conexión; solo se desactiva la pista. Los espectadores reciben negro o silencio y la conexión sigue viva. `syncMediaControls()` pone el botón en rojo (`.is-off`).
**En el receptor:** micrófono deshabilitado (no transmite audio), cámara = vista local, botón de volumen = `remoteVideo.muted`.

### 3.9 Compartir pantalla (emisor)
**Ubicación:** `emisor.js` → `toggleScreenShare()`, `replaceOutgoingVideo()`, `stopScreenShare()`
```js
const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
if (sender) sender.replaceTrack(track)...
```
**Explicación:** `getDisplayMedia` obtiene la pantalla y `replaceTrack` cambia la pista de video en **cada** conexión sin volver a negociar. Si el usuario pulsa "Dejar de compartir" del navegador, `screenTrack.onended` vuelve a la cámara. Los espectadores que entran mientras se comparte reciben la pantalla (`handleNewViewer` usa `screenTrack` si existe). El detalle completo está en la sección 6.

### 3.10 Variables CSS y temas
**Ubicación:** `style.css` líneas 6–77; `gomlive-ui.js` → `THEMES`, `applyTheme`, `cycleTheme`, `initThemes`
```css
[data-theme="neon"] {
  --a-rgb: 57, 255, 136;   /* verde neón */
  --b-rgb: 0, 217, 255;    /* celeste eléctrico */
  --c-rgb: 152, 103, 255;  /* morado neón */
}
```
```js
function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  storage.set('gomlive.theme', theme.id);
  ...
}
```
**Explicación:** los colores se guardan como "R, G, B" para usarlos con transparencia: `rgba(var(--a-rgb), .4)`. Cada tema redefine las mismas variables. `applyTheme` cambia `<html data-theme="...">` y el CSS se recalcula solo. La elección se guarda en `localStorage` (`gomlive.theme`).
**Por qué no corta el streaming:** solo cambia un atributo y variables CSS; no toca los `<video>`, ni `srcObject`, ni las conexiones.
**Brillo neón:** se usa con moderación. Los pocos brillos que quedan (borde de "Yo", puntos de estado) usan `calc(10px * var(--g))`; el botón del sol (`applyGlow`) pone `[data-glow="off"]` → `--g: 0` y desaparecen. El destello del chat al llegar un mensaje no depende de `--g`.

| Variable | Uso |
|---|---|
| `--bg`, `--bg-2` | Fondo de la página |
| `--panel`, `--panel-2` | Fondo translúcido de paneles / barra y diálogos |
| `--a-rgb` | Acento principal: borde "Yo", "LIVE", micrófono, botón Enviar, destello del chat |
| `--b-rgb` | Celeste: borde del chat, cámara, compartir pantalla |
| `--c-rgb` | Morado: botón Tema, brillo del video central |
| `--r-xl`, `--r-lg`, `--r-md`, `--r-sm` | Radios: 14 / 12 / 10 / 8 px |
| `--danger` | Rojo: apagado, EN VIVO, errores |

### 3.11 Responsive
**Ubicación:** `style.css` → `@media (max-width: 1100px) and (min-width: 901px)` (tablet) y `@media (max-width: 900px)` (móvil); `gomlive-ui.js` → `isMobile()` y `setTab()`

- **Escritorio (más de 1100 px):** 3 columnas; la app ocupa exactamente la altura de la pantalla (`height: 100dvh`).
- **Tablet (901–1100 px):** `grid-template-areas: "stage chat" "people chat"` → video arriba, participantes debajo, chat a la derecha.
- **Móvil (900 px o menos)** (fragmento simplificado):
```css
.app { display: flex; flex-direction: column; }
.layout { display: contents; }
.stage { order: 1; } .mtabs { order: 2; } .people, .chat { order: 3; }
body[data-tab="people"] .chat { display: none; }
body[data-tab="chat"] .people { display: none; }
```
`display: contents` hace que los hijos de `.layout` pasen a ser hijos directos de `.app`, y así se pueden reordenar con `order` sin tocar el HTML. Participantes y chat se alternan con pestañas (`setTab`). Si llega un mensaje con la pestaña de chat oculta, aparece un contador (`setUnread`). La barra queda fija abajo (`position: fixed`).

### 3.12 Integración con el streaming original
```js
// emisor.js, final del archivo
GomliveUI.init({
  role: 'host',
  actions: {
    mic: () => toggleTrack('audio'),
    cam: () => toggleTrack('video'),
    share: () => toggleScreenShare()
  },
  onNameChange: (name) => { if (roomRef) roomRef.child('host/name').set(name); }
});
```
**Idea clave:** la interfaz no conoce WebRTC y WebRTC no conoce el diseño. Se comunican solo por:
- **WebRTC → UI:** `GomliveUI.setStageActive`, `setSelfVideo`, `setParticipantState`, `setControl`, `toast`.
- **UI → WebRTC:** las `actions` que cada página registra en `init`.

---

## 4. Funcionamiento del chat

### Respuestas directas

| Pregunta | Respuesta | Dónde |
|---|---|---|
| ¿Ya existía? | **No.** Se creó en el rediseño | — |
| Interfaz | `<aside class="chat panel" id="chatPanel">` con `#chatList` (mensajes) y `#chatForm` | ambos `index.html`; estilos `.chat*`, `.msg*`, `.send-btn` en `style.css` |
| Campo de texto | `<input id="chatInput" maxlength="300">` dentro de `.chat-input` | `index.html` |
| Al presionar Enviar | Se dispara el evento `submit` de `#chatForm` (con el botón o con Enter, porque es `type="submit"`) | `gomlive-ui.js` → `initChat()` |
| Cómo se obtiene el texto | `const text = input.value.trim();` Si queda vacío, no envía | `initChat()` |
| Cómo se envía | `socket.send(JSON.stringify({ type: 'message', uid: clientId, name: myName, role, text }))` | `initChat()` |
| Mecanismo | **WebSocket**: conexión permanente y bidireccional entre el navegador y nuestro servidor, en `ws://<host>/chat`. Mensajes en JSON | `gomlive-ui.js`, `chat-server.js` |
| ¿Interviene el servidor? | **Sí.** `chat-server.js` (`wss.on('connection')` → `ws.on('message')`) recibe el JSON, valida tipo y texto, recorta nombre (24) y texto (300), pone `id` y `ts: Date.now()`, lo guarda en `history` y llama a `broadcast()` | `chat-server.js` |
| Cómo se reparte | `broadcast()` recorre `wss.clients` y envía el mensaje a cada conexión abierta, **incluido quien lo escribió** | `chat-server.js` |
| Cómo recibe | `socket.addEventListener('message', …)`: si `type === 'history'` → `renderHistory()`; si `type === 'message'` → `renderMessage()` + `flashChat()` | `initChat()` |
| Cómo se dibuja | `renderMessage(key, m)` crea `<li class="msg">` con avatar, nombre, hora y texto usando `textContent` (evita inyección de HTML). `.is-own` si `m.uid === clientId`; `.is-host` si lo escribió el moderador | `gomlive-ui.js` |
| Efecto luminoso | `flashChat()` + CSS `.chat::after` / `@keyframes chat-flash` | ver abajo |
| ¿Por qué no sobresale Enviar? | `.chat { grid-template-columns: minmax(0, 1fr) }` + `.chat-input input { width: 100% }` | `style.css` |
| ¿Afecta al streaming? | No. Son conexiones independientes: el video viaja por WebRTC P2P y el chat por WebSocket. Se verificó: con el servidor apagado el video siguió reproduciéndose | — |
| Si se pierde la conexión | `socket` dispara `close` → `setChatOnline(false)`: el campo dice "Reconectando con el chat..." y Enviar se desactiva. `connectChat()` reintenta tras 1 s, 2 s, 4 s… hasta 10 s. Al volver, el servidor reenvía el historial. Lo escrito sin conexión **no** se guarda (aparece un aviso) | `initChat()` |
| Conexiones muertas | Cada 30 s el servidor hace `ping`; la que no responde con `pong` se cierra (`terminate`) | `chat-server.js` |
| Si un participante se va | Su nodo en `viewers` se borra (`onDisconnect().remove()`) y desaparece su tarjeta. **Sus mensajes se quedan** en el chat | `receptor.js`, `watchViewers()` |
| ¿Se guardan los mensajes? | **Solo en la memoria del servidor** (arreglo `history`, últimos 60). Quien se conecta los recibe en el mensaje `history`. Se pierden al reiniciar el servidor (`npm start`). Ya no se borran al iniciar o detener la transmisión | `chat-server.js` |

### Flujo completo

```text
Al cargar la página
  connectChat()  →  new WebSocket('ws://<host>/chat')
          ↓
  servidor: wss.on('connection')  →  ws.send({ type: 'history', messages })
          ↓
  cliente: renderHistory(messages)          (sin destello)

Al enviar
Usuario escribe en #chatInput
          ↓
Enter o botón .send-btn (type="submit")
          ↓
evento 'submit' de #chatForm  →  initChat() en gomlive-ui.js
          ↓  e.preventDefault(); text = input.value.trim()
socket.send(JSON.stringify({ type: 'message', uid, name, role, text }))
          ↓   ── WebSocket ──►
chat-server.js: ws.on('message')
          ↓  JSON.parse → valida → { id, uid, name, role, text, ts: Date.now() }
history.push(message)   (máximo 60)
          ↓
broadcast({ type: 'message', message })  →  a TODOS los wss.clients abiertos
          ↓   ◄── WebSocket ──
cliente: socket 'message'  →  renderMessage(message.id, message)  →  <li class="msg">
          ↓
flashChat()  →  #chatPanel.flash  →  .chat.flash::after (0.8 s)
     └─ en móvil con el chat oculto → setUnread(unread + 1)
```

### La animación luminosa paso a paso
```js
function flashChat() {
  const panel = $('#chatPanel');
  panel.classList.remove('flash');
  void panel.offsetWidth; // fuerza reflow para reiniciar la animación
  panel.classList.add('flash');
}
```
```css
.chat::after { content: ''; position: absolute; inset: -2px; border: 2px solid var(--a); box-shadow: ...; opacity: 0; pointer-events: none; }
.chat.flash::after { animation: chat-flash .8s ease-out; }
@keyframes chat-flash { 0% { opacity: 0; } 18% { opacity: 1; } 100% { opacity: 0; } }
```
1. `::after` es una capa invisible del tamaño del panel, con borde y brillo verdes.
2. Al añadir `.flash`, su opacidad sube a 1 (al 18 % del tiempo) y baja a 0 en 0.8 s.
3. Quitar la clase, leer `offsetWidth` y volver a ponerla reinicia la animación aunque lleguen mensajes seguidos.
4. `pointer-events: none` → no bloquea los clics.
5. Con "reducir movimiento" activado en el sistema operativo se usa `chat-flash-calm` (aparece y desaparece sin fundido).

**¿Por qué no brilla al abrir la página?** Porque el servidor manda el historial en un mensaje distinto (`type: 'history'`), que se dibuja con `renderHistory()` sin llamar a `flashChat()`. Solo los mensajes `type: 'message'` (los que llegan en vivo) iluminan el panel.

### El protocolo del chat (mensajes JSON)

| Dirección | Mensaje | Cuándo |
|---|---|---|
| Servidor → cliente | `{ "type": "history", "messages": [ … ] }` | Apenas se conecta |
| Cliente → servidor | `{ "type": "message", "uid", "name", "role", "text" }` | Al presionar Enviar |
| Servidor → todos | `{ "type": "message", "message": { "id", "uid", "name", "role", "text", "ts" } }` | Por cada mensaje válido |

### Código clave del servidor (`chat-server.js`)
```js
const wss = new WebSocketServer({ server, path: '/chat', maxPayload: 4096 });

ws.on('message', (raw) => {
  ...
  const message = { id: nextId++, uid, name, role, text, ts: Date.now() };
  history.push(message);
  if (history.length > HISTORY_LIMIT) history.shift();
  broadcast({ type: 'message', message });
});
```
- `server` es el mismo servidor HTTP de Express: página y chat comparten el puerto 3000.
- `maxPayload: 4096` rechaza mensajes de más de 4 KB.
- El servidor **no confía en el cliente**: recorta el texto, el nombre y el rol, y pone su propia hora (`Date.now()`).

### La corrección del botón Enviar
- **Problema:** `.chat` era un grid con solo filas definidas, así que su columna implícita era `auto`. Una columna `auto` no se encoge por debajo del ancho mínimo de su contenido, y el `<input>` tiene un ancho propio de unos 20 caracteres. A 1280 px el formulario medía 347 px en un panel de 316 px.
- **Solución:** `grid-template-columns: minmax(0, 1fr)` en `.chat` y `width: 100%` en `.chat-input input`.
- **Verificado:** a 320, 375, 1000, 1101, 1280 y 1920 px el botón queda 15 px dentro del borde.

---

## 5. Reacciones en vivo

**Qué hace:** cualquier participante pulsa ❤️ 👍 😂 😮 🔥 y la reacción flota sobre el video de **todos**, con el nombre de quien reaccionó.

**Dónde se pulsan:** botón **Emojis** de la barra → fila "Reaccionar en vivo" (arriba del panel). La fila de abajo sigue siendo "Emojis para el chat", que solo los inserta en el texto.

### Flujo
```text
Clic en [data-reaction]  →  sendReaction(emoji)             gomlive-ui.js
   ├─ ¿emoji en REACTIONS? ¿socket abierto? ¿menos de 5 en 2 s? (límite local)
   └─ chatSocket.send({ type: 'reaction', emoji, uid, name })   (NO se dibuja todavía)
          ↓  ── mismo WebSocket del chat ──►
chat-server.js → handleReaction(ws, data)
   ├─ ¿emoji en la lista blanca REACTIONS?          no → se descarta
   ├─ ¿más de 5 en 2 s en ESTA conexión?           sí → se descarta + aviso 'reaction-limit' (1 por ventana)
   └─ broadcast({ type: 'reaction', reaction: { id: 'r7', emoji, uid, name, ts } })   (NO va al historial)
          ↓  ◄── a todos, incluido quien reaccionó ──
socket 'message' → showReaction(reaction)
   ├─ ¿id ya visto? (seenReactions)                 sí → se ignora (sin duplicados)
   ├─ si hay 30 flotando, se borra la más antigua (MAX_FLOATING)
   └─ <div class="reaction"> en #reactionsLayer → @keyframes reaction-float (2.6 s) → animationend → remove()
```

### Decisiones y por qué

| Decisión | Por qué |
|---|---|
| Reutilizar el WebSocket del chat | Ya conecta a todos; no hace falta otra conexión ni otra tecnología |
| El cliente **no** dibuja su reacción al enviarla; espera a que vuelva del servidor | Una sola fuente de verdad: la reacción aparece una vez y en el mismo orden para todos |
| `id` asignado por el servidor + `seenReactions` en el cliente | Si un mismo evento llegara dos veces, se dibuja una sola |
| Lista blanca en **el servidor** | El cliente se puede manipular desde la consola; el servidor no |
| Límite 5 cada 2 s **por conexión**, en el servidor (y también en el cliente, para avisar antes) | Evita que alguien llene la pantalla; el límite del cliente es solo comodidad |
| No guardar reacciones en `history` | Son momentáneas; si se guardaran, se repetirían al reconectar |
| Capa `#reactionsLayer` **dentro de `#stage`** con `pointer-events: none` | Se ve también en pantalla completa (lo que se agranda es `#stage`) y no bloquea los botones del video |
| Animar solo `transform` y `opacity` | El navegador lo hace en la tarjeta gráfica sin recalcular el diseño de la página: no afecta al video |
| Máximo 30 en pantalla + `remove()` al terminar | No se acumulan elementos (sin fugas de memoria) |
| `prefers-reduced-motion` → `reaction-fade` | Con "reducir movimiento" activado, aparecen y se desvanecen sin subir |

### Protocolo (JSON por el WebSocket)

| Dirección | Mensaje |
|---|---|
| Cliente → servidor | `{ "type": "reaction", "emoji": "🔥", "uid", "name" }` |
| Servidor → todos | `{ "type": "reaction", "reaction": { "id": "r7", "emoji", "uid", "name", "ts" } }` |
| Servidor → quien se excedió | `{ "type": "reaction-limit" }` (una vez por ventana de 2 s) |

### Código clave del servidor
```js
function handleReaction(ws, data) {
  if (!REACTIONS.has(data.emoji)) return;
  const now = Date.now();
  ws.reactionTimes = ws.reactionTimes.filter((t) => now - t < REACTION_WINDOW);
  if (ws.reactionTimes.length >= REACTION_LIMIT) { /* aviso y descarte */ return; }
  ws.reactionTimes.push(now);
  broadcast({ type: 'reaction', reaction: { id: 'r' + nextReactionId++, emoji: data.emoji, ... } });
}
```

**El chat no cambió:** el servidor separa por `type` (`handleMessage` / `handleReaction`) y el cliente también (`'message'` ilumina el chat; `'reaction'` solo anima el video).

---

## 6. Funcionamiento del streaming y de la pantalla compartida

```text
EMISOR start()
  getUserMedia → localStream → localVideo + stageVideo
  roomRef.remove(); active = true; host = {name}
  viewersRef.on('child_added') ─────────────┐
                                            │
RECEPTOR connect()                           │
  ¿active? → viewers.push() → update({ready, name}) ──► child_added
                                            │
EMISOR handleNewViewer(viewerId)  ◄─────────┘
  new RTCPeerConnection → addTrack(cámara o pantalla)
  createOffer → viewers/{id}/offer
RECEPTOR  offer → setRemoteDescription → createAnswer → viewers/{id}/answer
EMISOR    answer → setRemoteDescription
AMBOS     ICE candidates en callerCandidates / calleeCandidates
          → conexión P2P → pc.ontrack → remoteVideo
```

- **Detener (emisor `stop()`):** detiene la pantalla compartida si estaba activa, cierra todas las conexiones, apaga cámara y micrófono y borra la sala. Los receptores ven `active = null` y ejecutan `disconnect()`.
- **Cerrar pestaña:** `onDisconnect().remove()` limpia `active`/`host` (emisor) o el nodo del espectador.
- **STUN solamente** (`RTC_CONFIG`): entre redes muy restrictivas puede fallar; haría falta un servidor TURN, que no está configurado.

### Compartir pantalla y volver a la cámara

```text
Botón Compartir (data-action="share") → toggleScreenShare()                emisor.js
  ├─ ¿ya comparte? → stopScreenShare()
  ├─ ¿selector abierto? (screenPending) → ignora el doble clic
  ├─ ¿no hay transmisión? → aviso
  └─ getDisplayMedia({ video: true, audio: false })
        ├─ error → NotAllowedError (canceló): silencio · otros: mensaje de SCREEN_ERRORS
        └─ ok → screenTrack.contentHint = 'detail'
               screenTrack.onended = stopScreenShare     (botón "Dejar de compartir" del navegador)
               replaceOutgoingVideo(screenTrack)         (replaceTrack en cada espectador)
               stageVideo muestra la pantalla
               publishSharing(true) → rooms/gomlive/host/sharing = true → etiqueta en todos

stopScreenShare()
  screenStream.getTracks().forEach(t => t.stop())     (libera TODAS las pistas de la captura)
  replaceOutgoingVideo(pista de la cámara)             (vuelve la cámara sin reconectar)
  publishSharing(false)
```

| Pregunta | Respuesta |
|---|---|
| ¿Se pierde el audio al compartir? | No: solo se reemplaza el emisor de **video**; el micrófono sigue en su propio emisor. Se verificó que el id de la pista de audio no cambia |
| ¿Se comparte el audio de la pantalla? | No (`audio: false`). Sumarlo al micrófono exigiría mezclar con Web Audio o renegociar; se decidió no arriesgar el audio |
| ¿Cómo saben los espectadores que es una pantalla? | El emisor escribe `host/sharing`; `watchRoom()` lo lee y `setScreenSharing()` muestra "Pantalla compartida" y aplica `.stage.is-screen` |
| ¿Qué pasa si se cierra la pestaña del emisor? | `host` tiene `onDisconnect().remove()`: la etiqueta desaparece sola |
| ¿Y en el celular? | `getDisplayMedia` no existe en la mayoría de los móviles: el botón queda deshabilitado y explica por qué |
| Restricción importante | Solo funciona en `localhost` o `https`. El moderador debe abrir **http://localhost:3000/emisor** en su propia computadora |

---

## 7. Personalización: tus decisiones y su fundamento

Las decisiones de la izquierda vienen de **tu bosquejo**. La columna derecha es un **fundamento de UX que puedes usar para defenderlas**, no una justificación tuya inventada. Si tuviste otra razón, usa la tuya.

| Tu decisión (bosquejo) | Fundamento de UX propuesto |
|---|---|
| Tema oscuro predominante | El video es lo más brillante de la pantalla y atrae la vista; el fondo oscuro reduce el cansancio visual en sesiones largas |
| Verde, celeste y morado como acentos | Tres acentos con funciones distintas: verde = "yo / activo / enviar", celeste = comunicación (chat, compartir), morado = personalización (tema). El color comunica función |
| Bordes redondeados | Agrupan visualmente cada zona y suavizan una interfaz con mucho contenido |
| Transparencias moderadas | Dan profundidad sin perder legibilidad: los paneles tienen 92 % de opacidad y solo los controles sobre el video usan desenfoque |
| Mi cámara arriba a la izquierda | La lectura empieza arriba a la izquierda: el usuario se ubica primero a sí mismo |
| Participantes en la columna izquierda | Agrupa a todas las personas en una zona, separada del contenido principal |
| Moderador al centro | Jerarquía: el elemento más importante es el más grande y está en el centro |
| Chat permanente a la derecha | Se puede leer el chat sin tapar ni mover el video |
| Notificación luminosa | Avisa de un mensaje nuevo sin sonido y sin interrumpir; dura 0.8 s para no distraer |
| Barra inferior unificada | Todos los controles en un solo lugar predecible |
| Compartir pantalla a la derecha | Es una acción distinta (cambia lo que ven todos), por eso va separada de los controles personales |

### Decisiones técnicas que propuse yo (Claude), para que las distingas
- Primero el chat reutilizaba Firebase; luego, a tu pedido, se pasó a un servidor WebSocket propio (`chat-server.js` con la librería `ws`), montado sobre el mismo servidor de Express.
- Separar la interfaz en `gomlive-ui.js` y conservar los IDs originales.
- Colores en formato `R, G, B` para combinarlos con transparencias.
- `--g` para apagar los brillos y el modo de movimiento reducido.
- Tres temas (Neon, Purple, Ocean) y sus valores exactos.
- Usar `replaceTrack` para compartir pantalla.
- Pestañas en móvil y botones deshabilitados que explican por qué no están disponibles.
- Ajuste de sobriedad visual (pedido por ti para que no parezca una plantilla generada): se quitaron el brillo permanente de casi todos los elementos, el desenfoque de vidrio en los paneles, los degradados de botones y bordes, las manchas de color del fondo y los círculos de colores distintos en la barra. Los radios bajaron a 14/12/10/8 px y la tipografía pasó de Inter/Exo 2 a IBM Plex Sans y Plex Mono. Se mantuvieron tus decisiones: acentos verde/celeste/morado, bordes redondeados, distribución, borde verde de "Yo" y el destello del chat.

---

## 8. Guía de modificaciones rápidas

Después de cada cambio: guarda, recarga con **Ctrl + F5** y, si es visual, revisa con DevTools (F12). Los archivos de `public/` no requieren reiniciar el servidor. **Si cambias `server.js` o `chat-server.js`, detén el servidor (Ctrl + C) y vuelve a ejecutar `npm start`.**

Cambios del chat por WebSocket: cuántos mensajes se guardan → `HISTORY_LIMIT` en `chat-server.js`; largo máximo → `MAX_TEXT` (y el `maxlength="300"` del `<input>`); cada cuánto se detectan conexiones caídas → `PING_INTERVAL`.

| # | Modificación | Archivo / selector | Cambio de ejemplo | Resultado esperado y cómo comprobarlo |
|---|---|---|---|---|
| 1 | Cambiar el verde neón | `style.css`, `[data-theme="neon"]` → `--a-rgb` | `57, 255, 136` → `255, 170, 0` (naranja) | Se vuelven naranja el borde de "Yo", la palabra "LIVE", el micrófono, el botón Enviar y el destello del chat. Comprobar con el tema Neon activo |
| 2 | Tamaño del video principal | `style.css`, `.layout` → columna central | `minmax(0, 51.5fr)` → `minmax(0, 60fr)` | El video se ensancha y las columnas laterales se reducen. Para llenarlo recortando: `.stage video { object-fit: cover; }` |
| 3 | Columna de participantes | `style.css`, `.layout` → primera columna | `minmax(230px, 22.5fr)` → `minmax(260px, 28fr)` | Columna izquierda más ancha y tarjetas más grandes |
| 4 | Color del chat | `style.css`, `.chat` → `border` | `rgba(var(--b-rgb), .45)` → `rgba(var(--c-rgb), .45)` | Borde morado en lugar de celeste |
| 5 | Tamaño del botón Enviar | `style.css`, `.send-btn` y `.send-btn .i` | `width: 46px; height: 46px` → `40px`; icono `20px` → `18px`. Color: `background: var(--a)` | Botón más pequeño, siempre dentro del panel. Comprobar estrechando la ventana |
| 6 | Redondeado de paneles | `style.css`, `:root` → `--r-xl`, `--r-lg`, `--r-md` | `14px / 12px / 10px` → `20px / 16px / 12px` | Todos los paneles y tarjetas más redondeados a la vez |
| 7 | Duración del brillo | `style.css`, `.chat.flash::after` | `animation: chat-flash .8s ease-out` → `1.5s` | Brillo más largo. Comprobar enviando un mensaje desde otra pestaña |
| 8 | Mover un botón de la barra | `emisor/index.html` **y** `receptor/index.html`, dentro de `<div class="dock-group">` | Cortar el bloque `<button class="dock-btn" data-action="theme">…</button>` y pegarlo antes del de micrófono | El botón cambia de lugar y sigue funcionando, porque `bindActions` lo encuentra por `data-action`. No hay que tocar JS |
| 9 | Nombre de la plataforma | Ambos `index.html`: `<title>`, `aria-label` del `.brand` y `<span class="brand-name">GOM<span>LIVE</span></span>` | Cambiar las tres cosas en los **dos** archivos | Nuevo nombre en el encabezado; el `<span>` interno mantiene el color verde y la letra monoespaciada |
| 10 | Tarjetas de participantes | `style.css`, `.tile-peer` → `aspect-ratio`; `.people-grid` → `grid-template-columns`; `gomlive-ui.js` → `MAX_TILES` | `4 / 3` → `16 / 9`; `repeat(2, …)` → `repeat(3, …)`; `6` → `9` | Tarjetas más bajas, 3 por fila y más visibles antes de "+N" |
| 11 | Tema predeterminado | `gomlive-ui.js`, `initThemes()` → `storage.get('gomlive.theme', 'neon')`; y `<html data-theme="neon">` en ambos HTML | `'neon'` → `'ocean'` | Abre en Ocean. **Ojo:** el navegador recuerda la última elección; para probarlo usa una ventana de incógnito o ejecuta `localStorage.removeItem('gomlive.theme')` en la consola |
| 12 | Breakpoint responsive | `style.css`: `@media (max-width: 900px)`, `@media (max-width: 1100px) and (min-width: 901px)`, `@media (min-width: 1101px) …`; **y** `gomlive-ui.js` → `isMobile()` (`'(max-width: 900px)'`) | `900px` → `768px` (y `901px` → `769px`) | La vista móvil empieza en 768 px. **Cambia los cuatro lugares** o el contador de mensajes no leídos fallará. Comprobar con el modo dispositivo de DevTools (Ctrl+Shift+M) |
| 13 | Duración de la animación de reacciones | `style.css`, `.reaction` → `animation: reaction-float 2.6s` | `2.6s` → `4s` | Las reacciones suben más despacio. Comprobar con dos pestañas |
| 14 | Tamaño de las reacciones | `style.css`, `.reaction-emoji` → `font-size` | `2.2rem` → `3rem` | Emojis más grandes sobre el video |
| 15 | Cuántas reacciones se permiten | `chat-server.js` → `REACTION_LIMIT` / `REACTION_WINDOW` **y** `gomlive-ui.js` → las mismas constantes | `5` → `3` | Más estricto. **Reiniciar `npm start`** (cambia el servidor) |
| 16 | Agregar o quitar un emoji de reacción | `REACTIONS` en `chat-server.js` **y** en `gomlive-ui.js` (las dos listas iguales) | Agregar `'👏'` a ambas | Aparece en la fila y el servidor lo acepta. Si solo se cambia el cliente, el servidor lo descarta (lista blanca) |
| 17 | Texto de la etiqueta de pantalla | Ambos `index.html` → `#screenPill` | `Pantalla compartida` → `Compartiendo escritorio` | Nuevo texto sobre el video al compartir |

**Cambios a evitar durante la evaluación:** renombrar un `id`; cambiar el orden de los `<script>`; tocar `handleNewViewer`, `connect`, `replaceOutgoingVideo` o las rutas de Firebase; cambiar `REACTIONS` en un solo archivo.

---

## 9. Preguntas y respuestas

1. **¿Por qué CSS Grid para la interfaz?** Porque es una distribución en dos dimensiones: filas (encabezado, contenido, barra en `.app`) y columnas (`.layout`). Con `fr` y `minmax` las proporciones se mantienen en cualquier pantalla.
2. **¿Diferencia entre Grid y Flexbox?** Grid organiza en filas y columnas a la vez; Flexbox alinea en una sola dirección. Usé Grid para la estructura (`.app`, `.layout`, `.chat`, `.people-grid`) y Flexbox para filas de elementos (`.topbar`, `.chat-form`, `.dock`).
3. **¿Cómo funciona el responsive?** Con media queries en `style.css`: tablet a 1100 px y móvil a 900 px. En móvil, `.layout { display: contents }` y `order` reordenan sin cambiar el HTML, y las pestañas (`setTab`) alternan participantes y chat.
4. **¿Cómo se integra el streaming con la interfaz?** `emisor.js` y `receptor.js` conservan su lógica y avisan a la interfaz con `GomliveUI.setStageActive`, `setSelfVideo`, etc. La interfaz llama a sus funciones por medio de las `actions` registradas en `GomliveUI.init`.
5. **¿Por qué el chat está separado del video?** Visualmente, para leer sin tapar el video. Técnicamente, porque va por su propio WebSocket y no por WebRTC: si el video falla, el chat sigue funcionando, y se puede chatear antes de conectarse.
6. **¿Cómo se envían los mensajes?** En el `submit` de `#chatForm` se lee `input.value.trim()` y se envía un JSON con `socket.send(...)`. El servidor (`chat-server.js`) lo valida, le pone id y hora con `Date.now()` y lo reenvía a todos con `broadcast()`.
7. **¿Cómo se detecta un mensaje nuevo?** Con el evento `message` del WebSocket. Si el JSON trae `type: 'message'` es nuevo (se dibuja y brilla); si trae `type: 'history'` es el historial inicial (se dibuja sin brillo).
8. **¿Cómo funciona la animación luminosa?** `flashChat()` reinicia la clase `.flash`, que activa una animación de opacidad de 0.8 s en el pseudo-elemento `.chat::after`, el borde brillante del panel.
9. **¿Qué hacen las variables CSS?** Centralizan colores, radios e intensidad del brillo. Al cambiar una variable cambian todos los elementos que la usan; los temas son conjuntos distintos de las mismas variables.
10. **¿Cómo funciona el selector de temas?** `applyTheme(id)` pone `<html data-theme="ocean">` y lo guarda en `localStorage`. Los bloques `[data-theme="…"]` del CSS redefinen las variables.
11. **¿Qué pasa al apagar la cámara?** `toggleTrack('video')` pone `track.enabled = false`: los espectadores ven negro, la conexión no se corta y el botón se pone en rojo. Al volver a activarla, la imagen regresa sin reconectar.
12. **¿Qué pasa si se desconecta un participante?** `onDisconnect().remove()` borra su nodo en `viewers`; el emisor recibe `child_removed`, cierra esa `RTCPeerConnection` (`removeViewer`) y su tarjeta desaparece. Los demás no se ven afectados.
13. **¿Cómo se conserva el streaming al cambiar de tema?** El tema solo cambia un atributo y variables CSS; no recrea los `<video>` ni toca las conexiones. Se comprobó: la conexión siguió en `connected` después de cambiar de tema.
14. **¿Qué partes fueron personalizadas?** La distribución, la identidad y los colores salen de mi bosquejo: cámara propia arriba a la izquierda, moderador al centro, chat a la derecha, barra unificada, notificación luminosa y compartir pantalla separado. *(Añade aquí lo que tú ajustaste personalmente.)*
15. **¿Cómo cambiaría rápidamente un color o un tamaño?** Colores: la variable `--a-rgb`, `--b-rgb` o `--c-rgb` del tema en `style.css`. Tamaños: los `fr` de `.layout` para las columnas, o `width`/`height` del selector concreto (ej. `.send-btn`).

16. **¿Cómo funcionan las reacciones en tiempo real?** Por el mismo WebSocket del chat con `type: 'reaction'`. El servidor (`handleReaction`) valida el emoji contra una lista blanca, limita a 5 cada 2 s por conexión y las reenvía a todos con `broadcast`, sin guardarlas. Cada navegador las anima con `showReaction()`.
17. **¿Cómo evitan duplicados?** El cliente no dibuja su reacción al enviarla: espera a que el servidor la devuelva con un `id`. Además, `seenReactions` ignora un `id` repetido, y las reacciones no están en el historial, así que no se repiten al reconectar.
18. **¿Cómo limitan el spam?** En el servidor, con una ventana deslizante: cada conexión guarda las horas de sus últimas reacciones (`ws.reactionTimes`); si ya hay 5 en los últimos 2 s, la nueva se descarta y se avisa una vez. El cliente tiene el mismo límite para avisar antes, pero el que cuenta es el del servidor.
19. **¿Por qué la animación no afecta al video?** Solo anima `transform` y `opacity`, que la tarjeta gráfica compone sin recalcular la página; hay un máximo de 30 elementos y cada uno se borra al terminar.
20. **¿Cómo cambian de cámara a pantalla sin cortar la transmisión?** Con `RTCRtpSender.replaceTrack()`: se reemplaza la pista de video en cada conexión existente sin renegociar SDP. El audio va en otro emisor y no se toca.
21. **¿Qué pasa si el usuario pulsa "Dejar de compartir" en el navegador?** La pista dispara `ended` → `stopScreenShare()`: detiene todas las pistas de la captura, vuelve a la cámara con `replaceTrack` y quita la etiqueta en todos (`host/sharing = false`).
22. **¿Qué errores contemplaron al compartir pantalla?** `NotAllowedError` (canceló, no se muestra nada), `NotReadableError`, `NotFoundError`, `AbortError` y `SecurityError` (mensajes claros en `SCREEN_ERRORS`), doble clic con el selector abierto (`screenPending`) y que la transmisión se detenga mientras el selector está abierto.

**Preguntas extra que podrían surgir**
- *¿Es P2P si usan Firebase?* Sí: el video va directo entre navegadores. Firebase solo transporta los mensajes para iniciar la conexión (señalización); el chat va por WebSocket con nuestro servidor.
- *¿Por qué no usaron SFU?* Requería un servidor de medios. Para pocos espectadores, la estrella P2P alcanza; su límite es el ancho de subida del emisor.
- *¿Es seguro mostrar el texto del chat?* Se usa `textContent`, no `innerHTML`, así que no se puede inyectar HTML ni scripts. Además, el servidor recorta textos y limita cada mensaje a 4 KB (`maxPayload`).
- *¿Por qué WebSocket y no HTTP para el chat?* HTTP es pedido-respuesta: el cliente tendría que preguntar cada pocos segundos si hay mensajes. WebSocket deja la conexión abierta en ambos sentidos, así el servidor empuja cada mensaje apenas llega.
- *¿Dónde se guardan los mensajes?* En memoria del servidor (`history`, últimos 60). Al reiniciar el servidor se pierden; para guardarlos habría que agregar una base de datos.
- *¿Qué pasa si se cae el servidor del chat?* El campo muestra "Reconectando con el chat...", Enviar se desactiva y el cliente reintenta solo (1 s, 2 s, 4 s… hasta 10 s). Las reacciones avisan que se están reconectando. El video sigue, porque es P2P.
- *¿Por qué no usaron un DataChannel de WebRTC para las reacciones?* En la estrella 1:N los espectadores no están conectados entre sí: el moderador tendría que reenviar cada reacción a todos. El WebSocket ya llega a todos desde el servidor.
- *¿Por qué cambiaron la sala a `rooms/gomlive` y el proyecto de Firebase?* El proyecto inicial (`webrtctest-5da53`) lo usaban otros grupos con la misma sala `rooms/main`: durante las pruebas otro cliente borró la sala en plena transmisión. Ahora GOMLIVE usa un proyecto propio (`rtcsgomez`) y una sala con su nombre.

---

## 10. Guion de exposición (unos 3 minutos)

*Úsalo como base y dilo con tus palabras.*

**Introducción.** El proyecto partió de un ejemplo de WebRTC muy básico: una página emisor que capturaba la cámara y una página receptor que la veía, usando Firebase Realtime Database para que los navegadores se encontraran. Al principio solo una persona podía ver la transmisión, así que primero lo cambiamos para que el emisor abra una conexión por cada espectador. Después el objetivo fue convertirlo en una plataforma con identidad propia sin romper nada de lo que ya funcionaba.

**Identidad visual.** La llamé GOMLIVE. Partí de mi bosquejo: fondo oscuro para que el video destaque y tres colores de acento. El verde marca lo que es "mío" o está activo, el celeste lo relacionado con la comunicación, como el chat, y el morado la personalización. Todos los colores están en variables CSS, así que un tema completo se cambia modificando unas pocas líneas.

**Estructura.** La pantalla es un CSS Grid de tres columnas. A la izquierda mi cámara destacada y debajo los espectadores, que no son de relleno: salen en tiempo real de la base de datos con su nombre y su estado de conexión. Al centro, el moderador, que es lo más importante. A la derecha, el chat, siempre visible. Abajo, una sola barra con micrófono, cámara, emojis, ajustes, tema y, separado a la derecha, compartir pantalla.

**Funcionalidad.** Para no romper el streaming, mantuve los mismos IDs del HTML y la misma lógica WebRTC, y puse toda la interfaz en un archivo aparte, `gomlive-ui.js`. El chat no existía: lo agregué con un servidor WebSocket propio en Node.js. El navegador mantiene una conexión abierta con el servidor; cada mensaje que envío llega al servidor, que lo valida y lo reenvía a todos los conectados. Cuando llega uno nuevo, el borde del panel se ilumina 0.8 segundos. Los botones de micrófono y cámara activan o desactivan las pistas reales, y compartir pantalla reemplaza la pista de video en cada conexión sin reconectar a nadie; los espectadores ven una etiqueta "Pantalla compartida". Por el mismo WebSocket agregué reacciones: el servidor valida el emoji, limita el spam y las reparte, y cada navegador las hace flotar sobre el video.

**Demostración.** *(Emisor y receptor en dos ventanas.)* Inicio la transmisión, me conecto como espectador, aparezco en la lista de participantes, envío un mensaje y se ve el brillo, reacciono con 🔥 desde el espectador y aparece sobre el video del moderador, apago la cámara, comparto pantalla y vuelvo a la cámara, cambio de tema sin que se corte el video y achico la ventana para mostrar la versión móvil con pestañas.

**Conclusión.** Lo que más aporté fue la organización: decidir qué es lo principal, que es el moderador, qué es mío y qué es comunicación. También aprendí a separar la interfaz de la lógica para poder rediseñar sin romper el streaming, y a depurar CSS de verdad: el botón Enviar se salía del panel porque una columna de grid implícita crecía según su contenido, y se arregló con una sola línea, `minmax(0, 1fr)`.

---

## 11. Pruebas realizadas

**Simuladas (hechas en el desarrollo, con video y pantalla sintéticos generados con `<canvas>`):**

| Prueba | Resultado |
|---|---|
| Reglas de Firebase en `rooms/gomlive` (escribir, leer, borrar) | Permitido |
| Reacción válida entre 2 clientes WebSocket | Llega a ambos una vez, con el mismo `id` |
| Emoji fuera de la lista y texto con HTML | Descartados |
| 10 reacciones seguidas de un cliente | Pasan 5; un solo aviso de límite |
| Después de 2 s | Vuelve a permitir |
| JSON inválido y tipos desconocidos | Ignorados; la conexión sigue abierta |
| Chat junto a reacciones | Funciona; las reacciones no aparecen en el historial |
| 40 reacciones casi simultáneas (8 clientes) | Máximo 30 en pantalla; 0 elementos al terminar la animación |
| Reacciones desde la interfaz (moderador → espectador) | Flotan en ambos; el chat no se ilumina ni cambia |
| Compartir pantalla: cancelar el selector | Sin mensaje, sin cambios |
| Compartir pantalla: `NotReadableError` | Mensaje claro |
| Doble clic en Compartir | Se abre un solo selector |
| Compartir pantalla con espectador conectado | El espectador recibe 1280×720 y ve "Pantalla compartida"; la conexión sigue `connected`; misma pista de audio |
| "Dejar de compartir" del navegador | Vuelve la cámara (640 px), pista de pantalla detenida, etiqueta oculta en ambos |
| Detener la transmisión mientras se comparte | Cámara, micrófono y pantalla detenidos; sala vacía en Firebase |
| Móvil (375 px) | Panel de reacciones dentro de la pantalla, sin scroll horizontal |

**Requieren cámara, pantalla y usuarios reales (hacerlas antes de grabar el video):** ver la lista de comprobación entregada con esta versión; en resumen: cámara y micrófono reales, compartir pantalla, ventana y pestaña reales, al menos 2 equipos en la misma red, reacciones simultáneas de varias personas y pantalla completa.

---

## 12. Limitaciones conocidas (no ocultarlas)

- Los espectadores **no transmiten** cámara ni audio (arquitectura 1:N). Su cámara es solo una vista local.
- Hay **una sola sala** (`rooms/gomlive`).
- El historial del chat vive en la memoria del servidor (últimos 60 mensajes): se pierde al reiniciar `npm start`.
- El chat necesita el servidor Node.js corriendo: no funciona si las páginas se publican como sitio estático (GitHub Pages, Firebase Hosting).
- GOMLIVE usa su propio proyecto de Firebase (`rtcsgomez`) y la sala `rooms/gomlive`; ya no comparte datos con otros grupos. Las reglas permiten leer y escribir sin autenticación (comprobado): sirven para la práctica, pero no para producción.
- Las reacciones no tienen salas: llegan a todos los conectados al servidor (hoy hay una sola sala, así que coincide).
- No hay autenticación en el WebSocket: el nombre y el rol los declara el cliente (el servidor los recorta, pero no los verifica).
- Compartir pantalla no incluye el audio de la pestaña o del sistema; solo el micrófono.
- Compartir pantalla no funciona en celulares, y en Firefox no se puede elegir una pestaña.
- Solo hay STUN, sin TURN: entre redes restrictivas la conexión puede fallar.
- No hay autenticación; las reglas de Firebase deben permitir escribir en `rooms/gomlive`.
- El límite práctico de espectadores depende del ancho de subida del emisor (en torno a 4–10).
- En las pruebas automatizadas se usaron video y pantalla sintéticos porque el navegador de pruebas bloquea la cámara y la captura de pantalla. **Prueben con cámara y pantalla reales antes de la evaluación.**
- La dirección raíz `http://localhost:3000/` responde 404 (no tiene página): hay que entrar a `/emisor` o `/receptor`.
