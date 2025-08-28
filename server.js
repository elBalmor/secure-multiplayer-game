'use strict';
require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const socket = require('socket.io');

const helmet = require('helmet');   // ^3.21.3
const nocache = require('nocache'); // módulo aparte
const cors = require('cors');

const fccTestingRoutes = require('./routes/fcctesting.js');
const runner = require('./test-runner.js');

const app = express();
const server = http.createServer(app);

/* ========== Seguridad (historias 16–19) ========== */
app.use(helmet.hidePoweredBy({ setTo: 'PHP 7.4.3' })); // 19
app.use(helmet.noSniff());                              // 16
app.use(helmet.xssFilter());                            // 17
app.use(nocache());                                      // 18

/* ========== body-parser ========== */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/* ========== CORS (exponer headers al runner FCC) ========== */
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
app.options('*', cors());

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
    'Access-Control-Expose-Headers':
      'x-powered-by, x-content-type-options, x-xss-protection, cache-control, pragma, expires, surrogate-control'
  });
  next();
});

/* ========== HEAD explícito en "/" ==========
   (algunos runners usan HEAD para leer headers) */
app.head('/', (req, res) => res.status(200).end());

/* ========== Rutas estáticas e índex ========== */
app.use('/public', express.static(process.cwd() + '/public'));
app.use('/assets', express.static(process.cwd() + '/assets'));

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/views/index.html');
});

/* ========== Rutas de testing FCC (incluye /_api/app-info) ========== */
fccTestingRoutes(app);

/* ========== 404 ========== */
app.use((req, res) => {
  res.status(404).type('text').send('Not Found');
});

/* ========== Arranque + runner local ========== */
const portNum = process.env.PORT || 3000;
const listener = server.listen(portNum, () => {
  console.log(`Listening on port ${portNum}`);
  if (process.env.NODE_ENV === 'test') {
    console.log('Running Tests...');
    setTimeout(function () {
      try {
        runner.run();
      } catch (error) {
        console.log('Tests are not valid:');
        console.error(error);
      }
    }, 1500);
  }
});

/* ========== Juego (estado simple en memoria, sin canvas-data) ========== */
const io = socket(server);

// Dimensiones de juego básicas
const WIDTH = 800;
const HEIGHT = 600;
const STEP = 5;

// Utilidad simple para posiciones aleatorias dentro del área de juego
function randomIn(min, max, margin = 5) {
  return Math.floor(Math.random() * (max - min - margin * 2)) + min + margin;
}

// Estructuras en memoria
let currPlayers = [];          // [{id,x,y,score}]
const destroyedCoins = [];     // [coinId]
let coin = generateCoin();

// Genera un coleccionable básico (value 1–3)
function generateCoin() {
  const r = Math.random();
  const value = r < 0.6 ? 1 : r < 0.85 ? 2 : 3;
  return {
    id: Date.now(),
    x: randomIn(0, WIDTH, 10),
    y: randomIn(0, HEIGHT, 10),
    value
  };
}

io.sockets.on('connection', (socket) => {
  console.log(`New connection ${socket.id}`);

  // Enviar estado inicial
  socket.emit('init', { id: socket.id, players: currPlayers, coin });

  // Alta de jugador
  socket.on('new-player', (obj) => {
    obj.id = socket.id;
    // asegura campos mínimos
    obj.x = Number(obj.x) || randomIn(0, WIDTH, 10);
    obj.y = Number(obj.y) || randomIn(0, HEIGHT, 10);
    obj.score = Number(obj.score) || 0;

    currPlayers.push(obj);
    socket.broadcast.emit('new-player', obj);
  });

  // Movimiento
  socket.on('move-player', (dir, posObj) => {
    const p = currPlayers.find((pl) => pl.id === socket.id);
    if (p && posObj) {
      p.x = Number(posObj.x) || p.x;
      p.y = Number(posObj.y) || p.y;
      socket.broadcast.emit('move-player', {
        id: socket.id,
        dir,
        posObj: { x: p.x, y: p.y }
      });
    }
  });

  // Stop
  socket.on('stop-player', (dir, posObj) => {
    const p = currPlayers.find((pl) => pl.id === socket.id);
    if (p && posObj) {
      p.x = Number(posObj.x) || p.x;
      p.y = Number(posObj.y) || p.y;
      socket.broadcast.emit('stop-player', {
        id: socket.id,
        dir,
        posObj: { x: p.x, y: p.y }
      });
    }
  });

  // Destruir item (anotar puntaje y respawn)
  socket.on('destroy-item', ({ playerId, coinValue, coinId }) => {
    if (!destroyedCoins.includes(coinId)) {
      const scoringPlayer = currPlayers.find((o) => o.id === playerId);
      if (!scoringPlayer) return;

      // sumar puntos
      scoringPlayer.score = Number(scoringPlayer.score || 0) + Number(coinValue || 0);
      destroyedCoins.push(coinId);

      // avisar puntaje actualizado
      io.emit('update-player', scoringPlayer);

      // fin de juego (opcional)
      const sock = io.sockets.connected && io.sockets.connected[scoringPlayer.id];
      if (scoringPlayer.score >= 100 && sock) {
        sock.emit('end-game', 'win');
        sock.broadcast.emit('end-game', 'lose');
      }

      // respawn del coin
      coin = generateCoin();
      io.emit('new-coin', coin);
    }
  });

  // Desconexión
  socket.on('disconnect', () => {
    socket.broadcast.emit('remove-player', socket.id);
    currPlayers = currPlayers.filter((p) => p.id !== socket.id);
  });
});

/* ========== Export para tests (http.Server) ========== */
module.exports = listener;
