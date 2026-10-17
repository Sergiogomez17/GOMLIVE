 // Lado "emisor": captura cámara/micrófono local y transmite a múltiples espectadores (1:N WebRTC).
const localVideo = document.getElementById('localVideo');
const stageVideo = document.getElementById('stageVideo'); // Video central (lo que ven los espectadores)
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusEl = document.getElementById('status');

let localStream = null; // Stream de cámara/micrófono local
let roomRef = null; // Referencia a Firebase (rooms/main)
let viewersRef = null; // Referencia a Firebase para la lista de espectadores
// Mapa con las conexiones activas: viewerId -> { pc, pendingCandidates, answerRef, calleeCandidatesRef }
const peers = new Map();
// Callbacks propios de la lista de espectadores: se quitan uno por uno para no
// desconectar otros listeners de la misma ruta (por ejemplo, los de la interfaz).
let onViewerAdded = null;
let onViewerRemoved = null;
let screenStream = null; // Captura de pantalla completa (puede traer más de una pista)
let screenTrack = null; // Pista de video de la pantalla compartida (si está activa)
let screenPending = false; // true mientras el selector de pantalla del navegador está abierto

function setStatus(text) {
  statusEl.textContent = text;
}

function updateStatusText() {
  if (!localStream) {
    setStatus('Transmisión detenida.');
    return;
  }
  const connectedCount = Array.from(peers.values()).filter(
    (p) => p.pc && (p.pc.connectionState === 'connected' || p.pc.iceConnectionState === 'connected')
  ).length;

  const totalCount = peers.size;
  if (totalCount === 0) {
    setStatus('Transmitiendo en vivo. Esperando espectadores...');
  } else {
    setStatus(`Transmitiendo en vivo. Espectadores conectados: ${connectedCount} (${totalCount} en total).`);
  }
}

async function start() {
  startBtn.disabled = true;
  setStatus('Solicitando acceso a cámara y micrófono...');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  } catch (err) {
    setStatus('Error al acceder a cámara/micrófono: ' + err.message);
    GomliveUI.toast('No se pudo acceder a cámara/micrófono: ' + err.message, 'error');
    startBtn.disabled = false;
    return;
  }

  localVideo.srcObject = localStream;
  stageVideo.srcObject = localStream;
  GomliveUI.setSelfVideo(true);
  GomliveUI.setStageActive(true);
  syncMediaControls();

  roomRef = db.ref(ROOM_PATH);
  // Limpia cualquier sesión previa antes de iniciar una nueva.
  await roomRef.remove();

  // Marca la sala como activa y configura desconexión automática si se cierra la pestaña
  await roomRef.child('active').set(true);
  roomRef.child('active').onDisconnect().remove();
  // Nombre del moderador visible para los espectadores
  // (sharing indica a los espectadores si lo que ven es la pantalla compartida)
  await roomRef.child('host').set({ name: GomliveUI.getName(), sharing: false });
  roomRef.child('host').onDisconnect().remove();

  viewersRef = roomRef.child('viewers');

  // Cada vez que un nuevo espectador entra a la sala
  onViewerAdded = viewersRef.on('child_added', (snapshot) => {
    const viewerId = snapshot.key;
    if (viewerId) {
      handleNewViewer(viewerId);
    }
  });

  // Cuando un espectador se desconecta o cierra su ventana
  onViewerRemoved = viewersRef.on('child_removed', (snapshot) => {
    const viewerId = snapshot.key;
    if (viewerId) {
      removeViewer(viewerId);
    }
  });

  updateStatusText();
  stopBtn.disabled = false;
}

async function handleNewViewer(viewerId) {
  // Evitar conexiones duplicadas si ya existe
  if (peers.has(viewerId)) {
    return;
  }

  const pc = new RTCPeerConnection(RTC_CONFIG);
  const peerData = {
    pc,
    pendingCandidates: [],
    answerRef: null,
    calleeCandidatesRef: null
  };
  peers.set(viewerId, peerData);
  GomliveUI.setParticipantState(viewerId, 'connecting');

  // Agregar las pistas de audio/video locales para este espectador
  // (si se está compartiendo pantalla, el nuevo espectador recibe la pantalla en lugar de la cámara)
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      const outgoing = track.kind === 'video' && screenTrack ? screenTrack : track;
      pc.addTrack(outgoing, localStream);
    });
  }

  // ICE candidates propios dirigidos a este espectador
  const callerCandidatesRef = viewersRef.child(viewerId).child('callerCandidates');
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      callerCandidatesRef.push(event.candidate.toJSON());
    }
  };

  pc.onconnectionstatechange = () => {
    GomliveUI.setParticipantState(viewerId, pc.connectionState);
    if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      removeViewer(viewerId);
    }
    updateStatusText();
  };

  // Escuchar los ICE candidates enviados por este espectador
  const calleeCandidatesRef = viewersRef.child(viewerId).child('calleeCandidates');
  peerData.calleeCandidatesRef = calleeCandidatesRef;

  calleeCandidatesRef.on('child_added', async (snapshot) => {
    const candidate = snapshot.val();
    if (!candidate) return;

    if (pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn('Error agregando ICE candidate para espectador ' + viewerId, err);
      }
    } else {
      peerData.pendingCandidates.push(candidate);
    }
  });

  try {
    // Generar oferta personalizada para este espectador
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await viewersRef.child(viewerId).child('offer').set({ type: offer.type, sdp: offer.sdp });

    // Esperar respuesta (answer) del espectador
    const answerRef = viewersRef.child(viewerId).child('answer');
    peerData.answerRef = answerRef;

    answerRef.on('value', async (snapshot) => {
      const answer = snapshot.val();
      if (answer && !pc.currentRemoteDescription) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));

          // Procesar cualquier candidato ICE que haya llegado antes del SDP answer
          for (const cand of peerData.pendingCandidates) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(console.warn);
          }
          peerData.pendingCandidates = [];
          updateStatusText();
        } catch (err) {
          console.error('Error al aplicar respuesta remota para espectador ' + viewerId, err);
        }
      }
    });
  } catch (err) {
    console.error('Error al negociar conexión con espectador ' + viewerId, err);
    removeViewer(viewerId);
  }
}

function removeViewer(viewerId) {
  const peerData = peers.get(viewerId);
  if (!peerData) return;

  if (peerData.answerRef) peerData.answerRef.off();
  if (peerData.calleeCandidatesRef) peerData.calleeCandidatesRef.off();

  if (peerData.pc) {
    peerData.pc.close();
  }

  peers.delete(viewerId);
  updateStatusText();
}

async function stop() {
  stopBtn.disabled = true;

  // Dejar de escuchar nuevos espectadores
  if (viewersRef) {
    viewersRef.off('child_added', onViewerAdded);
    viewersRef.off('child_removed', onViewerRemoved);
    viewersRef = null;
  }

  stopScreenShare();

  // Cerrar todas las conexiones con los espectadores
  for (const viewerId of Array.from(peers.keys())) {
    removeViewer(viewerId);
  }

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
    localStream = null;
  }
  localVideo.srcObject = null;
  stageVideo.srcObject = null;
  GomliveUI.setSelfVideo(false);
  GomliveUI.setStageActive(false);
  syncMediaControls();

  // Limpiar la sala en Firebase
  if (roomRef) {
    await roomRef.remove();
    roomRef = null;
  }

  updateStatusText();
  startBtn.disabled = false;
}

window.addEventListener('beforeunload', () => {
  if (roomRef) {
    roomRef.remove();
  }
});

// ---------- Controles de la interfaz GOMLIVE ----------

// Refleja en los botones el estado real de las pistas de audio/video.
function syncMediaControls() {
  const audio = localStream ? localStream.getAudioTracks()[0] : null;
  const video = localStream ? localStream.getVideoTracks()[0] : null;
  GomliveUI.setControl('mic', { on: audio ? audio.enabled : true });
  GomliveUI.setControl('cam', { on: video ? video.enabled : true });
  GomliveUI.setControl('share', { on: !!screenTrack });
}

function toggleTrack(kind) {
  if (!localStream) {
    GomliveUI.toast('Inicia la transmisión para usar este control.', 'warn');
    return;
  }
  const tracks = kind === 'audio' ? localStream.getAudioTracks() : localStream.getVideoTracks();
  // enabled = false envía silencio / imagen negra a todos los espectadores sin renegociar.
  tracks.forEach((track) => { track.enabled = !track.enabled; });
  syncMediaControls();
}

// Reemplaza la pista de video que se envía a cada espectador (sin renegociar SDP).
function replaceOutgoingVideo(track) {
  for (const { pc } of peers.values()) {
    const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'video');
    if (sender) {
      sender.replaceTrack(track).catch((err) => console.warn('Error reemplazando pista de video', err));
    }
  }
}

// Mensajes claros para los errores de getDisplayMedia
const SCREEN_ERRORS = {
  NotReadableError: 'El sistema no permitió leer la pantalla. Cierra otras apps que la estén capturando e inténtalo de nuevo.',
  NotFoundError: 'No se encontró ninguna pantalla o ventana para compartir.',
  AbortError: 'Se interrumpió la captura de pantalla.',
  SecurityError: 'Compartir pantalla requiere abrir la página en localhost o https.'
};

// Avisa a los espectadores (rooms/gomlive/host/sharing) si lo que ven es la pantalla
function publishSharing(sharing) {
  if (roomRef) roomRef.child('host/sharing').set(sharing).catch(() => {});
  GomliveUI.setScreenSharing(sharing);
}

async function toggleScreenShare() {
  if (screenTrack) {
    stopScreenShare();
    return;
  }
  if (screenPending) return; // el selector ya está abierto
  if (!localStream) {
    GomliveUI.toast('Inicia la transmisión para compartir pantalla.', 'warn');
    return;
  }

  screenPending = true;
  let captured;
  try {
    captured = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
  } catch (err) {
    // NotAllowedError = el usuario canceló el selector: no es un error
    if (err.name !== 'NotAllowedError') {
      GomliveUI.toast(SCREEN_ERRORS[err.name] || 'No se pudo compartir pantalla: ' + err.message, 'error');
    }
    return;
  } finally {
    screenPending = false;
  }

  const track = captured.getVideoTracks()[0];
  // La transmisión pudo detenerse mientras el selector estaba abierto
  if (!localStream || !track) {
    captured.getTracks().forEach((t) => t.stop());
    return;
  }

  screenStream = captured;
  screenTrack = track;
  // Prioriza la nitidez del texto (código, diapositivas) sobre la fluidez
  if ('contentHint' in screenTrack) screenTrack.contentHint = 'detail';
  // Si el usuario usa el botón "Dejar de compartir" del navegador
  screenTrack.onended = stopScreenShare;
  replaceOutgoingVideo(screenTrack);
  stageVideo.srcObject = new MediaStream([screenTrack]);
  publishSharing(true);
  syncMediaControls();
  GomliveUI.toast('Compartiendo pantalla con todos los espectadores.', 'ok');
}

function stopScreenShare() {
  if (!screenTrack) return;
  screenTrack.onended = null;
  // Libera todas las pistas de la captura, no solo la de video
  screenStream.getTracks().forEach((t) => t.stop());
  screenStream = null;
  screenTrack = null;
  if (localStream) {
    replaceOutgoingVideo(localStream.getVideoTracks()[0]);
    stageVideo.srcObject = localStream;
  }
  publishSharing(false);
  syncMediaControls();
}

GomliveUI.init({
  role: 'host',
  actions: {
    mic: () => toggleTrack('audio'),
    cam: () => toggleTrack('video'),
    share: () => toggleScreenShare()
  },
  onNameChange: (name) => {
    if (roomRef) roomRef.child('host/name').set(name);
  }
});
syncMediaControls();

// Navegadores sin getDisplayMedia (la mayoría de los móviles): el botón explica por qué no funciona
if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
  GomliveUI.setControl('share', {
    disabled: true,
    reason: 'Este navegador no permite compartir pantalla. Usa Chrome o Edge en una computadora.'
  });
}

startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);