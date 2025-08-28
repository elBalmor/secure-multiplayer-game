import Player from './Player.mjs';
import Collectible from './Collectible.mjs';

const socket = io(); // v2 carga desde /socket.io/socket.io.js

const canvas = document.getElementById('game-window');
const ctx = canvas.getContext('2d');
canvas.width = 800; canvas.height = 600;

let selfId = null;
let players = new Map();
let collectibles = new Map();
let bounds = { width: 800, height: 600 };

socket.on('init', (payload) => {
  selfId = payload.selfId;
  bounds = payload.bounds || bounds;
  players = new Map(payload.players.map(p => [p.id, new Player(p)]));
  collectibles = new Map(payload.collectibles.map(c => [c.id, new Collectible(c)]));
  render();
});

socket.on('players:update', (list) => {
  players = new Map(list.map(p => [p.id, new Player(p)]));
});

socket.on('collectibles:spawn', (c) => {
  collectibles.set(c.id, new Collectible(c));
});

// Teclas: WASD/Flechas
const keyToDir = {
  ArrowUp: 'up',    w: 'up',    W: 'up',
  ArrowDown: 'down',s: 'down',  S: 'down',
  ArrowLeft: 'left',a: 'left',  A: 'left',
  ArrowRight: 'right',d: 'right',D: 'right'
};
document.addEventListener('keydown', (e) => {
  const dir = keyToDir[e.key];
  if (dir) socket.emit('move', dir);
});

function render() {
  requestAnimationFrame(render);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const c of collectibles.values()) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#f2c94c';
    ctx.fill();
  }

  for (const p of players.values()) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
    ctx.fillStyle = p.id === selfId ? '#2d9cdb' : '#6fcf97';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '12px sans-serif';
    ctx.fillText(String(p.score ?? 0), p.x - 4, p.y + 4);
  }

  const me = players.get(selfId);
  if (me) {
    const rankText = me.calculateRank(Array.from(players.values()));
    ctx.fillStyle = '#fff';
    ctx.fillText(rankText, 10, 20);
  }
}
