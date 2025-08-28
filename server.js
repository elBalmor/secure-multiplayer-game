'use strict';
require('dotenv').config();

const path = require('path');
const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const socket = require('socket.io');

const helmet = require('helmet');   // ^3.21.3 (FCC)
const nocache = require('nocache'); // módulo aparte (más fiable que la opción inline)
const cors = require('cors');

const fccTestingRoutes = require('./routes/fcctesting.js');
const runner = require('./test-runner.js');

const app = express();
const server = http.createServer(app);

/* ========== Seguridad (historias 16–19) ========== */
// 19) Encabezado “falso” de tecnología
app.use(helmet.hidePoweredBy({ setTo: 'PHP 7.4.3' }));
// 16) Evitar MIME sniff
app.use(helmet.noSniff());
// 17) Prevenir XSS (v3)
app.use(helmet.xssFilter());
// 18) Evitar caché en cliente (usamos el módulo nocache)
app.use(nocache());

/* ========== body-parser (como en el boilerplate) ========== */
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

/* ========== CORS (FCC lee cross-origin; expón headers) ========== */
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

/* ========== Fija headers de seguridad en TODAS las respuestas ========== */
app.use((req, res, next) => {
  res.set({
    'X-Powered-By': 'PHP 7.4.3',
    'X-Content-Type-Options': 'nosniff',
    'X-XSS-Protection': '1; mode=block',
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
    // (refuerzo) expón headers en minúsculas para fetch()
    'Access-Control-Expose-Headers':
      'x-powered-by, x-content-type-options, x-xss-protection, cache-control, pragma, expires, surrogate-control'
  });
  next();
});

/* ========== HEAD explícito en "/" (algunos runners usan HEAD) ========== */
app.head('/', (req, res) => res.status(200).end());

/* ========== Rutas estáticas ========== */
app.use('/public', express.static(process.cwd() + '/public'));
app.use('/assets', express.static(process.cwd() + '/assets'));

/* ========== Index ========== */
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

/* ========== Socket.IO v2.x (compatible con tu package.json) ========== */
const io = socket(server);

const Collectible = require('./public/Collectible');
const { generateStartPos, canvasCalcs } = require('./public/canvas-data');

let currPlayers = [];
const destroyedCoins = [];

const generateCoin = () => {
  const rand = Math.random();
  let coinValue;
  if (rand < 0.6) coinValue = 1;
  else if (rand < 0.85) coinValue = 2;
  else coinValue = 3;

  return new Collectible({
    x: generateStartPos(canvasCalcs.playFieldMinX, canvasCalcs.playFieldMaxX, 5),
    y: generateStartPos(canvasCalcs.playFieldMinY, canvasCalcs.playFieldMaxY, 5),
    value: coinValue,
    id: Date.now()
  });
};

let coin = generateCoin();

io.sockets.on('connection', (socket) => {
  console.log(`New connection ${socket.id}`);

  socket.emit('init', { id: socket.id, players: currPlayers, coin });

  socket.on('new-player', (obj) => {
    obj.id = socket.id;
    currPlayers.push(obj);
    socket.broadcast.emit('new-player', obj);
  });

  socket.on('move-player', (dir, obj) => {
    const movingPlayer = currPlayers.find((p) => p.id === socket.id);
    if (movingPlayer) {
      movingPlayer.x = obj.x;
      movingPlayer.y = obj.y;
      socket.broadcast.emit('move-player', {
        id: socket.id,
        dir,
        posObj: { x: movingPlayer.x, y: movingPlayer.y }
      });
    }
  });

  socket.on('stop-player', (dir, obj) => {
    const stoppingPlayer = currPlayers.find((p) => p.id === socket.id);
    if (stoppingPlayer) {
      stoppingPlayer.x = obj.x;
      stoppingPlayer.y = obj.y;
      socket.broadcast.emit('stop-player', {
        id: socket.id,
        dir,
        posObj: { x: stoppingPlayer.x, y: stoppingPlayer.y }
      });
    }
  });

  socket.on('destroy-item', ({ playerId, coinValue, coinId }) => {
    if (!destroyedCoins.includes(coinId)) {
      const scoringPlayer = currPlayers.find((o) => o.id === playerId);
      const sock = io.sockets.connected[scoringPlayer.id];
      scoringPlayer.score += coinValue;
      destroyedCoins.push(coinId);

      io.emit('update-player', scoringPlayer);

      if (scoringPlayer.score >= 100) {
        sock.emit('end-game', 'win');
        sock.broadcast.emit('end-game', 'lose');
      }

      coin = generateCoin();
      io.emit('new-coin', coin);
    }
  });

  socket.on('disconnect', () => {
    socket.broadcast.emit('remove-player', socket.id);
    currPlayers = currPlayers.filter((p) => p.id !== socket.id);
  });
});

/* ========== Export para tests ========== */
module.exports = listener; // exporta el servidor (http.Server)
