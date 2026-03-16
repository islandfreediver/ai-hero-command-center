import si from "systeminformation";

let lastCpu = 0;

const INTERESTING = [
  "chrome",
  "node",
  "codex",
  "electron",
  "powershell",
  "cmd"
];

function classify(name) {
  const n = name.toLowerCase();

  if (n.includes("codex")) return "builder";
  if (n.includes("chrome")) return "thinking";
  if (n.includes("node")) return "processing";
  if (n.includes("electron")) return "ui";
  if (n.includes("powershell") || n.includes("cmd")) return "terminal";

  return "unknown";
}

async function pollProcesses(io) {
  try {
    const [procData, cpuData] = await Promise.all([
      si.processes(),
      si.currentLoad()
    ]);

    const cpuLoad = cpuData.currentLoad;

    // emit system heat level
    if (Math.abs(cpuLoad - lastCpu) > 2) {
      io.emit("systemHeat", {
        cpu: cpuLoad,
        timestamp: Date.now()
      });
    }

    lastCpu = cpuLoad;

    const active = procData.list.filter(p =>
      INTERESTING.some(t => p.name.toLowerCase().includes(t))
    );

    active.forEach(proc => {
      const event = {
        pid: proc.pid,
        name: proc.name,
        cpu: proc.cpu,
        mem: proc.mem,
        type: classify(proc.name),
        timestamp: Date.now()
      };

      io.emit("processActivity", event);
    });

  } catch (err) {
    console.error("process watcher error:", err);
  }
}

export function startProcessWatcher(io) {
  setInterval(() => pollProcesses(io), 2000);
}