import ArenaRenderer from "./arenaRenderer.js";
import HologramEngine from "./hologramEngine.js";
import RenderManager from "./renderManager.js";

const pixelCanvas = document.getElementById("arena");
const sceneRoot = document.getElementById("scene-root");
const overlayLayer = document.getElementById("overlay-layer");
const holographicPane = document.getElementById("holographic-pane");
const pixelPane = document.getElementById("pixel-pane");
const holographicButton = document.getElementById("mode-holographic");
const pixelButton = document.getElementById("mode-pixel");
const connectionPill = document.getElementById("connection-pill");
const heroCount = document.getElementById("hero-count");
const bugCount = document.getElementById("bug-count");
const eventCount = document.getElementById("event-count");
const uptime = document.getElementById("uptime");
const healthStatus = document.getElementById("health-status");
const simulationStatus = document.getElementById("simulation-status");
const signalLabel = document.getElementById("signal-label");
const feedList = document.getElementById("feed-list");
const agentList = document.getElementById("agent-list");
const projectSelect = document.getElementById("project-select");
const simulationStart = document.getElementById("simulation-start");
const simulationStop = document.getElementById("simulation-stop");
const eventButtons = Array.from(document.querySelectorAll("[data-event]"));

const pixelRenderer = new ArenaRenderer(pixelCanvas);
const hologramEngine = new HologramEngine({
  container: sceneRoot,
  overlayLayer
});
const renderManager = new RenderManager({
  pixelRenderer,
  hologramEngine,
  holographicPane,
  pixelPane,
  holographicButton,
  pixelButton
});

let snapshot = {
  projects: [],
  agents: [],
  bugs: [],
  effects: [],
  simulation: {
    active: false
  },
  status: {
    heroCount: 0,
    bugCount: 0,
    totalEvents: 0,
    uptimeMs: 0,
    recentEvents: [],
    health: "stable"
  }
};

let socket = null;
let reconnectTimeout = null;

const SIM_MESSAGES = {
  coding: "Manual coding signal injected.",
  research: "Manual research signal injected.",
  testing: "Manual testing signal injected.",
  error: "Manual error signal injected.",
  deploy: "Manual deploy signal injected.",
  idle: "Manual idle signal injected."
};

const setConnection = (online) => {
  connectionPill.textContent = online ? "Online" : "Offline";
  connectionPill.classList.toggle("online", online);
  connectionPill.classList.toggle("offline", !online);
};

const formatDuration = (milliseconds) => {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }

  return `${seconds}s`;
};

const formatRelativeTime = (timestamp) => {
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 5) {
    return "just now";
  }

  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }

  const minutes = Math.floor(deltaSeconds / 60);
  return `${minutes}m ago`;
};

const ensureProjectOptions = (projects) => {
  const selected = projectSelect.value;
  projectSelect.replaceChildren();

  for (const project of projects) {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = `${project.name}${project.status === "offline" ? " (offline)" : ""}`;
    projectSelect.append(option);
  }

  if (projects.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Default project";
    projectSelect.append(option);
    return;
  }

  const nextValue = projects.some((project) => project.id === selected) ? selected : projects[0].id;
  projectSelect.value = nextValue;
};

const renderFeed = (events) => {
  feedList.replaceChildren();

  if (!events.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No activity yet. Save a file, run a test, or simulate an event.";
    feedList.append(empty);
    return;
  }

  for (const event of events) {
    const item = document.createElement("div");
    item.className = "list-item";

    const row = document.createElement("div");
    row.className = "list-row";

    const title = document.createElement("div");
    title.className = "list-title";
    title.textContent = event.label ?? event.type;

    const age = document.createElement("div");
    age.className = "list-subtitle";
    age.textContent = formatRelativeTime(event.timestamp);

    row.append(title, age);

    const message = document.createElement("div");
    message.className = "list-subtitle";
    message.textContent = event.message;

    item.append(row, message);
    feedList.append(item);
  }
};

const renderAgents = (agents) => {
  agentList.replaceChildren();

  if (!agents.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No active drones yet.";
    agentList.append(empty);
    return;
  }

  for (const agent of agents.slice(0, 10)) {
    const item = document.createElement("div");
    item.className = "list-item";

    const row = document.createElement("div");
    row.className = "list-row";

    const title = document.createElement("div");
    title.className = "list-title";
    title.textContent = `${agent.role.toUpperCase()} · ${agent.projectId}`;

    const state = document.createElement("div");
    state.className = "list-subtitle";
    state.textContent = agent.state;

    row.append(title, state);

    const message = document.createElement("div");
    message.className = "list-subtitle";
    message.textContent = `HP ${agent.hp}/${agent.maxHp}${agent.targetProjectId ? ` · target ${agent.targetProjectId}` : ""}`;

    item.append(row, message);
    agentList.append(item);
  }
};

const renderHealth = (health) => {
  const normalized = health ?? "stable";
  healthStatus.textContent = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  healthStatus.classList.remove("health-stable", "health-warning", "health-critical");
  healthStatus.classList.add(`health-${normalized}`);
};

const applySnapshot = (nextSnapshot) => {
  snapshot = nextSnapshot;
  heroCount.textContent = String(nextSnapshot.status.heroCount);
  bugCount.textContent = String(nextSnapshot.status.bugCount);
  eventCount.textContent = String(nextSnapshot.status.totalEvents);
  uptime.textContent = formatDuration(nextSnapshot.status.uptimeMs);
  simulationStatus.textContent = nextSnapshot.simulation?.active ? "On" : "Off";
  renderHealth(nextSnapshot.status.health);
  signalLabel.textContent =
    nextSnapshot.status.recentEvents[0]?.message ?? "Waiting for live project activity...";
  ensureProjectOptions(nextSnapshot.projects ?? []);
  renderFeed(nextSnapshot.status.recentEvents ?? []);
  renderAgents(nextSnapshot.agents ?? []);
  hologramEngine.setSnapshot(nextSnapshot);
};

const fetchState = async () => {
  const response = await fetch("/api/state");
  const data = await response.json();
  applySnapshot(data);
};

const triggerSimulation = async (type) => {
  const response = await fetch(`/api/simulate/${type}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: SIM_MESSAGES[type],
      projectId: projectSelect.value || undefined
    })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }
};

const toggleSimulation = async (active) => {
  const endpoint = active ? "/api/simulation/start" : "/api/simulation/stop";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const data = await response.json();
  snapshot.simulation = data.simulation;
  simulationStatus.textContent = data.simulation.active ? "On" : "Off";
};

const connectSocket = () => {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${window.location.host}`);

  socket.addEventListener("open", () => {
    if (reconnectTimeout) {
      window.clearTimeout(reconnectTimeout);
    }
    setConnection(true);
  });

  socket.addEventListener("message", (message) => {
    const payload = JSON.parse(message.data);
    if (payload.type === "state") {
      applySnapshot(payload.payload);
    }
  });

  socket.addEventListener("close", () => {
    setConnection(false);
    reconnectTimeout = window.setTimeout(connectSocket, 1500);
  });
};

holographicButton.addEventListener("click", () => renderManager.setMode("holographic"));
pixelButton.addEventListener("click", () => renderManager.setMode("pixel"));
simulationStart.addEventListener("click", () => {
  toggleSimulation(true).catch((error) => {
    signalLabel.textContent = `Simulation start failed: ${error.message}`;
  });
});
simulationStop.addEventListener("click", () => {
  toggleSimulation(false).catch((error) => {
    signalLabel.textContent = `Simulation stop failed: ${error.message}`;
  });
});

for (const button of eventButtons) {
  button.addEventListener("click", () => {
    triggerSimulation(button.dataset.event).catch((error) => {
      signalLabel.textContent = `Simulation failed: ${error.message}`;
    });
  });
}

const frame = (time) => {
  renderManager.render(snapshot, time);
  window.requestAnimationFrame(frame);
};

renderManager.setMode("holographic");
await fetchState();
connectSocket();
window.requestAnimationFrame(frame);
