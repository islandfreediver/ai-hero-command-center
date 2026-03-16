import { distance, keepInsideArena, normalize, pickSpawnPoint, rand, uid } from "./utils.js";

const ENEMY_TEMPLATES = {
  Bug: {
    hp: 8,
    speed: 36,
    damage: 2,
    range: 22,
    size: 18
  },
  CriticalBug: {
    hp: 14,
    speed: 52,
    damage: 3,
    range: 24,
    size: 24
  },
  MemoryLeakMonster: {
    hp: 20,
    speed: 18,
    damage: 3,
    range: 30,
    size: 28
  },
  TestFailureGhost: {
    hp: 10,
    speed: 30,
    damage: 2,
    range: 26,
    size: 20
  }
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

  findClosestHero(enemy, heroes) {
    let chosen = null;
    let shortestDistance = Number.POSITIVE_INFINITY;

    for (const hero of heroes) {
      if (hero.hp <= 0 || hero.kind === "DeployHero") {
        continue;
      }

      const gap = distance(enemy, hero);
      if (gap < shortestDistance) {
        chosen = hero;
        shortestDistance = gap;
      }
    }

    return { hero: chosen, gap: shortestDistance };
  }

  spawnFromEvent(event) {
    if (!event.enemy || !ENEMY_TEMPLATES[event.enemy]) {
      return null;
    }

    const zone = this.config.arena.spawnZones.enemyField;
    const spawn = pickSpawnPoint(zone);
    const template = ENEMY_TEMPLATES[event.enemy];
    const enemy = {
      id: uid("bug"),
      kind: event.enemy,
      x: spawn.x,
      y: spawn.y,
      vx: rand(-18, 18),
      vy: rand(-12, 12),
      hp: template.hp,
      maxHp: template.hp,
      speed: template.speed,
      damage: template.damage,
      range: template.range,
      size: template.size,
      cooldownRemaining: rand(0.2, 0.8),
      attackCooldown: template.kind === "CriticalBug" ? 0.85 : 1.1,
      state: "spawn",
      stateTimer: 0.35,
      age: 0,
      hitFlash: 0,
      facing: rand(0, 1) > 0.5 ? 1 : -1,
      driftSeed: rand(0, Math.PI * 2)
    };

    this.enemies.push(enemy);

    if (this.enemies.length > this.config.limits.enemies) {
      this.enemies = this.enemies.slice(this.enemies.length - this.config.limits.enemies);
    }

    return enemy;
  }

  update(delta, heroes) {
    const actions = [];
    const arena = this.config.arena;

    for (const enemy of this.enemies) {
      enemy.age += delta;
      enemy.stateTimer = Math.max(0, enemy.stateTimer - delta);
      enemy.cooldownRemaining = Math.max(0, enemy.cooldownRemaining - delta);
      enemy.hitFlash = Math.max(0, enemy.hitFlash - delta * 3);

      if (enemy.kind === "MemoryLeakMonster") {
        const growth = Math.min(1.8, 1 + enemy.age * 0.035);
        enemy.size = ENEMY_TEMPLATES.MemoryLeakMonster.size * growth;
        enemy.maxHp = ENEMY_TEMPLATES.MemoryLeakMonster.hp * growth;
      }

      const { hero, gap } = this.findClosestHero(enemy, heroes);
      if (hero) {
        enemy.facing = hero.x >= enemy.x ? 1 : -1;

        if (enemy.kind === "CriticalBug" || gap < 180) {
          const direction = normalize(hero.x - enemy.x, hero.y - enemy.y);
          enemy.vx = direction.x * enemy.speed;
          enemy.vy = direction.y * enemy.speed;
          enemy.state = "move";
        } else {
          enemy.vx = Math.cos(enemy.driftSeed + enemy.age * 1.2) * enemy.speed * 0.28;
          enemy.vy = Math.sin(enemy.driftSeed + enemy.age * 1.6) * enemy.speed * 0.22;
          enemy.state = enemy.stateTimer > 0 ? enemy.state : "idle";
        }

        if (gap <= enemy.range + hero.size * 0.35 && enemy.cooldownRemaining === 0) {
          enemy.cooldownRemaining = enemy.kind === "CriticalBug" ? 0.8 : 1.2;
          enemy.state = "attack";
          enemy.stateTimer = 0.2;
          actions.push({
            type: "enemyAttack",
            attackerId: enemy.id,
            attackerKind: enemy.kind,
            targetId: hero.id,
            damage: enemy.damage,
            from: { x: enemy.x, y: enemy.y },
            to: { x: hero.x, y: hero.y }
          });
        }
      } else {
        enemy.vx = Math.cos(enemy.driftSeed + enemy.age * 0.8) * enemy.speed * 0.32;
        enemy.vy = Math.sin(enemy.driftSeed + enemy.age * 1.05) * enemy.speed * 0.26;
        enemy.state = enemy.stateTimer > 0 ? enemy.state : "idle";
      }

      if (enemy.kind === "TestFailureGhost") {
        enemy.y += Math.sin(enemy.age * 4) * 10 * delta;
      }

      enemy.x += enemy.vx * delta;
      enemy.y += enemy.vy * delta;
      keepInsideArena(enemy, arena);
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
    enemy.stateTimer = 0.2;

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

  serialize() {
    return this.enemies.map((enemy) => ({
      id: enemy.id,
      kind: enemy.kind,
      x: enemy.x,
      y: enemy.y,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      state: enemy.state,
      size: enemy.size,
      facing: enemy.facing,
      hitFlash: enemy.hitFlash
    }));
  }
}

export default EnemyManager;
