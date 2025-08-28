'use strict';
require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');       // v3.21.3 (requerido por FCC)
const http = require('http');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

/* ========= Seguridad: Helmet (historias 16–19) ========= */
app.use(helmet.hidePoweredBy({ setTo: 'PHP 7.4.3' })); // 19
app.use(helmet.noSniff());                              // 16
app.use(helmet.xssFilter());                            // 17
app.use(helmet.noCache());                              // 18

/* ========= CORS (exponer headers al runner FCC) =========
   Ojo: SOLO en minúsculas para que fetch los lea sin dramas */
app.use(cors({
  origin: '*',
  methods: ['GET', 'HEAD', 'OPTIONS'],
  exposedHeaders: [
    'x-powered-by',
    'x-content-type-options',
    'x-xss-protection',
    'cache-control',
    'pragma',
    'expires',
    'surrogate-control'
  ]
}));

/* ========= Fijar headers de seguridad en TODAS las respuestas ========= */
app.use((req, res, next) => {
  res.set({
    'X-Powered-By': 'PHP 7.4.3',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
  next();
});

/* ========= Archivos estáticos y vista ========= */
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// (Opcional) Health-check
app.get('/health', (req, res) => res.status(200).send('ok'));

/* ========= Juego (estado simple) ========= */
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
if (collectibles.size === 0) spawnCollectible();

/* ========= Socket.IO v2.3.0 ========= */
const io = require('socket.io')(server);

io.on('connection', (socket) => {
  const player = {
    id: socket.id,
    x: Math.floor(Math.random() * (WIDTH - 40)) + 20,
    y: Math.floor(Math.random() * (HEIGHT - 40)) + 20,
    score: 0
  };
  players.set(socket.id, player);

  socket.emit('init', {
    selfId: socket.id,
    players: Array.from(players.values()),
    collectibles: Array.from(collectibles.values()),
    bounds: { width: WIDTH, height: HEIGHT }
  });

  io.emit('players:update', Array.from(players.values()));

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

  socket.on('disconnect', () => {
    players.delete(socket.id);
    io.emit('players:update', Array.from(players.values()));
  });
});

/* ========= Arranque ========= */
const PORT = process.env.PORT || 3000;
const listener = server.listen(PORT, () => {
  console.log('Server listening on ' + PORT);
});

module.exports = listener;
