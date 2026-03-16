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
        context.strokeStyle = effect.color ?? "#ffffff";
        context.beginPath();
        context.moveTo(effect.from2d?.x ?? effect.from?.x ?? effect.x ?? 0, effect.from2d?.y ?? effect.from?.y ?? effect.y ?? 0);
        context.lineTo(effect.to2d?.x ?? effect.to?.x ?? effect.x ?? 0, effect.to2d?.y ?? effect.to?.y ?? effect.y ?? 0);
        context.stroke();
        break;
      case "scannerWave":
      case "pulse":
      case "spawnRing":
        context.beginPath();
        context.arc(
          effect.x ?? 0,
          effect.y ?? 0,
          (effect.pixelRadius ?? effect.radius ?? 28) * (2 - life),
          0,
          Math.PI * 2
        );
        context.stroke();
        break;
      case "smash":
      case "bugSplat":
        context.fillRect((effect.x ?? 0) - 10, (effect.y ?? 0) - 2, 20, 4);
        context.fillRect((effect.x ?? 0) - 2, (effect.y ?? 0) - 10, 4, 20);
        break;
      case "spark":
        context.fillRect((effect.x ?? 0) - 2, (effect.y ?? 0) - 2, 4, 4);
        context.fillRect((effect.x ?? 0) - 7, (effect.y ?? 0) - 1, 4, 2);
        context.fillRect((effect.x ?? 0) + 3, (effect.y ?? 0) - 1, 4, 2);
        break;
      case "explosion":
      case "collapse":
        context.beginPath();
        context.arc(
          effect.x ?? 0,
          effect.y ?? 0,
          (effect.pixelRadius ?? effect.radius) * (1.35 - life * 0.35),
          0,
          Math.PI * 2
        );
        context.fill();
        break;
      case "launchTrail":
        context.fillRect((effect.x ?? 0) - 4, (effect.y ?? 0) - 2, 8, 12);
        context.fillRect((effect.x ?? 0) - 2, (effect.y ?? 0) + 10, 4, 8);
        break;
      default:
        break;
    }

    context.restore();
  }
}

export default EffectsRenderer;
