const ENEMY_SPRITES = {
  Bug: [
    "..xx....",
    ".xrrx...",
    "xxrrxx..",
    "xroorx..",
    "xxrrxx..",
    ".xrrx...",
    "r.xx.r..",
    ".r..r...",
    "r....r.."
  ],
  CriticalBug: [
    "..xxx...",
    ".xrrrx..",
    "xxrrrxx.",
    "xrooorx.",
    "xxrrrxx.",
    ".xrrrx..",
    "rr.xxxr.",
    ".r.r.r..",
    "r.....r."
  ],
  MemoryLeakMonster: [
    "..ggg...",
    ".glll...",
    "gglllgg.",
    "glppplg.",
    "gglllgg.",
    ".glll...",
    "g.ggg.g.",
    ".g...g..",
    "g.....g."
  ],
  TestFailureGhost: [
    "..aa....",
    ".accca...",
    "acpppca..",
    "acpppca..",
    "acpppca..",
    ".accca...",
    ".ap.pa...",
    ".a...a...",
    "..a.a...."
  ]
};

const PALETTES = {
  Bug: {
    x: "#3c1716",
    r: "#ff6f61",
    o: "#ffd2a5"
  },
  CriticalBug: {
    x: "#432310",
    r: "#ff9257",
    o: "#fff2c2"
  },
  MemoryLeakMonster: {
    g: "#d2ff68",
    l: "#87d447",
    p: "#355922"
  },
  TestFailureGhost: {
    a: "#a7f2ff",
    c: "#dbfdff",
    p: "#59dff0"
  }
};

export class EnemyRenderer {
  constructor() {
    this.cache = new Map();
  }

  buildSprite(kind) {
    const pattern = ENEMY_SPRITES[kind];
    const palette = PALETTES[kind];
    const pixelSize = 4;
    const canvas = document.createElement("canvas");
    canvas.width = pattern[0].length * pixelSize;
    canvas.height = pattern.length * pixelSize;
    const context = canvas.getContext("2d");

    for (let rowIndex = 0; rowIndex < pattern.length; rowIndex += 1) {
      for (let columnIndex = 0; columnIndex < pattern[rowIndex].length; columnIndex += 1) {
        const token = pattern[rowIndex][columnIndex];
        const color = palette[token];
        if (!color) {
          continue;
        }

        context.fillStyle = color;
        context.fillRect(columnIndex * pixelSize, rowIndex * pixelSize, pixelSize, pixelSize);
      }
    }

    return canvas;
  }

  getSprite(kind) {
    if (!this.cache.has(kind)) {
      this.cache.set(kind, this.buildSprite(kind));
    }

    return this.cache.get(kind);
  }

  drawHealthBar(context, enemy) {
    const renderSize = enemy.pixelSize ?? enemy.size;
    const width = renderSize * 1.3;
    const left = Math.round(enemy.x - width / 2);
    const top = Math.round(enemy.y - renderSize - 10);
    context.fillStyle = "rgba(17, 8, 8, 0.8)";
    context.fillRect(left, top, width, 4);
    context.fillStyle = "#ff6f61";
    context.fillRect(left, top, width * (enemy.hp / enemy.maxHp), 4);
  }

  draw(context, enemy, time) {
    const sprite = this.getSprite(enemy.kind);
    const renderSize = enemy.pixelSize ?? enemy.size;
    const scale = renderSize / 16;
    const floatOffset =
      enemy.kind === "TestFailureGhost" ? Math.sin(time / 120 + enemy.x * 0.04) * 4 : 0;
    const drawWidth = sprite.width * scale;
    const drawHeight = sprite.height * scale;

    context.save();
    context.translate(Math.round(enemy.x), Math.round(enemy.y + floatOffset));
    context.scale(enemy.facing, 1);

    if (enemy.hitFlash > 0) {
      context.shadowColor = "rgba(255, 250, 200, 0.6)";
      context.shadowBlur = 16 * enemy.hitFlash;
    }

    context.drawImage(sprite, -drawWidth / 2, -drawHeight, drawWidth, drawHeight);
    context.restore();
    this.drawHealthBar(context, enemy);
  }
}

export default EnemyRenderer;
