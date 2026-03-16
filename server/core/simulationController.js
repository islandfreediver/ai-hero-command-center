const SIMULATION_SEQUENCE = ["coding", "research", "testing", "error", "deploy"];

export class SimulationController {
  constructor({ eventRouter, projects, defaultProjectId, intervalMs = 1500 }) {
    this.eventRouter = eventRouter;
    this.projects = projects;
    this.defaultProjectId = defaultProjectId;
    this.intervalMs = intervalMs;
    this.intervalHandle = null;
    this.sequenceIndex = 0;
    this.projectIndex = 0;
    this.stateListener = null;
  }

  setStateListener(listener) {
    this.stateListener = listener;
  }

  getProjects() {
    return this.projects.length > 0 ? this.projects : [];
  }

  notifyState() {
    if (this.stateListener) {
      this.stateListener(this.getState());
    }
  }

  buildEvent(type, project) {
    const projectLabel = project?.name ?? "Arena";
    const baseEvent = {
      type,
      source: "simulation",
      projectId: project?.id ?? this.defaultProjectId,
      projectName: project?.name ?? null,
      projectPath: project?.path ?? null,
      message: `Simulation ${type} pulse for ${projectLabel}.`
    };

    if (type === "error") {
      baseEvent.message = `Simulation error pulse for ${projectLabel}.`;
    }

    return baseEvent;
  }

  emitNext() {
    const projects = this.getProjects();
    const project = projects[this.projectIndex % Math.max(1, projects.length)] ?? null;
    const type = SIMULATION_SEQUENCE[this.sequenceIndex % SIMULATION_SEQUENCE.length];

    this.eventRouter.route(this.buildEvent(type, project));
    this.sequenceIndex += 1;
    this.projectIndex += 1;
    this.notifyState();
  }

  start({ intervalMs } = {}) {
    if (typeof intervalMs === "number" && Number.isFinite(intervalMs) && intervalMs >= 500) {
      this.intervalMs = intervalMs;
    }

    if (this.intervalHandle) {
      this.notifyState();
      return this.getState();
    }

    this.intervalHandle = setInterval(() => {
      this.emitNext();
    }, this.intervalMs);

    this.notifyState();
    return this.getState();
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    this.notifyState();
    return this.getState();
  }

  getState() {
    return {
      active: Boolean(this.intervalHandle),
      intervalMs: this.intervalMs,
      sequenceIndex: this.sequenceIndex,
      projectIndex: this.projectIndex
    };
  }
}

export default SimulationController;
