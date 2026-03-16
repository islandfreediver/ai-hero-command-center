const HERO_SPRITES = {
  CodeHero: [
    "..xx....",
    ".xvvx...",
    ".xppx...",
    "xxssxx..",
    ".xppx...",
    ".xaax...",
    "xxppxx..",
    ".xp.px..",
    ".s..s...",
    "x....x.."
  ],
  ResearchHero: [
    "..xx....",
    ".xvvx...",
    ".xyyx...",
    "xxyyxx..",
    ".xyyx...",
    ".xttx...",
    "xxyyxx..",
    ".xy.yx..",
    ".y..y...",
    "x....x.."
  ],
  TestHero: [
    "..xx....",
    ".xvvx...",
    ".xggx...",
    "xxggxx..",
    ".xggx...",
    ".xwwx...",
    "xxggxx..",
    ".xg.gx..",
    ".w..w...",
    "x....x.."
  ],
  DebugHero: [
    "..xx....",
    ".xvvx...",
    ".xrrx...",
    "xxrrxx..",
    ".xrrx...",
    ".xoox...",
    "xxrrxx..",
    ".xr.rx..",
    ".o..o...",
    "x....x.."
  ],
  DeployHero: [
    "..xx....",
    ".xvvx...",
    ".xppx...",
    "xxppxx..",
    ".xppx...",
    ".xppx...",
    "xxttxx..",
    ".xp.px..",
    ".f..f...",
    ".f..f..."
  ]
};

const PALETTES = {
  CodeHero: {
    x: "#13242d",
    v: "#ffe7c8",
    p: "#5fe0ff",
    s: "#2db5d6",
    a: "#ff7f50"
  },
  ResearchHero: {
    x: "#1f1b16",
    v: "#f7dfc4",
    y: "#ffd96c",
    t: "#f7a531"
  },
  TestHero: {
    x: "#132019",
    v: "#f6e2c2",
    g: "#7af596",
    w: "#d8fff0"
  },
  DebugHero: {
    x: "#2a1918",
    v: "#f8dcc3",
    r: "#ff8266",
    o: "#ffc067"
  },
  DeployHero: {
    x: "#2b1d0f",
    v: "#ffe3c8",
    p: "#f5b95e",
    t: "#fff3cc",
    f: "#ff6f47"
  }
};

export class HeroRenderer {
  constructor() {
    this.cache = new Map();
  }

  buildSprite(kind) {
    const pattern = HERO_SPRITES[kind];
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

  drawHealthBar(context, hero) {
    const width = hero.size * 1.4;
    const left = Math.round(hero.x - width / 2);
    const top = Math.round(hero.y - hero.size - 10);
    context.fillStyle = "rgba(10, 22, 29, 0.8)";
    context.fillRect(left, top, width, 4);
    context.fillStyle = "#7af596";
    context.fillRect(left, top, width * (hero.hp / hero.maxHp), 4);
  }

  draw(context, hero, time) {
    const sprite = this.getSprite(hero.kind);
    const scale = hero.size / 16;
    const drawWidth = sprite.width * scale;
    const drawHeight = sprite.height * scale;
    const bounce = hero.state === "move" ? Math.sin(time / 100 + hero.x * 0.05) * 2 : 0;

    context.save();
    context.translate(Math.round(hero.x), Math.round(hero.y - bounce));
    context.scale(hero.facing, 1);

    if (hero.hitFlash > 0) {
      context.shadowColor = "rgba(255, 255, 255, 0.75)";
      context.shadowBlur = 18 * hero.hitFlash;
    }

    context.drawImage(sprite, -drawWidth / 2, -drawHeight, drawWidth, drawHeight);

    if (hero.state === "attack") {
      context.fillStyle = "rgba(255, 255, 255, 0.65)";
      context.fillRect(hero.facing > 0 ? 6 : -14, -drawHeight * 0.65, 8, 3);
    }

    context.restore();
    this.drawHealthBar(context, hero);
  }
}

export default HeroRenderer;
