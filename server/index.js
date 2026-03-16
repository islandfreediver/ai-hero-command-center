import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import AgentManager from "./core/agentManager.js";
import BattleEngine from "./core/battleEngine.js";
import EnemyManager from "./core/enemyManager.js";
import EventRouter, { EVENT_TYPES } from "./core/eventRouter.js";
import FileWatcher from "./eventCollectors/fileWatcher.js";
import GitWatcher from "./eventCollectors/gitWatcher.js";
import TerminalWatcher from "./eventCollectors/terminalWatcher.js";
import SocketServer from "./websocket/socketServer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const configPath = path.join(rootDir, "config", "arenaConfig.json");
const config = JSON.parse(await readFile(configPath, "utf8"));

const app = express();
const server = http.createServer(app);

const agentManager = new AgentManager({ config });
const enemyManager = new EnemyManager({ config });
const eventRouter = new EventRouter({
  getBugPressure: () => enemyManager.getActiveCount()
});
const battleEngine = new BattleEngine({
  config,
  agentManager,
  enemyManager
});

eventRouter.on("event", (event) => {
  battleEngine.handleEvent(event);
});

const socketServer = new SocketServer({
  server,
  battleEngine,
  eventRouter
});

const fileWatcher = new FileWatcher({
  rootDir,
  eventRouter,
  ignored: config.watcher.ignored
});

const gitWatcher = new GitWatcher({
  rootDir,
  eventRouter,
  intervalMs: config.timing.gitPollMs
});

const terminalWatcher = new TerminalWatcher({
  rootDir,
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
      message: "Arena has gone quiet. Heroes are holding defensive positions."
    });
  }
}, Math.max(2500, config.timing.idleCheckMs / 2));

app.use(express.json({ limit: "256kb" }));
app.use("/assets", express.static(path.join(rootDir, "assets")));
app.use(express.static(path.join(rootDir, "client")));

app.get("/api/state", (_request, response) => {
  response.json(battleEngine.getStateSnapshot());
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

  const event = eventRouter.route({
    type,
    source: "simulate-api",
    message: request.body?.message,
    hero: request.body?.hero,
    enemy: request.body?.enemy,
    meta: request.body?.meta
  });

  response.json({
    ok: true,
    event
  });
});

app.post("/api/terminal", (request, response) => {
  const { line, lines, command } = request.body ?? {};

  if (typeof command === "string") {
    terminalWatcher.ingestLine(command, { source: "terminalApi" });
  }

  if (typeof line === "string") {
    terminalWatcher.ingestLine(line, { source: "terminalApi" });
  }

  if (Array.isArray(lines)) {
    terminalWatcher.ingestBatch(lines.filter((entry) => typeof entry === "string"), {
      source: "terminalApi"
    });
  }

  response.json({ ok: true });
});

app.get("/healthz", (_request, response) => {
  response.json({
    ok: true,
    uptimeMs: Date.now() - battleEngine.startedAt
  });
});

battleEngine.start();
await Promise.all([fileWatcher.start(), gitWatcher.start(), terminalWatcher.start()]);

eventRouter.route({
  type: "research",
  source: "system",
  message: "Battle arena systems online."
});

server.listen(config.port, () => {
  console.log(`ai-bug-battle-arena running at http://localhost:${config.port}`);
});

const shutdown = async () => {
  clearInterval(idleInterval);
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
