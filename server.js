'use strict';
require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const helmet = require('helmet');              // v3.21.3 (requerido por FCC)
const bodyParser = require('body-parser');
const cors = require('cors');                  // habilitar lectura de headers desde FCC (cross-origin)

const app = express();
const server = http.createServer(app);

/* ========== Seguridad con Helmet (historias 16–19) ========== */
// 19) Encabezado "falso" de tecnología
app.use(helmet.hidePoweredBy({ setTo: 'PHP 7.4.3' }));
// 16) Evitar MIME sniff
app.use(helmet.noSniff());
// 17) Prevenir XSS (API v3)
app.use(helmet.xssFilter());
// 18) Deshabilitar caché en cliente
app.use(helmet.noCache());



/* ========== CORS (colocado inmediatamente después de body-parser) ========== */
// Nota: con origin:* basta; si quieres, puedes agregar exposedHeaders más abajo
app.use(cors({origin: '*'})); 



/* ========== Fijar headers de seguridad en TODAS las respuestas ========== */
app.use((req, res, next) => {
  res.set({
    'X-Powered-By': 'PHP 7.4.3',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
    // Exponer explícitamente headers en minúsculas para fetch()
    'Access-Control-Expose-Headers':
      'x-powered-by, x-content-type-options, x-xss-protection, cache-control, pragma, expires, surrogate-control'
  });
  next();
});

/* (Opcional) HEAD explícito para "/" — algunos runners usan HEAD */
app.head('/', (req, res) => res.status(200).end());

/* ========== Archivos estáticos y vista principal ========== */
app.use('/public', express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

/* (Opcional) Health-check para diagnóstico rápido */
app.get('/health', (req, res) => res.status(200).send('ok'));

/* ========== Lógica simple del juego (estado en memoria) ========== */
const WIDTH = 800;
const HEIGHT = 600;
const STEP = 5;

const players = new Map();      // id -> { id, x, y, score }
const collectibles = new Map(); // id -> { id, x, y, value }

function spawnCollectible() {
  const id = 'c-' + Math.random().toString(36).slice(2, 9);
  const value = 1 + Math.floor(Math.random() * 3);
  const x = Math.floor(Math.random() * (WIDTH - 40)) + 20;
  const y = Math.floor(Math.random() * (HEIGHT - 40)) + 20;
  const c = { id, x, y, value };
  collectibles.set(id, c);
  return c;
}
// Asegura al menos un coleccionable inicial
if (collectibles.size === 0) spawnCollectible();

/* ========== Socket.IO v2.3.0 (compat con tu package.json) ========== */
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

  // Estado inicial
  socket.emit('init', {
    selfId: socket.id,
    players: Array.from(players.values()),
    collectibles: Array.from(collectibles.values()),
    bounds: { width: WIDTH, height: HEIGHT }
  });

  // Notificar a todos
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

    // Colisión con coleccionables (autoridad del servidor)
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

/* ========== Arranque del servidor y export para tests ========== */
const PORT = process.env.PORT || 3000;
const listener = server.listen(PORT, () => {
  console.log('Server listening on ' + PORT);
});

module.exports = listener;
