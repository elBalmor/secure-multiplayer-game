'use strict';
require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');       // v3.21.3 (requerido por FCC)
const http = require('http');
const cors = require('cors');           // para exponer headers al runner FCC

const app = express();
const server = http.createServer(app);

// ===== Seguridad con Helmet (historias 16–19) =====
// 19) Encabezado "falso" de tecnología
app.use(helmet.hidePoweredBy({ setTo: 'PHP 7.4.3' }));
// 16) Evitar MIME sniff
app.use(helmet.noSniff());
// 17) Prevenir XSS (v3)
app.use(helmet.xssFilter());
// 18) Deshabilitar caché en cliente
app.use(helmet.noCache());

// ===== CORS para que el runner de FCC pueda LEER los headers (cross-origin) =====
// Importante: sin esto, el navegador bloquea la lectura de headers y en FCC quedan "Esperando".
app.use(cors({
  origin: '*',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  exposedHeaders: [
    'X-Powered-By',
    'X-Content-Type-Options',
    'X-XSS-Protection',
    'Cache-Control',
    'Pragma',
    'Expires',
    'Surrogate-Control'
  ]
}));

// ===== Archivos estáticos y vista =====
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// (Opcional) Health-check para diagnóstico rápido en Render
app.get('/health', (req, res) => res.status(200).send('ok'));

// ===== Lógica simple del juego =====
const WIDTH = 800;
const HEIGHT = 600;
const STEP = 5;

const players = new Map();      // id -> {id,x,y,score}
const collectibles = new Map(); // id -> {id,x,y,value}

function spawnCollectible() {
  const id = 'c-' + Math.random().toString(36).slice(2, 9);
  const value = 1 + Math.floor(Math.random() * 3);
  const x = Math.floor(Math.random() * (WIDTH - 40)) + 20;
  const y = Math.floor(Math.random() * (HEIGHT - 40)) + 20;
  const c = { id, x, y, value };
  collectibles.set(id, c);
  return c;
}

// Asegura al menos un coleccionable
if (collectibles.size === 0) spawnCollectible();

// ===== Socket.IO v2.3.0 =====
const io = require('socket.io')(server);

io.on('connection', (socket) => {
  // Crear jugador
  const player = {
    id: socket.id,
    x: Math.floor(Math.random() * (WIDTH - 40)) + 20,
    y: Math.floor(Math.random() * (HEIGHT - 40)) + 20,
    score: 0
  };
  players.set(socket.id, player);

  // Estado inicial al cliente
  socket.emit('init', {
    selfId: socket.id,
    players: Array.from(players.values()),
    collectibles: Array.from(collectibles.values()),
    bounds: { width: WIDTH, height: HEIGHT }
  });

  // Notificar a todos los clientes
  io.emit('players:update', Array.from(players.values()));

  // Movimiento
  socket.on('move', (dir) => {
    const p = players.get(socket.id);
    if (!p) return;

    switch (dir) {
      case 'up':    p.y = Math.max(0, p.y - STEP); break;
      case 'down':  p.y = Math.min(HEIGHT, p.y + STEP); break;
      case 'left':  p.x = Math.max(0, p.x - STEP); break;
      case 'right': p.x = Math.min(WIDTH, p.x + STEP); break;
      default: break;
    }

    // Colisión server-side con coleccionables
    for (const [cid, c] of collectibles) {
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      if (Math.hypot(dx, dy) < 20) {
        p.score += c.value;
        collectibles.delete(cid);
        const newC = spawnCollectible();
        io.emit('collectibles:spawn', newC);
      }
    }

    io.emit('players:update', Array.from(players.values()));
  });

  // Desconexión
  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('players:update', Array.from(players.values()));
  });
});

// ===== Arranque del servidor =====
const PORT = process.env.PORT || 3000;
const listener = server.listen(PORT, () => {
  console.log('Server listening on ' + PORT);
});

// Export para tests (chai-http usa .address())
module.exports = listener;
