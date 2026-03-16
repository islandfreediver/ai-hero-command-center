import { EventEmitter } from "node:events";
import { trimArray, uid } from "./utils.js";

const HERO_COLORS = {
  CodeHero: "#5fe0ff",
  ResearchHero: "#ffd96a",
  TestHero: "#78f58e",
  DebugHero: "#ff8266",
  DeployHero: "#f6b554"
};

const ENEMY_COLORS = {
  Bug: "#ff5f57",
  CriticalBug: "#ff9357",
  MemoryLeakMonster: "#d3ff68",
  TestFailureGhost: "#a7f2ff"
};

export class BattleEngine extends EventEmitter {
  constructor({ config, agentManager, enemyManager }) {
    super();
    this.config = config;
    this.agentManager = agentManager;
    this.enemyManager = enemyManager;
    this.effects = [];
    this.recentEvents = [];
    this.totalEvents = 0;
    this.totalDefeated = 0;
    this.totalDeploys = 0;
    this.lastEventAt = Date.now();
    this.lastIdleAt = 0;
    this.startedAt = Date.now();
    this.tickHandle = null;
    this.lastTickAt = 0;
    this.lastBroadcastAt = 0;
  }

  start() {
    if (this.tickHandle) {
      return;
    }

    this.lastTickAt = Date.now();
    this.tickHandle = setInterval(() => this.tick(), 1000 / this.config.timing.tickRate);
  }

  stop() {
    if (this.tickHandle) {
      clearInterval(this.tickHandle);
      this.tickHandle = null;
    }
  }

  getLastIdleAt() {
    return this.lastIdleAt;
  }

  addEffect(effect) {
    this.effects.push({
      id: uid("fx"),
      ...effect
    });

    if (this.effects.length > this.config.limits.effects) {
      this.effects = this.effects.slice(this.effects.length - this.config.limits.effects);
    }
  }

  recordFeed(item) {
    this.recentEvents.unshift({
      id: item.id ?? uid("feed"),
      timestamp: item.timestamp ?? Date.now(),
      type: item.type,
      label: item.label ?? item.type,
      message: item.message
    });
    this.recentEvents = trimArray(this.recentEvents.reverse(), this.config.limits.recentEvents).reverse();
  }

  handleEvent(event) {
    this.totalEvents += 1;
    this.lastEventAt = event.timestamp;
    if (event.type === "idle") {
      this.lastIdleAt = event.timestamp;
    }

    this.recordFeed({
      id: event.id,
      type: event.type,
      label: event.hero ?? event.enemy ?? event.type,
      message: event.message,
      timestamp: event.timestamp
    });

    if (event.hero) {
      const hero = this.agentManager.spawnFromEvent(event);
      if (hero) {
        this.addEffect({
          kind: "spawnRing",
          x: hero.x,
          y: hero.y,
          ttl: 0.42,
          maxTtl: 0.42,
          color: HERO_COLORS[hero.kind]
        });
      }
    }

    if (event.enemy) {
      const enemy = this.enemyManager.spawnFromEvent(event);
      if (enemy) {
        this.addEffect({
          kind: "spawnRing",
          x: enemy.x,
          y: enemy.y,
          ttl: 0.42,
          maxTtl: 0.42,
          color: ENEMY_COLORS[enemy.kind]
        });
      }
    }

    if (event.type === "deploy") {
      this.totalDeploys += 1;
    }

    this.emit("activity", event);
  }

  buildHeroEffect(action) {
    switch (action.attackerKind) {
      case "CodeHero":
        return {
          kind: "beam",
          from: action.from,
          to: action.to,
          ttl: 0.18,
          maxTtl: 0.18,
          color: HERO_COLORS.CodeHero
        };
      case "ResearchHero":
        return {
          kind: "pulse",
          x: action.from.x,
          y: action.from.y,
          ttl: 0.34,
          maxTtl: 0.34,
          radius: 72,
          color: HERO_COLORS.ResearchHero
        };
      case "TestHero":
        return {
          kind: "scannerWave",
          x: action.from.x,
          y: action.from.y,
          ttl: 0.42,
          maxTtl: 0.42,
          radius: 110,
          color: HERO_COLORS.TestHero
        };
      case "DebugHero":
        return {
          kind: "smash",
          x: action.to.x,
          y: action.to.y,
          ttl: 0.24,
          maxTtl: 0.24,
          radius: 28,
          color: HERO_COLORS.DebugHero
        };
      default:
        return null;
    }
  }

  buildEnemyEffect(action) {
    return {
      kind: "bugSplat",
      x: action.to.x,
      y: action.to.y,
      ttl: 0.18,
      maxTtl: 0.18,
      radius: 16,
      color: "#ff6f61"
    };
  }

  noteDefeat(side, entity, by) {
    this.totalDefeated += side === "enemy" ? 1 : 0;
    this.recordFeed({
      type: side === "enemy" ? "defeat" : "loss",
      label: entity.kind,
      message:
        side === "enemy"
          ? `${by} defeated ${entity.kind}.`
          : `${entity.kind} was overwhelmed by ${by}.`
    });

    this.addEffect({
      kind: side === "enemy" ? "explosion" : "collapse",
      x: entity.x,
      y: entity.y,
      ttl: 0.5,
      maxTtl: 0.5,
      radius: entity.size * 1.4,
      color: side === "enemy" ? ENEMY_COLORS[entity.kind] : HERO_COLORS[entity.kind]
    });
  }

  resolveActions(actions, source) {
    for (const action of actions) {
      if (action.type === "effect") {
        this.addEffect(action.effect);
        continue;
      }

      if (source === "hero" && action.type === "heroAttack") {
        const effect = this.buildHeroEffect(action);
        if (effect) {
          this.addEffect(effect);
        }

        const result = this.enemyManager.applyDamage(action.targetId, action.damage);
        if (result?.enemy) {
          this.addEffect({
            kind: "spark",
            x: result.enemy.x,
            y: result.enemy.y,
            ttl: 0.16,
            maxTtl: 0.16,
            radius: 10,
            color: "#fff59e"
          });
        }

        if (result?.defeated) {
          this.noteDefeat("enemy", result.enemy, action.attackerKind);
        }
      }

      if (source === "enemy" && action.type === "enemyAttack") {
        this.addEffect(this.buildEnemyEffect(action));
        const result = this.agentManager.applyDamage(action.targetId, action.damage);
        if (result?.defeated) {
          this.noteDefeat("hero", result.hero, action.attackerKind);
        }
      }
    }
  }

  tick() {
    const now = Date.now();
    const delta = Math.min(0.1, (now - this.lastTickAt) / 1000 || 0.033);
    this.lastTickAt = now;

    const heroActions = this.agentManager.update(delta, this.enemyManager.getEntities());
    const enemyActions = this.enemyManager.update(delta, this.agentManager.getEntities());

    this.resolveActions(heroActions, "hero");
    this.resolveActions(enemyActions, "enemy");

    const removedEnemies = this.enemyManager.removeDefeated();
    for (const enemy of removedEnemies) {
      if (enemy.hp <= 0) {
        continue;
      }
    }

    this.agentManager.removeDefeated();
    this.advanceEffects(delta);

    if (now - this.lastBroadcastAt >= 1000 / this.config.timing.broadcastRate) {
      this.lastBroadcastAt = now;
      this.emit("state", this.getStateSnapshot());
    }
  }

  advanceEffects(delta) {
    for (const effect of this.effects) {
      effect.ttl = Math.max(0, effect.ttl - delta);
    }

    this.effects = this.effects.filter((effect) => effect.ttl > 0);
  }

  getStateSnapshot() {
    return {
      arena: this.config.arena,
      heroes: this.agentManager.serialize(),
      enemies: this.enemyManager.serialize(),
      effects: this.effects.map((effect) => ({ ...effect })),
      status: {
        heroCount: this.agentManager.getActiveCount(),
        bugCount: this.enemyManager.getActiveCount(),
        totalEvents: this.totalEvents,
        totalDefeated: this.totalDefeated,
        totalDeploys: this.totalDeploys,
        uptimeMs: Date.now() - this.startedAt,
        lastEventAt: this.lastEventAt,
        recentEvents: [...this.recentEvents]
      },
      generatedAt: Date.now()
    };
  }
}

export default BattleEngine;
