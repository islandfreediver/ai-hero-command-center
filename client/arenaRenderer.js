import EffectsRenderer from "./effects.js";
import EnemyRenderer from "./enemyRenderer.js";
import HeroRenderer from "./heroRenderer.js";

export class ArenaRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.context = canvas.getContext("2d");
    this.heroRenderer = new HeroRenderer();
    this.enemyRenderer = new EnemyRenderer();
    this.effectsRenderer = new EffectsRenderer();
    this.stars = Array.from({ length: 42 }, (_, index) => ({
      x: 20 + ((index * 73) % (canvas.width - 40)),
      y: 20 + ((index * 47) % 180),
      size: index % 3 === 0 ? 3 : 2
    }));
  }

  drawBackdrop(arena, time) {
    const context = this.context;
    const gradient = context.createLinearGradient(0, 0, 0, arena.height);
    gradient.addColorStop(0, "#07131a");
    gradient.addColorStop(0.55, "#16333a");
    gradient.addColorStop(1, "#0d181a");

    context.fillStyle = gradient;
    context.fillRect(0, 0, arena.width, arena.height);

    for (const star of this.stars) {
      const twinkle = 0.55 + Math.sin(time / 400 + star.x) * 0.3;
      context.fillStyle = `rgba(255, 248, 205, ${twinkle})`;
      context.fillRect(star.x, star.y, star.size, star.size);
    }

    context.strokeStyle = "rgba(110, 246, 220, 0.08)";
    context.lineWidth = 1;
    for (let x = 0; x <= arena.width; x += 48) {
      context.beginPath();
      context.moveTo(x, arena.groundY - 140);
      context.lineTo(x, arena.groundY);
      context.stroke();
    }

    context.fillStyle = "#11252a";
    context.fillRect(0, arena.groundY, arena.width, arena.height - arena.groundY);
    context.fillStyle = "#0d1d21";
    context.fillRect(0, arena.groundY - 6, arena.width, 6);
  }

  drawTerminalBay() {
    const context = this.context;
    context.fillStyle = "#203740";
    context.fillRect(54, 346, 172, 136);
    context.fillStyle = "#081319";
    context.fillRect(68, 368, 48, 34);
    context.fillRect(126, 368, 48, 34);
    context.fillStyle = "#5fe0ff";
    context.fillRect(74, 374, 36, 22);
    context.fillRect(132, 374, 36, 22);
    context.fillStyle = "#122027";
    context.fillRect(84, 408, 72, 56);
    context.fillStyle = "#ff7f50";
    context.fillRect(92, 420, 12, 8);
    context.fillRect(108, 420, 28, 8);
  }

  drawResearchDeck() {
    const context = this.context;
    context.fillStyle = "#26322c";
    context.fillRect(282, 172, 150, 124);
    context.fillStyle = "#ffd96c";
    context.fillRect(298, 190, 118, 20);
    context.fillStyle = "#173126";
    context.fillRect(310, 224, 94, 48);
    context.fillStyle = "#7af596";
    context.fillRect(318, 232, 30, 8);
    context.fillRect(352, 246, 40, 8);
  }

  drawTestConsole() {
    const context = this.context;
    context.fillStyle = "#1d2d25";
    context.fillRect(452, 340, 170, 124);
    context.fillStyle = "#7af596";
    context.fillRect(470, 358, 132, 18);
    context.fillStyle = "#091914";
    context.fillRect(482, 388, 108, 50);
    context.fillStyle = "#dffff2";
    context.fillRect(494, 400, 34, 8);
    context.fillRect(536, 400, 42, 8);
    context.fillRect(494, 416, 64, 8);
  }

  drawServerTower(time) {
    const context = this.context;
    const blink = Math.sin(time / 200) > 0 ? "#ffbe5c" : "#20363b";
    context.fillStyle = "#233840";
    context.fillRect(690, 136, 98, 228);
    context.fillStyle = "#112026";
    context.fillRect(704, 156, 70, 188);
    for (let y = 168; y < 322; y += 28) {
      context.fillStyle = blink;
      context.fillRect(718, y, 42, 10);
    }
  }

  drawLaunchPad(time) {
    const context = this.context;
    const pulse = 0.8 + Math.sin(time / 180) * 0.2;
    context.fillStyle = "#2d2418";
    context.fillRect(806, 390, 102, 84);
    context.fillStyle = `rgba(255, 190, 92, ${pulse})`;
    context.fillRect(826, 402, 62, 10);
    context.fillRect(850, 376, 14, 26);
  }

  drawEnvironment(arena, time) {
    this.drawTerminalBay();
    this.drawResearchDeck();
    this.drawTestConsole();
    this.drawServerTower(time);
    this.drawLaunchPad(time);

    const context = this.context;
    context.fillStyle = "#315057";
    context.fillRect(0, arena.groundY + 26, arena.width, 8);
  }

  drawHud(status) {
    const context = this.context;
    context.fillStyle = "rgba(5, 12, 16, 0.62)";
    context.fillRect(18, 18, 226, 74);
    context.strokeStyle = "rgba(255, 255, 255, 0.08)";
    context.strokeRect(18, 18, 226, 74);
    context.fillStyle = "#dffbf2";
    context.font = '18px "VT323", monospace';
    context.fillText(`Heroes ${status.heroCount}`, 30, 46);
    context.fillText(`Bugs ${status.bugCount}`, 30, 66);
    context.fillText(`Events ${status.totalEvents}`, 30, 86);
  }

  render(snapshot, time) {
    const arena = snapshot?.arena ?? {
      width: this.canvas.width,
      height: this.canvas.height,
      groundY: 520
    };

    this.drawBackdrop(arena, time);
    this.drawEnvironment(arena, time);
    this.effectsRenderer.drawBackground(this.context, snapshot?.effects ?? []);

    for (const enemy of snapshot?.enemies ?? []) {
      this.enemyRenderer.draw(this.context, enemy, time);
    }

    for (const hero of snapshot?.heroes ?? []) {
      this.heroRenderer.draw(this.context, hero, time);
    }

    this.effectsRenderer.drawForeground(this.context, snapshot?.effects ?? []);
    this.drawHud(
      snapshot?.status ?? {
        heroCount: 0,
        bugCount: 0,
        totalEvents: 0
      }
    );
  }
}

export default ArenaRenderer;
