import { distance, keepInsideArena, normalize, pickSpawnPoint, rand, uid } from "./utils.js";

const HERO_TEMPLATES = {
  CodeHero: {
    hp: 14,
    speed: 88,
    range: 150,
    damage: 4,
    cooldown: 0.75,
    size: 18,
    zone: "terminalBay"
  },
  ResearchHero: {
    hp: 11,
    speed: 68,
    range: 165,
    damage: 2,
    cooldown: 1.25,
    size: 18,
    zone: "researchDeck"
  },
  TestHero: {
    hp: 16,
    speed: 62,
    range: 140,
    damage: 3,
    cooldown: 1.45,
    size: 20,
    zone: "testConsole"
  },
  DebugHero: {
    hp: 18,
    speed: 84,
    range: 58,
    damage: 5,
    cooldown: 0.95,
    size: 20,
    zone: "terminalBay"
  },
  DeployHero: {
    hp: 10,
    speed: 78,
    range: 0,
    damage: 0,
    cooldown: 0,
    size: 20,
    zone: "launchPad"
  }
};

export class AgentManager {
  constructor({ config }) {
    this.config = config;
    this.heroes = [];
  }

  getEntities() {
    return this.heroes;
  }

  getActiveCount() {
    return this.heroes.length;
  }

  findClosestEnemy(hero, enemies) {
    let chosen = null;
    let shortestDistance = Number.POSITIVE_INFINITY;

    for (const enemy of enemies) {
      if (enemy.hp <= 0) {
        continue;
      }

      const gap = distance(hero, enemy);
      if (gap < shortestDistance) {
        chosen = enemy;
        shortestDistance = gap;
      }
    }

    return { enemy: chosen, gap: shortestDistance };
  }

  spawnFromEvent(event) {
    if (!event.hero || !HERO_TEMPLATES[event.hero]) {
      return null;
    }

    const template = HERO_TEMPLATES[event.hero];
    const zone = this.config.arena.spawnZones[template.zone];
    const spawn = pickSpawnPoint(zone);
    const hero = {
      id: uid("hero"),
      kind: event.hero,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      hp: template.hp,
      maxHp: template.hp,
      speed: template.speed,
      range: template.range,
      damage: template.damage,
      cooldown: template.cooldown,
      cooldownRemaining: rand(0.1, template.cooldown || 0.4),
      size: template.size,
      state: "spawn",
      stateTimer: 0.35,
      hitFlash: 0,
      age: 0,
      lifespan: event.hero === "DeployHero" ? 4 : rand(18, 28),
      targetId: null,
      facing: 1,
      driftSeed: rand(0, Math.PI * 2),
      trailCooldown: 0.06
    };

    if (hero.kind === "DeployHero") {
      hero.vx = 12;
      hero.vy = -90;
    }

    this.heroes.push(hero);

    if (this.heroes.length > this.config.limits.heroes) {
      this.heroes = this.heroes.slice(this.heroes.length - this.config.limits.heroes);
    }

    return hero;
  }

  update(delta, enemies) {
    const actions = [];
    const arena = this.config.arena;

    for (const hero of this.heroes) {
      hero.age += delta;
      hero.stateTimer = Math.max(0, hero.stateTimer - delta);
      hero.cooldownRemaining = Math.max(0, hero.cooldownRemaining - delta);
      hero.hitFlash = Math.max(0, hero.hitFlash - delta * 3);

      if (hero.kind === "DeployHero") {
        hero.state = "launch";
        hero.trailCooldown -= delta;
        hero.vy -= 260 * delta;
        hero.y += hero.vy * delta;
        hero.x += hero.vx * delta;

        if (hero.trailCooldown <= 0) {
          hero.trailCooldown = 0.08;
          actions.push({
            type: "effect",
            effect: {
              kind: "launchTrail",
              x: hero.x,
              y: hero.y + hero.size * 0.6,
              ttl: 0.32,
              maxTtl: 0.32,
              color: "#f8b85d"
            }
          });
        }

        continue;
      }

      const { enemy, gap } = this.findClosestEnemy(hero, enemies);
      hero.targetId = enemy?.id ?? null;

      if (enemy) {
        hero.facing = enemy.x >= hero.x ? 1 : -1;
        const desiredRange = hero.kind === "DebugHero" ? hero.range * 0.88 : hero.range * 0.72;

        if (gap > desiredRange) {
          const direction = normalize(enemy.x - hero.x, enemy.y - hero.y);
          hero.vx = direction.x * hero.speed;
          hero.vy = direction.y * hero.speed;
          hero.state = "move";
        } else {
          hero.vx *= 0.45;
          hero.vy *= 0.45;

          if (hero.cooldownRemaining === 0) {
            hero.state = "attack";
            hero.stateTimer = 0.18;
            hero.cooldownRemaining = hero.cooldown;
            actions.push({
              type: "heroAttack",
              attackerId: hero.id,
              attackerKind: hero.kind,
              targetId: enemy.id,
              damage: hero.damage,
              from: { x: hero.x, y: hero.y - hero.size * 0.4 },
              to: { x: enemy.x, y: enemy.y - enemy.size * 0.3 }
            });
          } else if (hero.stateTimer === 0) {
            hero.state = "idle";
          }
        }
      } else {
        const sway = hero.driftSeed + hero.age * (hero.kind === "ResearchHero" ? 2.2 : 1.6);
        hero.vx = Math.cos(sway) * hero.speed * 0.18;
        hero.vy = Math.sin(sway * 1.3) * hero.speed * 0.12;
        hero.state = hero.stateTimer > 0 ? hero.state : "idle";
      }

      hero.x += hero.vx * delta;
      hero.y += hero.vy * delta;
      keepInsideArena(hero, arena);
    }

    return actions;
  }

  applyDamage(targetId, damage) {
    const hero = this.heroes.find((entry) => entry.id === targetId);
    if (!hero) {
      return null;
    }

    hero.hp = Math.max(0, hero.hp - damage);
    hero.hitFlash = 1;
    hero.state = hero.hp > 0 ? "hit" : "defeat";
    hero.stateTimer = 0.22;

    return {
      hero,
      defeated: hero.hp <= 0
    };
  }

  removeDefeated() {
    const removed = this.heroes.filter(
      (hero) => hero.hp <= 0 || hero.age > hero.lifespan || hero.y < -80
    );
    this.heroes = this.heroes.filter(
      (hero) => hero.hp > 0 && hero.age <= hero.lifespan && hero.y >= -80
    );
    return removed;
  }

  serialize() {
    return this.heroes.map((hero) => ({
      id: hero.id,
      kind: hero.kind,
      x: hero.x,
      y: hero.y,
      hp: hero.hp,
      maxHp: hero.maxHp,
      state: hero.state,
      targetId: hero.targetId,
      facing: hero.facing,
      size: hero.size,
      hitFlash: hero.hitFlash
    }));
  }
}

export default AgentManager;
