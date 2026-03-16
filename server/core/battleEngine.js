import { EventEmitter } from "node:events";
import {
  clamp,
  cloneVector,
  projectNodePosition,
  uid,
  worldToPixel
} from "./utils.js";

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
  TestFailureGhost: "#a7f2ff",
  BossBug: "#ff5ede"
};

export class BattleEngine extends EventEmitter {
  constructor({ config, projects, agentManager, enemyManager, defaultProjectId }) {
    super();
    this.config = config;
    this.projects = projects;
    this.defaultProjectId = defaultProjectId;
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
    this.corePosition = { x: 0, y: this.config.world.coreHeight ?? 3.2, z: 0 };
    this.projectLayouts = new Map();
    this.projectState = new Map();
    this.simulation = {
      active: false,
      intervalMs: this.config.simulation?.intervalMs ?? 1500,
      sequenceIndex: 0,
      projectIndex: 0
    };
    this.dirty = true;

    for (const project of this.projects) {
      const position = projectNodePosition(project.slotIndex, this.projects.length, this.config.world);
      this.projectLayouts.set(project.id, {
        angle: position.angle,
        position
      });
      this.projectState.set(project.id, {
        ...project,
        activityLevel: 0,
        lastEventAt: 0,
        lastEventType: "idle",
        errorTimestamps: [],
        launchCount: 0,
        bossActive: false
      });
    }
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

  getDefaultProject() {
    return this.projects.find((project) => project.id === this.defaultProjectId) ?? this.projects[0] ?? null;
  }

  getBugPressure(projectId) {
    return this.enemyManager.getEntities().filter((enemy) => enemy.projectId === projectId && enemy.hp > 0)
      .length;
  }

  setSimulationState(simulationState) {
    this.simulation = {
      ...this.simulation,
      ...simulationState
    };
    this.dirty = true;
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
    this.recentEvents = [
      {
        id: item.id ?? uid("feed"),
        timestamp: item.timestamp ?? Date.now(),
        type: item.type,
        label: item.label ?? item.type,
        message: item.message
      },
      ...this.recentEvents
    ].slice(0, this.config.limits.recentEvents);
  }

  ensureProjectState(projectId) {
    return this.projectState.get(projectId) ?? this.projectState.get(this.defaultProjectId) ?? null;
  }

  boostProjectActivity(projectId, type, timestamp) {
    const state = this.ensureProjectState(projectId);
    if (!state) {
      return null;
    }

    state.activityLevel = clamp(
      state.activityLevel +
        (type === "error"
          ? 0.42
          : type === "deploy"
            ? 0.48
            : type === "testing"
              ? 0.3
              : type === "idle"
                ? 0
                : 0.24),
      0,
      1
    );
    state.lastEventAt = timestamp;
    state.lastEventType = type;

    if (type === "error") {
      state.errorTimestamps.push(timestamp);
      state.errorTimestamps = state.errorTimestamps.filter((entry) => timestamp - entry <= 20000);
    }

    if (type === "deploy") {
      state.launchCount += 1;
    }

    return state;
  }

  maybeSpawnBoss(projectState, event) {
    if (
      event.type !== "error" ||
      !projectState ||
      projectState.bossActive ||
      projectState.errorTimestamps.length < 3 ||
      this.enemyManager.hasBoss(projectState.id)
    ) {
      return null;
    }

    projectState.bossActive = true;
    const boss = this.enemyManager.spawnFromEvent(
      {
        ...event,
        enemy: "BossBug"
      },
      { projectLayouts: this.projectLayouts, kindOverride: "BossBug" }
    );

    if (!boss) {
      return null;
    }

    this.recordFeed({
      type: "boss",
      label: "BossBug",
      message: `${projectState.name}: boss bug breach detected.`
    });
    this.addEffect({
      kind: "spawnRing",
      position: cloneVector(boss.position),
      ttl: 0.55,
      maxTtl: 0.55,
      radius: 3.5,
      color: ENEMY_COLORS.BossBug
    });

    return boss;
  }

  handleEvent(event) {
    this.totalEvents += 1;
    this.lastEventAt = event.timestamp;
    if (event.type === "idle") {
      this.lastIdleAt = event.timestamp;
    }

    const projectState = this.boostProjectActivity(event.projectId, event.type, event.timestamp);
    this.recordFeed({
      id: event.id,
      type: event.type,
      label: event.projectName
        ? `${event.projectName} · ${event.hero ?? event.enemy ?? event.type}`
        : event.hero ?? event.enemy ?? event.type,
      message: event.message,
      timestamp: event.timestamp
    });

    if (event.hero) {
      const hero = this.agentManager.spawnFromEvent(event, {
        projectLayouts: this.projectLayouts,
        corePosition: this.corePosition
      });
      if (hero) {
        this.addEffect({
          kind: "spawnRing",
          position: cloneVector(hero.position),
          ttl: 0.42,
          maxTtl: 0.42,
          radius: 2.2,
          color: HERO_COLORS[hero.kind]
        });
      }
    }

    if (event.enemy) {
      const enemy = this.enemyManager.spawnFromEvent(event, {
        projectLayouts: this.projectLayouts
      });
      if (enemy) {
        this.addEffect({
          kind: "spawnRing",
          position: cloneVector(enemy.position),
          ttl: 0.42,
          maxTtl: 0.42,
          radius: enemy.boss ? 3.2 : 2.1,
          color: ENEMY_COLORS[enemy.kind]
        });
      }
    }

    if (projectState) {
      this.maybeSpawnBoss(projectState, event);
    }

    if (event.type === "deploy") {
      this.totalDeploys += 1;
    }

    this.dirty = true;
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
          position: cloneVector(action.from),
          ttl: 0.32,
          maxTtl: 0.32,
          radius: 3.8,
          color: HERO_COLORS.ResearchHero
        };
      case "TestHero":
        return {
          kind: "scannerWave",
          position: cloneVector(action.from),
          ttl: 0.4,
          maxTtl: 0.4,
          radius: 5.2,
          color: HERO_COLORS.TestHero
        };
      case "DebugHero":
        return {
          kind: "smash",
          position: cloneVector(action.to),
          ttl: 0.24,
          maxTtl: 0.24,
          radius: 2.4,
          color: HERO_COLORS.DebugHero
        };
      default:
        return null;
    }
  }

  buildEnemyEffect(action) {
    return {
      kind: "bugSplat",
      position: cloneVector(action.to),
      ttl: 0.2,
      maxTtl: 0.2,
      radius: 2,
      color: "#ff6f61"
    };
  }

  noteDefeat(side, entity, by) {
    if (side === "enemy") {
      this.totalDefeated += 1;
    }

    if (entity.projectId) {
      const state = this.ensureProjectState(entity.projectId);
      if (state && entity.boss) {
        state.bossActive = false;
        state.errorTimestamps = [];
      }
    }

    const label = entity.boss ? entity.kind : entity.kind;
    this.recordFeed({
      type: side === "enemy" ? "defeat" : "loss",
      label,
      message:
        side === "enemy"
          ? `${by} defeated ${label}.`
          : `${label} overwhelmed an agent.`
    });

    this.addEffect({
      kind: side === "enemy" ? "explosion" : "collapse",
      position: cloneVector(entity.position),
      ttl: entity.boss ? 0.8 : 0.5,
      maxTtl: entity.boss ? 0.8 : 0.5,
      radius: entity.size * (entity.boss ? 2 : 1.4),
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
            position: cloneVector(result.enemy.position),
            ttl: 0.16,
            maxTtl: 0.16,
            radius: 1.2,
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

  decayProjectState(delta) {
    const now = Date.now();
    for (const state of this.projectState.values()) {
      state.activityLevel = Math.max(0, state.activityLevel - delta * 0.07);
      state.errorTimestamps = state.errorTimestamps.filter((entry) => now - entry <= 20000);
      if (!this.enemyManager.hasBoss(state.id)) {
        state.bossActive = false;
      }
    }
  }

  advanceEffects(delta) {
    for (const effect of this.effects) {
      effect.ttl = Math.max(0, effect.ttl - delta);
    }

    this.effects = this.effects.filter((effect) => effect.ttl > 0);
  }

  getCoreSnapshot() {
    const activityLevels = Array.from(this.projectState.values()).map((project) => project.activityLevel);
    const averageActivity =
      activityLevels.length > 0
        ? activityLevels.reduce((sum, value) => sum + value, 0) / activityLevels.length
        : 0;
    const bugPressure = clamp(this.enemyManager.getActiveCount() / Math.max(1, this.config.limits.enemies), 0, 1);
    const activityLevel = clamp(averageActivity + bugPressure * 0.35, 0, 1);
    return {
      position: cloneVector(this.corePosition),
      activityLevel,
      pulse: 0.3 + activityLevel * 0.7,
      rotationSpeed: 0.2 + activityLevel * 0.8
    };
  }

  getProjectsSnapshot(agents, bugs) {
    return this.projects.map((project) => {
      const state = this.ensureProjectState(project.id);
      const layout = this.projectLayouts.get(project.id);
      const projectAgents = agents.filter((agent) => agent.projectId === project.id);
      const projectBugs = bugs.filter((bug) => bug.projectId === project.id);
      return {
        id: project.id,
        name: project.name,
        path: project.path,
        color: project.color,
        exists: project.exists,
        status: project.status,
        slotIndex: project.slotIndex,
        position: cloneVector(layout?.position ?? { x: 0, y: 0, z: 0 }),
        activityLevel: state?.activityLevel ?? 0,
        lastEventAt: state?.lastEventAt ?? 0,
        lastEventType: state?.lastEventType ?? "idle",
        errorCount: state?.errorTimestamps.length ?? 0,
        activeAgents: projectAgents.length,
        activeBugs: projectBugs.length,
        bossActive: projectBugs.some((bug) => bug.boss)
      };
    });
  }

  serializeEffect(effect) {
    const arena = this.config.arena;
    const world = this.config.world;
    const serialized = {
      id: effect.id,
      kind: effect.kind,
      ttl: effect.ttl,
      maxTtl: effect.maxTtl,
      color: effect.color,
      radius: effect.radius ?? 0,
      pixelRadius: (effect.radius ?? 1) * 12
    };

    if (effect.position) {
      serialized.position = cloneVector(effect.position);
      Object.assign(serialized, worldToPixel(effect.position, arena, world));
    }

    if (effect.from) {
      serialized.from = cloneVector(effect.from);
      serialized.from2d = worldToPixel(effect.from, arena, world);
    }

    if (effect.to) {
      serialized.to = cloneVector(effect.to);
      serialized.to2d = worldToPixel(effect.to, arena, world);
    }

    return serialized;
  }

  getHealthStatus(projects) {
    if (projects.some((project) => project.bossActive) || this.enemyManager.getActiveCount() >= 5) {
      return "critical";
    }

    if (projects.some((project) => project.activeBugs > 0 || project.status === "offline")) {
      return "warning";
    }

    return "stable";
  }

  tick() {
    const now = Date.now();
    const delta = Math.min(0.1, (now - this.lastTickAt) / 1000 || 0.033);
    this.lastTickAt = now;

    this.decayProjectState(delta);

    const heroActions = this.agentManager.update(delta, {
      enemies: this.enemyManager.getEntities(),
      projectLayouts: this.projectLayouts,
      corePosition: this.corePosition,
      world: this.config.world
    });
    const enemyActions = this.enemyManager.update(delta, {
      heroes: this.agentManager.getEntities(),
      projectLayouts: this.projectLayouts
    });

    this.resolveActions(heroActions, "hero");
    this.resolveActions(enemyActions, "enemy");

    this.enemyManager.removeDefeated();
    this.agentManager.removeDefeated({ world: this.config.world });
    this.advanceEffects(delta);

    const animated =
      this.agentManager.getActiveCount() > 0 ||
      this.enemyManager.getActiveCount() > 0 ||
      this.effects.length > 0 ||
      Array.from(this.projectState.values()).some((project) => project.activityLevel > 0.03) ||
      this.simulation.active;

    const interval = animated ? 1000 / this.config.timing.broadcastRate : 1000;
    if (now - this.lastBroadcastAt >= interval && (this.dirty || animated)) {
      this.lastBroadcastAt = now;
      this.dirty = false;
      this.emit("state", this.getStateSnapshot());
    }
  }

  getStateSnapshot() {
    const agents = this.agentManager.serialize({
      arena: this.config.arena,
      world: this.config.world
    });
    const bugs = this.enemyManager.serialize({
      arena: this.config.arena,
      world: this.config.world
    });
    const projects = this.getProjectsSnapshot(agents, bugs);
    const health = this.getHealthStatus(projects);

    return {
      mode: "holographic",
      arena: this.config.arena,
      world: this.config.world,
      core: this.getCoreSnapshot(),
      projects,
      agents,
      bugs,
      heroes: agents,
      enemies: bugs,
      effects: this.effects.map((effect) => this.serializeEffect(effect)),
      simulation: {
        ...this.simulation
      },
      uiPanels: projects.map((project) => ({
        id: project.id,
        title: project.name,
        status: project.status,
        activityLevel: project.activityLevel,
        activeAgents: project.activeAgents,
        activeBugs: project.activeBugs,
        bossActive: project.bossActive,
        errorCount: project.errorCount
      })),
      status: {
        heroCount: this.agentManager.getActiveCount(),
        bugCount: this.enemyManager.getActiveCount(),
        totalEvents: this.totalEvents,
        totalDefeated: this.totalDefeated,
        totalDeploys: this.totalDeploys,
        uptimeMs: Date.now() - this.startedAt,
        lastEventAt: this.lastEventAt,
        recentEvents: [...this.recentEvents],
        health
      },
      generatedAt: Date.now()
    };
  }
}

export default BattleEngine;
