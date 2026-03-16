import ArenaRenderer from "./arenaRenderer.js";

const canvas = document.getElementById("arena");
const connectionPill = document.getElementById("connection-pill");
const heroCount = document.getElementById("hero-count");
const bugCount = document.getElementById("bug-count");
const eventCount = document.getElementById("event-count");
const uptime = document.getElementById("uptime");
const signalLabel = document.getElementById("signal-label");
const feedList = document.getElementById("feed-list");
const buttons = Array.from(document.querySelectorAll("[data-event]"));

const renderer = new ArenaRenderer(canvas);

let snapshot = {
  heroes: [],
  enemies: [],
  effects: [],
  status: {
    heroCount: 0,
    bugCount: 0,
    totalEvents: 0,
    uptimeMs: 0,
    recentEvents: []
  }
};

let socket = null;
let reconnectTimeout = null;

const SIM_MESSAGES = {
  coding: "Simulated coding burst.",
  research: "Simulated research scan.",
  testing: "Simulated test sweep.",
  error: "Simulated critical test failure.",
  deploy: "Simulated deploy launch.",
  idle: "Simulated cooldown state."
};

function setConnection(online) {
  connectionPill.textContent = online ? "Online" : "Offline";
  connectionPill.classList.toggle("online", online);
  connectionPill.classList.toggle("offline", !online);
}

function formatDuration(milliseconds) {
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
}

function formatRelativeTime(timestamp) {
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (deltaSeconds < 5) {
    return "just now";
  }

  if (deltaSeconds < 60) {
    return `${deltaSeconds}s ago`;
  }

  const minutes = Math.floor(deltaSeconds / 60);
  return `${minutes}m ago`;
}

function renderFeed(events) {
  feedList.replaceChildren();

  if (!events.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "feed-empty";
    emptyState.textContent = "No activity yet. Save a file, run a test, or simulate an event.";
    feedList.append(emptyState);
    return;
  }

  for (const event of events) {
    const item = document.createElement("div");
    item.className = "feed-item";

    const type = document.createElement("div");
    type.className = "feed-type";
    type.innerHTML = `<span>${event.label ?? event.type}</span><span>${formatRelativeTime(
      event.timestamp
    )}</span>`;

    const message = document.createElement("div");
    message.className = "feed-message";
    message.textContent = event.message;

    item.append(type, message);
    feedList.append(item);
  }
}

function applySnapshot(nextSnapshot) {
  snapshot = nextSnapshot;
  heroCount.textContent = String(nextSnapshot.status.heroCount);
  bugCount.textContent = String(nextSnapshot.status.bugCount);
  eventCount.textContent = String(nextSnapshot.status.totalEvents);
  uptime.textContent = formatDuration(nextSnapshot.status.uptimeMs);
  signalLabel.textContent =
    nextSnapshot.status.recentEvents[0]?.message ?? "Waiting for dev activity...";
  renderFeed(nextSnapshot.status.recentEvents ?? []);
}

async function fetchState() {
  const response = await fetch("/api/state");
  const data = await response.json();
  applySnapshot(data);
}

async function triggerSimulation(type) {
  await fetch(`/api/simulate/${type}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message: SIM_MESSAGES[type]
    })
  });
}

function connectSocket() {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${window.location.host}`);

  socket.addEventListener("open", () => {
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
}

for (const button of buttons) {
  button.addEventListener("click", () => {
    triggerSimulation(button.dataset.event).catch((error) => {
      signalLabel.textContent = `Simulation failed: ${error.message}`;
    });
  });
}

function frame(time) {
  renderer.render(snapshot, time);
  window.requestAnimationFrame(frame);
}

await fetchState();
connectSocket();
window.requestAnimationFrame(frame);
