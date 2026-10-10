// Chat en vivo por WebSocket.
// Se monta sobre el mismo servidor HTTP de Express, en la ruta /chat.
// El video y la señalización WebRTC siguen yendo por Firebase; esto solo maneja el chat.
const { WebSocketServer, WebSocket } = require('ws');

const HISTORY_LIMIT = 60;   // mensajes que recibe quien se conecta
const MAX_TEXT = 300;       // caracteres por mensaje
const MAX_NAME = 24;
const PING_INTERVAL = 30000; // ms entre comprobaciones de conexiones caídas

function attachChat(server) {
  const wss = new WebSocketServer({ server, path: '/chat', maxPayload: 4096 });
  const history = []; // vive en memoria: se pierde al reiniciar el servidor
  let nextId = 1;

  function broadcast(payload) {
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    // Al conectarse, el cliente recibe el historial reciente
    ws.send(JSON.stringify({ type: 'history', messages: history }));

    ws.on('message', (raw) => {
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return; // se ignora lo que no sea JSON
      }
      if (data.type !== 'message' || typeof data.text !== 'string') return;

      const text = data.text.trim().slice(0, MAX_TEXT);
      if (!text) return;

      // El servidor arma el mensaje: valida campos y pone id y hora propios
      const message = {
        id: nextId++,
        uid: String(data.uid || '').slice(0, 16),
        name: String(data.name || 'Anónimo').trim().slice(0, MAX_NAME) || 'Anónimo',
        role: data.role === 'host' ? 'host' : 'viewer',
        text,
        ts: Date.now()
      };

      history.push(message);
      if (history.length > HISTORY_LIMIT) history.shift();

      broadcast({ type: 'message', message });
    });
  });

  // Cierra las conexiones que dejaron de responder (pestaña cerrada sin aviso, red caída)
  const pinger = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, PING_INTERVAL);
  wss.on('close', () => clearInterval(pinger));

  return wss;
}

module.exports = attachChat;
