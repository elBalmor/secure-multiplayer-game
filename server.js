'use strict';
require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet'); // versión ^3.21.3 (FCC requiere v3)
const http = require('http');

const app = express();
const server = http.createServer(app);

// ===== Seguridad con Helmet (historias 16–19) =====
app.use(helmet.hidePoweredBy({ setTo: 'PHP 7.4.3' })); // historia 19
app.use(helmet.noSniff());                              // historia 16
app.use(helmet.xssFilter());                            // historia 17
app.use(helmet.noCache());                              // historia 18

// Archivos estáticos y vista principal
app.use('/public', express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'views', 'index.html'));
});

// ===== Juego (estado simple en memoria) =====
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
// al menos un coleccionable inicial
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

  // Enviar estado inicial
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
    }

    // Colisión server-side
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

// ===== Server =====
const PORT = process.env.PORT || 3000;
const listener = server.listen(PORT, () => {
  console.log('Server listening on ' + PORT);
});

// Exportar para que los tests de FCC puedan usar app.address()
module.exports = listener;
