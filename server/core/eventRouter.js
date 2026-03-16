import { EventEmitter } from "node:events";

export const EVENT_TYPES = ["coding", "research", "testing", "error", "deploy", "idle"];

const HERO_BY_EVENT = {
  coding: "CodeHero",
  research: "ResearchHero",
  testing: "TestHero",
  deploy: "DeployHero"
};

const defaultMessage = (type, meta = {}) => {
  switch (type) {
    case "coding":
      return `Code activity detected${meta.path ? ` in ${meta.path}` : ""}.`;
    case "research":
      return "Research signal detected in the dev loop.";
    case "testing":
      return "Test pulse launched across the arena.";
    case "error":
      return "Bug signal detected.";
    case "deploy":
      return "Deployment launch sequence engaged.";
    default:
      return "Arena is holding in standby mode.";
  }
};

const inferEnemy = (type, payload) => {
  if (type !== "error") {
    return null;
  }

  const text = `${payload.message ?? ""} ${JSON.stringify(payload.meta ?? {})}`.toLowerCase();

  if (text.includes("memory")) {
    return "MemoryLeakMonster";
  }

  if (text.includes("test") || text.includes("assert")) {
    return "TestFailureGhost";
  }

  if (text.includes("critical") || text.includes("fatal") || text.includes("panic")) {
    return "CriticalBug";
  }

  return "Bug";
};

export class EventRouter extends EventEmitter {
  constructor({ getBugPressure } = {}) {
    super();
    this.getBugPressure = getBugPressure ?? (() => 0);
    this.sequence = 0;
  }

  inferHero(type, payload) {
    if (payload.hero) {
      return payload.hero;
    }

    if (type === "coding" && this.getBugPressure() > 0) {
      return "DebugHero";
    }

    return HERO_BY_EVENT[type] ?? null;
  }

  route(payload = {}) {
    const type = EVENT_TYPES.includes(payload.type) ? payload.type : "idle";
    const event = {
      id: `evt-${Date.now()}-${this.sequence += 1}`,
      type,
      source: payload.source ?? "system",
      timestamp: payload.timestamp ?? Date.now(),
      hero: this.inferHero(type, payload),
      enemy: payload.enemy ?? inferEnemy(type, payload),
      message: payload.message ?? defaultMessage(type, payload.meta),
      meta: payload.meta ?? {}
    };

    this.emit("event", event);
    return event;
  }
}

export default EventRouter;
