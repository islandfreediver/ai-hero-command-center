import { open, stat, watch } from "node:fs/promises";
import { writeFile } from "node:fs/promises";
import { findProjectForPath } from "../core/projectLoader.js";

const TEST_PATTERN =
  /\b(npm|pnpm|yarn|bun)?\s*(run\s+)?(test|vitest|jest|playwright test|cypress run)\b/i;
const DEPLOY_PATTERN = /\b(git push|deploy|deployment|vercel|netlify|flyctl|railway up)\b/i;
const ERROR_PATTERN =
  /\b(error|exception|fatal|panic|failed|traceback|unhandled|segmentation fault)\b/i;
const ERROR_IGNORE_PATTERN = /\b(0 errors|without errors|no error found)\b/i;
const RESEARCH_PATTERN = /\b(research|searching|analyzing|docs|investigating|profiling)\b/i;
const DEBUG_PATTERN = /\b(debug|fixing|patching|hotfix)\b/i;

export class TerminalWatcher {
  constructor({ projects, defaultProjectId, eventRouter, logFilePath }) {
    this.projects = projects;
    this.defaultProjectId = defaultProjectId;
    this.eventRouter = eventRouter;
    this.logFilePath = logFilePath;
    this.position = 0;
    this.remainder = "";
    this.watcher = null;
    this.recentSignals = new Map();
  }

  shouldEmit(signature, cooldownMs = 1200) {
    const now = Date.now();
    const lastSeen = this.recentSignals.get(signature) ?? 0;
    if (now - lastSeen < cooldownMs) {
      return false;
    }

    this.recentSignals.set(signature, now);
    return true;
  }

  buildMessage(prefix, line) {
    const trimmed = line.trim();
    return trimmed.length > 100 ? `${prefix}: ${trimmed.slice(0, 97)}...` : `${prefix}: ${trimmed}`;
  }

  resolveProject({ cwd, projectId } = {}) {
    if (projectId) {
      return this.projects.find((project) => project.id === projectId) ?? null;
    }

    if (cwd) {
      return findProjectForPath(cwd, this.projects, this.defaultProjectId);
    }

    return this.projects.find((project) => project.id === this.defaultProjectId) ?? this.projects[0] ?? null;
  }

  ingestLine(line, options = {}) {
    const { source = "terminal" } = options;
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const signature = trimmed.toLowerCase();
    const project = this.resolveProject(options);
    const projectPayload = project
      ? {
          projectId: project.id,
          projectName: project.name,
          projectPath: project.path
        }
      : {};

    if (DEPLOY_PATTERN.test(trimmed) && this.shouldEmit(`deploy:${signature}`)) {
      this.eventRouter.route({
        type: "deploy",
        source,
        ...projectPayload,
        message: this.buildMessage("Deploy command observed", trimmed),
        meta: {
          line: trimmed
        }
      });
    }

    if (TEST_PATTERN.test(trimmed) && this.shouldEmit(`testing:${signature}`)) {
      this.eventRouter.route({
        type: "testing",
        source,
        ...projectPayload,
        message: this.buildMessage("Test runner signal", trimmed),
        meta: {
          line: trimmed
        }
      });
    }

    if (DEBUG_PATTERN.test(trimmed) && this.shouldEmit(`debug:${signature}`)) {
      this.eventRouter.route({
        type: "coding",
        source,
        ...projectPayload,
        hero: "DebugHero",
        message: this.buildMessage("Debug pass detected", trimmed),
        meta: {
          line: trimmed
        }
      });
    } else if ((RESEARCH_PATTERN.test(trimmed) || trimmed.length > 140) && this.shouldEmit(`research:${signature}`)) {
      this.eventRouter.route({
        type: "research",
        source,
        ...projectPayload,
        message: this.buildMessage("Research pulse detected", trimmed),
        meta: {
          line: trimmed
        }
      });
    }

    if (ERROR_PATTERN.test(trimmed) && !ERROR_IGNORE_PATTERN.test(trimmed) && this.shouldEmit(`error:${signature}`, 800)) {
      this.eventRouter.route({
        type: "error",
        source,
        ...projectPayload,
        message: this.buildMessage("Error detected", trimmed),
        meta: {
          line: trimmed
        }
      });
    }
  }

  ingestBatch(lines, options) {
    for (const line of lines) {
      this.ingestLine(line, options);
    }
  }

  async readAppend() {
    const fileStats = await stat(this.logFilePath);
    if (fileStats.size < this.position) {
      this.position = 0;
      this.remainder = "";
    }

    if (fileStats.size === this.position) {
      return;
    }

    const handle = await open(this.logFilePath, "r");

    try {
      const byteLength = fileStats.size - this.position;
      const buffer = Buffer.alloc(byteLength);
      await handle.read(buffer, 0, byteLength, this.position);
      this.position = fileStats.size;
      const text = `${this.remainder}${buffer.toString("utf8")}`;
      const lines = text.split(/\r?\n/);
      this.remainder = lines.pop() ?? "";
      this.ingestBatch(lines, { source: "terminalLog" });
    } finally {
      await handle.close();
    }
  }

  async start() {
    await writeFile(this.logFilePath, "", { flag: "a" });
    const fileStats = await stat(this.logFilePath);
    this.position = fileStats.size;

    this.watcher = watch(this.logFilePath);
    (async () => {
      for await (const _event of this.watcher) {
        await this.readAppend();
      }
    })().catch(() => {});
  }

  async stop() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}

export default TerminalWatcher;
