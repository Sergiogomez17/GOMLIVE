const express = require('express');
const path = require('path');
const attachChat = require('./chat-server');

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/emisor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'emisor', 'index.html'));
});

app.get('/receptor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'receptor', 'index.html'));
});

app.use(express.static(path.join(__dirname, 'public')));

const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
  console.log(`  Emisor:   http://localhost:${PORT}/emisor`);
  console.log(`  Receptor: http://localhost:${PORT}/receptor`);
  console.log(`  Chat:     ws://localhost:${PORT}/chat`);
});

// El chat usa WebSocket sobre el mismo puerto que la página
attachChat(server);
