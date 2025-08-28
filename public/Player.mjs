export default class Player {
  constructor({ id, x = 0, y = 0, score = 0 } = {}) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.score = score;
  }

  // Historias 8-9
  movePlayer(direction, pixels) {
    const d = String(direction || '').toLowerCase();
    const step = Number(pixels) || 0;
    if (d === 'up') this.y -= step;
    if (d === 'down') this.y += step;
    if (d === 'left') this.x -= step;
    if (d === 'right') this.x += step;
    return { x: this.x, y: this.y };
  }

  // Historias 10-11
  calculateRank(allPlayers = []) {
    const list = Array.isArray(allPlayers) ? allPlayers : [];
    const total = Math.max(1, list.length);
    const sorted = [...list].sort((a, b) => (b.score || 0) - (a.score || 0));
    let rank = sorted.findIndex((p) => p.id === this.id);
    if (rank === -1) {
      rank = sorted.findIndex((p) => (p.score || 0) <= (this.score || 0));
      if (rank === -1) rank = sorted.length;
    }
    return `Rank: ${rank + 1}/${total}`;
  }

  // Historias 12-13
  collision(collectible) {
    if (!collectible) return false;
    const dx = (this.x || 0) - (collectible.x || 0);
    const dy = (this.y || 0) - (collectible.y || 0);
    return Math.hypot(dx, dy) < 20;
  }
}
