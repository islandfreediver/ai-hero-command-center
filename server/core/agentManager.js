import {
  cloneVector,
  distance3d,
  moveTowards3d,
  rand,
  uid,
  worldToPixel
} from "./utils.js";

const HERO_TEMPLATES = {
  CodeHero: {
    role: "coding",
    hp: 14,
    speed: 12,
    range: 5.5,
    damage: 4,
    cooldown: 0.7,
    size: 1.2
  },
  ResearchHero: {
    role: "research",
    hp: 11,
    speed: 10,
    range: 7.2,
    damage: 2,
    cooldown: 1.15,
    size: 1.15
  },
  TestHero: {
    role: "testing",
    hp: 16,
    speed: 9.5,
    range: 6.1,
    damage: 3,
    cooldown: 1.35,
    size: 1.28
  },
  DebugHero: {
    role: "debug",
    hp: 18,
    speed: 12.5,
    range: 3.4,
    damage: 5,
    cooldown: 0.9,
    size: 1.3
  },
  DeployHero: {
    role: "deploy",
    hp: 10,
    speed: 13,
    range: 0,
    damage: 0,
    cooldown: 0,
    size: 1.35
  }
};

const attackPriority = (agent, bug) => {
  let score = 0;
  if (bug.projectId === agent.projectId) {
    score += 6;
  }
  if (bug.boss) {
    score += 12;
  }
  if (bug.kind === "CriticalBug") {
    score += 4;
  }
  return score;
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

  getCountForProject(projectId) {
    return this.heroes.filter((hero) => hero.projectId === projectId).length;
  }

  spawnFromEvent(event, { projectLayouts = new Map(), corePosition = { x: 0, y: 0, z: 0 } } = {}) {
    if (!event.hero || !HERO_TEMPLATES[event.hero]) {
      return null;
    }

    const template = HERO_TEMPLATES[event.hero];
    const projectLayout = projectLayouts.get(event.projectId);
    const position = {
      x: (corePosition.x ?? 0) + rand(-1.6, 1.6),
      y: (corePosition.y ?? 0) + rand(-0.2, 1.2),
      z: (corePosition.z ?? 0) + rand(-1.6, 1.6)
    };
    const hero = {
      id: uid("hero"),
      kind: event.hero,
      role: template.role,
      projectId: event.projectId,
      targetProjectId: event.projectId,
      projectName: event.projectName ?? null,
      state: "travel",
      position,
      velocity: { x: 0, y: 0, z: 0 },
      hp: template.hp,
      maxHp: template.hp,
      speed: template.speed,
      range: template.range,
      damage: template.damage,
      cooldown: template.cooldown,
      cooldownRemaining: rand(0.1, Math.max(template.cooldown, 0.35)),
      size: template.size,
      hitFlash: 0,
      age: 0,
      lifespan: event.hero === "DeployHero" ? 6 : rand(18, 28),
      targetId: null,
      orbitAngle: projectLayout?.angle ?? rand(0, Math.PI * 2),
      orbitRadius: rand(1.6, 3.2),
      launchTrailCooldown: 0.06,
      seed: rand(0, Math.PI * 2)
    };

    this.heroes.push(hero);

    if (this.heroes.length > this.config.limits.heroes) {
      this.heroes = this.heroes.slice(this.heroes.length - this.config.limits.heroes);
    }

    return hero;
  }

  selectTarget(hero, enemies) {
    let chosen = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const enemy of enemies) {
      if (enemy.hp <= 0) {
        continue;
      }

      const priority = attackPriority(hero, enemy);
      const gap = distance3d(hero.position, enemy.position);
      const score = priority - gap * 0.4;
      if (score > bestScore) {
        chosen = enemy;
        bestScore = score;
      }
    }

    return chosen;
  }

  updateDeployHero(hero, delta, context, actions) {
    const { projectLayouts = new Map(), world = {} } = context;
    const launchHeight = world.launchHeight ?? 32;
    const projectLayout = projectLayouts.get(hero.projectId);
    const padTarget = projectLayout
      ? {
          x: projectLayout.position.x * 0.92,
          y: 2.4,
          z: projectLayout.position.z * 0.92
        }
      : { x: 0, y: 2.4, z: 0 };

    hero.launchTrailCooldown -= delta;

    if (hero.state !== "launch") {
      const movement = moveTowards3d(hero.position, padTarget, hero.speed * delta);
      hero.position = movement.position;
      hero.state = movement.arrived || hero.age > 0.9 ? "launch" : "travel";
      hero.targetProjectId = hero.projectId;
    } else {
      hero.position.y += hero.speed * delta * 2.35;
      hero.position.x += Math.cos(hero.seed + hero.age * 4) * delta * 0.5;
      hero.position.z += Math.sin(hero.seed + hero.age * 4) * delta * 0.5;
      if (hero.launchTrailCooldown <= 0) {
        hero.launchTrailCooldown = 0.08;
        actions.push({
          type: "effect",
          effect: {
            kind: "launchTrail",
            position: cloneVector(hero.position),
            ttl: 0.34,
            maxTtl: 0.34,
            color: "#ffbe63"
          }
        });
      }
    }

    hero.velocity = { x: 0, y: 0, z: 0 };
    hero.position.y = Math.min(hero.position.y, launchHeight + 4);
  }

  updateCombatHero(hero, delta, context, actions) {
    const { enemies = [], projectLayouts = new Map(), corePosition = { x: 0, y: 3.2, z: 0 }, world = {} } =
      context;
    const idleOrbitRadius = world.idleOrbitRadius ?? 8;
    const targetEnemy = this.selectTarget(hero, enemies);
    hero.targetId = targetEnemy?.id ?? null;

    if (targetEnemy) {
      hero.targetProjectId = targetEnemy.projectId;
      const desired = {
        x: targetEnemy.position.x,
        y: targetEnemy.position.y + 0.8,
        z: targetEnemy.position.z
      };
      const gap = distance3d(hero.position, desired);
      if (gap > hero.range) {
        const movement = moveTowards3d(hero.position, desired, hero.speed * delta);
        hero.position = movement.position;
        hero.state = "move";
      } else if (hero.cooldownRemaining === 0) {
        hero.state = "attack";
        hero.cooldownRemaining = hero.cooldown;
        actions.push({
          type: "heroAttack",
          attackerId: hero.id,
          attackerKind: hero.kind,
          targetId: targetEnemy.id,
          damage: hero.damage,
          from: cloneVector(hero.position),
          to: cloneVector(targetEnemy.position)
        });
      } else {
        hero.state = "hold";
      }
      return;
    }

    const projectLayout = projectLayouts.get(hero.projectId);
    if (hero.state === "travel" && projectLayout) {
      const nodeHover = {
        x: projectLayout.position.x * 0.82,
        y: 2.2 + Math.sin(hero.age * 2 + hero.seed) * 0.4,
        z: projectLayout.position.z * 0.82
      };
      const movement = moveTowards3d(hero.position, nodeHover, hero.speed * delta);
      hero.position = movement.position;
      hero.state = movement.arrived || hero.age > 1.4 ? "patrol" : "travel";
      hero.targetProjectId = hero.projectId;
      return;
    }

    hero.orbitAngle += delta * (0.55 + hero.speed * 0.03);
    const orbitRadius = idleOrbitRadius + hero.orbitRadius;
    hero.position = {
      x: corePosition.x + Math.cos(hero.orbitAngle + hero.seed) * orbitRadius,
      y: (corePosition.y ?? 3.2) + Math.sin(hero.age * 2.2 + hero.seed) * 0.9,
      z: corePosition.z + Math.sin(hero.orbitAngle + hero.seed) * orbitRadius
    };
    hero.state = "patrol";
    hero.targetProjectId = hero.projectId;
  }

  update(delta, context = {}) {
    const actions = [];

    for (const hero of this.heroes) {
      hero.age += delta;
      hero.cooldownRemaining = Math.max(0, hero.cooldownRemaining - delta);
      hero.hitFlash = Math.max(0, hero.hitFlash - delta * 3);

      if (hero.kind === "DeployHero") {
        this.updateDeployHero(hero, delta, context, actions);
      } else {
        this.updateCombatHero(hero, delta, context, actions);
      }
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

    return {
      hero,
      defeated: hero.hp <= 0
    };
  }

  removeDefeated({ world = {} } = {}) {
    const launchHeight = world.launchHeight ?? 32;
    const removed = this.heroes.filter(
      (hero) => hero.hp <= 0 || hero.age > hero.lifespan || hero.position.y > launchHeight + 4
    );
    this.heroes = this.heroes.filter(
      (hero) => hero.hp > 0 && hero.age <= hero.lifespan && hero.position.y <= launchHeight + 4
    );
    return removed;
  }

  serialize({ arena = {}, world = {} } = {}) {
    return this.heroes.map((hero) => {
      const pixel = worldToPixel(hero.position, arena, world);
      return {
        id: hero.id,
        kind: hero.kind,
        role: hero.role,
        projectId: hero.projectId,
        targetProjectId: hero.targetProjectId,
        state: hero.state,
        position: cloneVector(hero.position),
        hp: hero.hp,
        maxHp: hero.maxHp,
        size: hero.size,
        pixelSize: 16 + hero.size * 7,
        hitFlash: hero.hitFlash,
        targetId: hero.targetId,
        launching: hero.kind === "DeployHero" && hero.state === "launch",
        x: pixel.x,
        y: pixel.y
      };
    });
  }
}

export default AgentManager;
