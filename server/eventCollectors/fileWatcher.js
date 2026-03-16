import chokidar from "chokidar";
import path from "node:path";
import { findProjectForPath } from "../core/projectLoader.js";

export class FileWatcher {
  constructor({ projects, defaultProjectId, eventRouter, ignored = [] }) {
    this.projects = projects;
    this.defaultProjectId = defaultProjectId;
    this.eventRouter = eventRouter;
    this.ignored = ignored;
    this.watcher = null;
    this.recentSignals = new Map();
  }

  resolveProject(filePath) {
    return findProjectForPath(filePath, this.projects, this.defaultProjectId);
  }

  normalizeRelativePath(filePath, projectPath) {
    return path.relative(projectPath, filePath).split(path.sep).join("/");
  }

  isInternalNoise(relativePath) {
    const normalized = relativePath.toLowerCase();
    return (
      normalized === ".ai-bug-battle-terminal.log" ||
      (normalized.startsWith(".arena-server.") && normalized.endsWith(".log"))
    );
  }

  handleFileEvent(action, filePath) {
    const project = this.resolveProject(filePath);
    if (!project) {
      return;
    }

    const relativePath = this.normalizeRelativePath(filePath, project.path);
    if (
      !relativePath ||
      relativePath.startsWith(".git/") ||
      this.isInternalNoise(relativePath) ||
      relativePath.startsWith("node_modules/")
    ) {
      return;
    }

    const dedupeKey = `${project.id}:${action}:${relativePath}`;
    const now = Date.now();
    const lastSeen = this.recentSignals.get(dedupeKey) ?? 0;
    if (now - lastSeen < 450) {
      return;
    }

    this.recentSignals.set(dedupeKey, now);
    this.eventRouter.route({
      type: "coding",
      source: "fileWatcher",
      projectId: project.id,
      projectName: project.name,
      projectPath: project.path,
      message: `${project.name}: ${action} ${relativePath}`,
      meta: {
        action,
        path: relativePath,
        projectPath: project.path
      }
    });
  }

  async start() {
    if (this.watcher) {
      return;
    }

    const watchTargets = this.projects.filter((project) => project.exists).map((project) => project.path);
    if (watchTargets.length === 0) {
      return;
    }

    this.watcher = chokidar.watch(watchTargets, {
      ignored: this.ignored,
      ignoreInitial: true,
      persistent: true,
      awaitWriteFinish: {
        stabilityThreshold: 120,
        pollInterval: 25
      }
    });

    this.watcher.on("add", (filePath) => this.handleFileEvent("file added", filePath));
    this.watcher.on("change", (filePath) => this.handleFileEvent("file changed", filePath));
    this.watcher.on("unlink", (filePath) => this.handleFileEvent("file removed", filePath));
  }

  async stop() {
    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }
  }
}

export default FileWatcher;
