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
let screenTrack = null; // Pista de pantalla compartida (si está activa)

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
    NexaUI.toast('No se pudo acceder a cámara/micrófono: ' + err.message, 'error');
    startBtn.disabled = false;
    return;
  }

  localVideo.srcObject = localStream;
  stageVideo.srcObject = localStream;
  NexaUI.setSelfVideo(true);
  NexaUI.setStageActive(true);
  syncMediaControls();

  roomRef = db.ref(ROOM_PATH);
  // Limpia cualquier sesión previa antes de iniciar una nueva.
  await roomRef.remove();

  // Marca la sala como activa y configura desconexión automática si se cierra la pestaña
  await roomRef.child('active').set(true);
  roomRef.child('active').onDisconnect().remove();
  // Nombre del moderador visible para los espectadores
  await roomRef.child('host').set({ name: NexaUI.getName() });
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
  NexaUI.setParticipantState(viewerId, 'connecting');

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
    NexaUI.setParticipantState(viewerId, pc.connectionState);
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
  NexaUI.setSelfVideo(false);
  NexaUI.setStageActive(false);
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

// ---------- Controles de la interfaz NEXA LIVE ----------

// Refleja en los botones el estado real de las pistas de audio/video.
function syncMediaControls() {
  const audio = localStream ? localStream.getAudioTracks()[0] : null;
  const video = localStream ? localStream.getVideoTracks()[0] : null;
  NexaUI.setControl('mic', { on: audio ? audio.enabled : true });
  NexaUI.setControl('cam', { on: video ? video.enabled : true });
  NexaUI.setControl('share', { on: !!screenTrack });
}

function toggleTrack(kind) {
  if (!localStream) {
    NexaUI.toast('Inicia la transmisión para usar este control.', 'warn');
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

async function toggleScreenShare() {
  if (screenTrack) {
    stopScreenShare();
    return;
  }
  if (!localStream) {
    NexaUI.toast('Inicia la transmisión para compartir pantalla.', 'warn');
    return;
  }
  if (!navigator.mediaDevices.getDisplayMedia) {
    NexaUI.toast('Este navegador no permite compartir pantalla.', 'error');
    return;
  }

  let screenStream;
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
  } catch (err) {
    if (err.name !== 'NotAllowedError') NexaUI.toast('No se pudo compartir pantalla: ' + err.message, 'error');
    return;
  }

  screenTrack = screenStream.getVideoTracks()[0];
  // Si el usuario usa el botón "Dejar de compartir" del navegador
  screenTrack.onended = stopScreenShare;
  replaceOutgoingVideo(screenTrack);
  stageVideo.srcObject = new MediaStream([screenTrack]);
  syncMediaControls();
  NexaUI.toast('Compartiendo pantalla con todos los espectadores.', 'ok');
}

function stopScreenShare() {
  if (!screenTrack) return;
  screenTrack.onended = null;
  screenTrack.stop();
  screenTrack = null;
  if (localStream) {
    replaceOutgoingVideo(localStream.getVideoTracks()[0]);
    stageVideo.srcObject = localStream;
  }
  syncMediaControls();
}

NexaUI.init({
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

startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);