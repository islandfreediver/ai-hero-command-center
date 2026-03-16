import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import AgentManager from "./core/agentManager.js";
import BattleEngine from "./core/battleEngine.js";
import EnemyManager from "./core/enemyManager.js";
import EventRouter, { EVENT_TYPES } from "./core/eventRouter.js";
import loadProjectConfig from "./core/projectLoader.js";
import SimulationController from "./core/simulationController.js";
import FileWatcher from "./eventCollectors/fileWatcher.js";
import GitWatcher from "./eventCollectors/gitWatcher.js";
import TerminalWatcher from "./eventCollectors/terminalWatcher.js";
import SocketServer from "./websocket/socketServer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const configPath = path.join(rootDir, "config", "arenaConfig.json");
const projectConfigPath = path.join(rootDir, "config", "projects.json");
const config = JSON.parse(await readFile(configPath, "utf8"));
const projectConfig = await loadProjectConfig({
  rootDir,
  filePath: projectConfigPath
});

const defaultProject =
  projectConfig.projects.find((project) => project.id === projectConfig.defaultProjectId) ??
  projectConfig.projects[0] ??
  null;

const mapSeverityToEnemy = (severity) => {
  switch ((severity ?? "").toLowerCase()) {
    case "critical":
      return "CriticalBug";
    case "memory":
      return "MemoryLeakMonster";
    case "test":
      return "TestFailureGhost";
    case "boss":
      return "BossBug";
    default:
      return undefined;
  }
};

const app = express();
const server = http.createServer(app);

const agentManager = new AgentManager({ config });
const enemyManager = new EnemyManager({ config });
const battleEngine = new BattleEngine({
  config,
  projects: projectConfig.projects,
  defaultProjectId: projectConfig.defaultProjectId,
  agentManager,
  enemyManager
});
const eventRouter = new EventRouter({
  getBugPressure: (projectId) => battleEngine.getBugPressure(projectId),
  getDefaultProject: () => defaultProject
});

eventRouter.on("event", (event) => {
  battleEngine.handleEvent(event);
});

const simulationController = new SimulationController({
  eventRouter,
  projects: projectConfig.projects,
  defaultProjectId: projectConfig.defaultProjectId,
  intervalMs: config.simulation?.intervalMs ?? 1500
});

simulationController.setStateListener((state) => {
  battleEngine.setSimulationState(state);
});

const socketServer = new SocketServer({
  server,
  battleEngine,
  eventRouter
});

const fileWatcher = new FileWatcher({
  projects: projectConfig.projects,
  defaultProjectId: projectConfig.defaultProjectId,
  eventRouter,
  ignored: config.watcher.ignored
});

const gitWatcher = new GitWatcher({
  projects: projectConfig.projects,
  defaultProjectId: projectConfig.defaultProjectId,
  eventRouter,
  intervalMs: config.timing.gitPollMs
});

const terminalWatcher = new TerminalWatcher({
  projects: projectConfig.projects,
  defaultProjectId: projectConfig.defaultProjectId,
  eventRouter,
  logFilePath: path.join(rootDir, ".ai-bug-battle-terminal.log")
});

let lastNonIdleAt = Date.now();
eventRouter.on("event", (event) => {
  if (event.type !== "idle") {
    lastNonIdleAt = event.timestamp;
  }
});

const idleInterval = setInterval(() => {
  const quietFor = Date.now() - lastNonIdleAt;
  const sinceLastIdle = Date.now() - battleEngine.getLastIdleAt();
  if (quietFor >= config.timing.idleCheckMs && sinceLastIdle >= config.timing.idleCheckMs) {
    eventRouter.route({
      type: "idle",
      source: "system",
      projectId: defaultProject?.id ?? null,
      projectName: defaultProject?.name ?? null,
      projectPath: defaultProject?.path ?? null,
      message: "Command center is in standby. Drones are holding orbit."
    });
  }
}, Math.max(2500, config.timing.idleCheckMs / 2));

app.use(express.json({ limit: "256kb" }));
app.use("/assets", express.static(path.join(rootDir, "assets")));
app.use("/vendor/three", express.static(path.join(rootDir, "node_modules", "three", "build")));
app.use(express.static(path.join(rootDir, "client")));

app.get("/api/state", (_request, response) => {
  response.json(battleEngine.getStateSnapshot());
});

app.get("/api/simulation/state", (_request, response) => {
  response.json(simulationController.getState());
});

app.post("/api/simulation/start", (request, response) => {
  const intervalMs = Number(request.body?.intervalMs);
  const state = simulationController.start({
    intervalMs: Number.isFinite(intervalMs) ? intervalMs : undefined
  });
  response.json({
    ok: true,
    simulation: state
  });
});

app.post("/api/simulation/stop", (_request, response) => {
  const state = simulationController.stop();
  response.json({
    ok: true,
    simulation: state
  });
});

app.post("/api/simulate/:type", (request, response) => {
  const type = request.params.type;
  if (!EVENT_TYPES.includes(type)) {
    response.status(400).json({
      ok: false,
      error: `Unsupported event type: ${type}`
    });
    return;
  }

  const requestedProject =
    projectConfig.projects.find((project) => project.id === request.body?.projectId) ?? defaultProject;
  const severityEnemy = mapSeverityToEnemy(request.body?.severity);
  const count = Math.max(1, Math.min(8, Number(request.body?.count ?? 1) || 1));
  const events = [];

  for (let index = 0; index < count; index += 1) {
    const message =
      request.body?.message ??
      `Simulated ${type} event for ${requestedProject?.name ?? "Command Center"}${count > 1 ? ` #${index + 1}` : ""}.`;
    events.push(
      eventRouter.route({
        type,
        source: "simulate-api",
        projectId: requestedProject?.id ?? null,
        projectName: requestedProject?.name ?? null,
        projectPath: requestedProject?.path ?? null,
        message,
        hero: request.body?.hero,
        enemy: request.body?.enemy ?? severityEnemy,
        meta: {
          ...(request.body?.meta ?? {}),
          severity: request.body?.severity ?? null
        }
      })
    );
  }

  response.json({
    ok: true,
    events
  });
});

app.post("/api/terminal", (request, response) => {
  const { line, lines, command, cwd, projectId } = request.body ?? {};
  const options = {
    source: "terminalApi",
    cwd,
    projectId
  };

  if (typeof command === "string") {
    terminalWatcher.ingestLine(command, options);
  }

  if (typeof line === "string") {
    terminalWatcher.ingestLine(line, options);
  }

  if (Array.isArray(lines)) {
    terminalWatcher.ingestBatch(lines.filter((entry) => typeof entry === "string"), options);
  }

  response.json({ ok: true });
});

app.get("/healthz", (_request, response) => {
  response.json({
    ok: true,
    uptimeMs: Date.now() - battleEngine.startedAt,
    projectCount: projectConfig.projects.length
  });
});

battleEngine.start();
await Promise.all([fileWatcher.start(), gitWatcher.start(), terminalWatcher.start()]);

eventRouter.route({
  type: "research",
  source: "system",
  projectId: defaultProject?.id ?? null,
  projectName: defaultProject?.name ?? null,
  projectPath: defaultProject?.path ?? null,
  message: "Jarvis command center systems online."
});

server.listen(config.port, () => {
  console.log(`ai-bug-battle-arena running at http://localhost:${config.port}`);
});

const shutdown = async () => {
  clearInterval(idleInterval);
  simulationController.stop();
  battleEngine.stop();
  await fileWatcher.stop();
  gitWatcher.stop();
  await terminalWatcher.stop();
  socketServer.close();
  server.close(() => {
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
