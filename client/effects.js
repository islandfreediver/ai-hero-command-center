export class EffectsRenderer {
  drawBackground(context, effects) {
    for (const effect of effects) {
      if (["spawnRing", "scannerWave", "pulse", "launchTrail"].includes(effect.kind)) {
        this.drawEffect(context, effect);
      }
    }
  }

  drawForeground(context, effects) {
    for (const effect of effects) {
      if (!["spawnRing", "scannerWave", "pulse", "launchTrail"].includes(effect.kind)) {
        this.drawEffect(context, effect);
      }
    }
  }

  drawEffect(context, effect) {
    const life = effect.maxTtl ? effect.ttl / effect.maxTtl : 1;
    context.save();
    context.globalAlpha = Math.max(0.08, life);
    context.strokeStyle = effect.color ?? "#ffffff";
    context.fillStyle = effect.color ?? "#ffffff";
    context.lineWidth = 3;

    switch (effect.kind) {
      case "beam":
        context.beginPath();
        context.moveTo(effect.from.x, effect.from.y);
        context.lineTo(effect.to.x, effect.to.y);
        context.stroke();
        break;
      case "scannerWave":
      case "pulse":
      case "spawnRing":
        context.beginPath();
        context.arc(effect.x, effect.y, (effect.radius ?? 28) * (2 - life), 0, Math.PI * 2);
        context.stroke();
        break;
      case "smash":
      case "bugSplat":
        context.fillRect(effect.x - 10, effect.y - 2, 20, 4);
        context.fillRect(effect.x - 2, effect.y - 10, 4, 20);
        break;
      case "spark":
        context.fillRect(effect.x - 2, effect.y - 2, 4, 4);
        context.fillRect(effect.x - 7, effect.y - 1, 4, 2);
        context.fillRect(effect.x + 3, effect.y - 1, 4, 2);
        break;
      case "explosion":
      case "collapse":
        context.beginPath();
        context.arc(effect.x, effect.y, effect.radius * (1.35 - life * 0.35), 0, Math.PI * 2);
        context.fill();
        break;
      case "launchTrail":
        context.fillRect(effect.x - 4, effect.y - 2, 8, 12);
        context.fillRect(effect.x - 2, effect.y + 10, 4, 8);
        break;
      default:
        break;
    }

    context.restore();
  }
}

export default EffectsRenderer;
