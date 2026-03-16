import {
  cloneVector,
  distance3d,
  moveTowards3d,
  rand,
  uid,
  worldToPixel
} from "./utils.js";

const ENEMY_TEMPLATES = {
  Bug: {
    hp: 8,
    speed: 5.5,
    damage: 2,
    range: 2.1,
    size: 1.3
  },
  CriticalBug: {
    hp: 14,
    speed: 6.6,
    damage: 3,
    range: 2.4,
    size: 1.7
  },
  MemoryLeakMonster: {
    hp: 20,
    speed: 3.5,
    damage: 3,
    range: 3.1,
    size: 2.2
  },
  TestFailureGhost: {
    hp: 10,
    speed: 4.8,
    damage: 2,
    range: 2.5,
    size: 1.5
  },
  BossBug: {
    hp: 44,
    speed: 3.2,
    damage: 4,
    range: 3.6,
    size: 3.2
  }
};

const enemyPriority = (enemy, hero) => {
  let score = 0;
  if (hero.projectId === enemy.projectId) {
    score += 5;
  }
  if (hero.role === "deploy") {
    score -= 3;
  }
  if (enemy.boss) {
    score += 4;
  }
  return score;
};

export class EnemyManager {
  constructor({ config }) {
    this.config = config;
    this.enemies = [];
  }

  getEntities() {
    return this.enemies;
  }

  getActiveCount() {
    return this.enemies.length;
  }

  getCountForProject(projectId) {
    return this.enemies.filter((enemy) => enemy.projectId === projectId).length;
  }

  hasBoss(projectId) {
    return this.enemies.some((enemy) => enemy.projectId === projectId && enemy.boss && enemy.hp > 0);
  }

  spawnFromEvent(event, { projectLayouts = new Map(), kindOverride = null } = {}) {
    const enemyKind = kindOverride || event.enemy;
    if (!enemyKind || !ENEMY_TEMPLATES[enemyKind]) {
      return null;
    }

    const template = ENEMY_TEMPLATES[enemyKind];
    const projectLayout = projectLayouts.get(event.projectId);
    const anchor = projectLayout?.position ?? { x: 0, y: 0, z: 0 };
    const enemy = {
      id: uid("bug"),
      kind: enemyKind,
      projectId: event.projectId,
      projectName: event.projectName ?? null,
      boss: enemyKind === "BossBug",
      position: {
        x: anchor.x + rand(-2.6, 2.6),
        y: anchor.y + rand(0.6, 2.6),
        z: anchor.z + rand(-2.6, 2.6)
      },
      hp: template.hp,
      maxHp: template.hp,
      speed: template.speed,
      damage: template.damage,
      range: template.range,
      size: template.size,
      cooldownRemaining: rand(0.2, 0.8),
      state: "spawn",
      age: 0,
      hitFlash: 0,
      targetId: null,
      orbitAngle: rand(0, Math.PI * 2),
      seed: rand(0, Math.PI * 2)
    };

    this.enemies.push(enemy);

    if (this.enemies.length > this.config.limits.enemies) {
      this.enemies = this.enemies.slice(this.enemies.length - this.config.limits.enemies);
    }

    return enemy;
  }

  selectTarget(enemy, heroes) {
    let chosen = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const hero of heroes) {
      if (hero.hp <= 0 || hero.kind === "DeployHero") {
        continue;
      }

      const priority = enemyPriority(enemy, hero);
      const gap = distance3d(enemy.position, hero.position);
      const score = priority - gap * 0.45;
      if (score > bestScore) {
        chosen = hero;
        bestScore = score;
      }
    }

    return chosen;
  }

  update(delta, context = {}) {
    const actions = [];
    const { heroes = [], projectLayouts = new Map() } = context;

    for (const enemy of this.enemies) {
      enemy.age += delta;
      enemy.cooldownRemaining = Math.max(0, enemy.cooldownRemaining - delta);
      enemy.hitFlash = Math.max(0, enemy.hitFlash - delta * 3);

      const projectLayout = projectLayouts.get(enemy.projectId);
      const anchor = projectLayout?.position ?? { x: 0, y: 0, z: 0 };
      const targetHero = this.selectTarget(enemy, heroes);
      enemy.targetId = targetHero?.id ?? null;

      if (enemy.kind === "MemoryLeakMonster") {
        enemy.size = ENEMY_TEMPLATES.MemoryLeakMonster.size + Math.min(1.6, enemy.age * 0.06);
      }

      if (targetHero) {
        const desired = cloneVector(targetHero.position);
        const gap = distance3d(enemy.position, desired);
        if (gap > enemy.range) {
          const movement = moveTowards3d(enemy.position, desired, enemy.speed * delta);
          enemy.position = movement.position;
          enemy.state = "move";
        } else if (enemy.cooldownRemaining === 0) {
          enemy.cooldownRemaining = enemy.boss ? 0.75 : 1.15;
          enemy.state = "attack";
          actions.push({
            type: "enemyAttack",
            attackerId: enemy.id,
            attackerKind: enemy.kind,
            targetId: targetHero.id,
            damage: enemy.damage,
            from: cloneVector(enemy.position),
            to: cloneVector(targetHero.position)
          });
        } else {
          enemy.state = "hold";
        }
      } else {
        enemy.orbitAngle += delta * (enemy.boss ? 0.55 : 0.8);
        const hoverRadius = enemy.boss ? 3.8 : 2.2;
        enemy.position = {
          x: anchor.x + Math.cos(enemy.orbitAngle + enemy.seed) * hoverRadius,
          y: 1.4 + Math.sin(enemy.age * 2 + enemy.seed) * (enemy.boss ? 1 : 0.45),
          z: anchor.z + Math.sin(enemy.orbitAngle + enemy.seed) * hoverRadius
        };
        enemy.state = "patrol";
      }
    }

    return actions;
  }

  applyDamage(targetId, damage) {
    const enemy = this.enemies.find((entry) => entry.id === targetId);
    if (!enemy) {
      return null;
    }

    enemy.hp = Math.max(0, enemy.hp - damage);
    enemy.hitFlash = 1;
    enemy.state = enemy.hp > 0 ? "hit" : "defeat";

    return {
      enemy,
      defeated: enemy.hp <= 0
    };
  }

  removeDefeated() {
    const removed = this.enemies.filter((enemy) => enemy.hp <= 0);
    this.enemies = this.enemies.filter((enemy) => enemy.hp > 0);
    return removed;
  }

  serialize({ arena = {}, world = {} } = {}) {
    return this.enemies.map((enemy) => {
      const pixel = worldToPixel(enemy.position, arena, world);
      return {
        id: enemy.id,
        kind: enemy.kind,
        projectId: enemy.projectId,
        boss: enemy.boss,
        state: enemy.state,
        position: cloneVector(enemy.position),
        hp: enemy.hp,
        maxHp: enemy.maxHp,
        size: enemy.size,
        pixelSize: 16 + enemy.size * 7,
        hitFlash: enemy.hitFlash,
        targetId: enemy.targetId,
        x: pixel.x,
        y: pixel.y
      };
    });
  }
}

export default EnemyManager;
