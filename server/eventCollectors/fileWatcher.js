import chokidar from "chokidar";
import path from "node:path";

export class FileWatcher {
  constructor({ rootDir, eventRouter, ignored = [] }) {
    this.rootDir = rootDir;
    this.eventRouter = eventRouter;
    this.ignored = ignored;
    this.watcher = null;
    this.recentSignals = new Map();
  }

  normalizePath(filePath) {
    return path.relative(this.rootDir, filePath).split(path.sep).join("/");
  }

  isInternalNoise(relativePath) {
    const normalized = relativePath.toLowerCase();
    return (
      normalized === ".ai-bug-battle-terminal.log" ||
      (normalized.startsWith(".arena-server.") && normalized.endsWith(".log"))
    );
  }

  handleFileEvent(action, filePath) {
    const relativePath = this.normalizePath(filePath);
    if (!relativePath || relativePath.startsWith(".git/") || this.isInternalNoise(relativePath)) {
      return;
    }

    const dedupeKey = `${action}:${relativePath}`;
    const now = Date.now();
    const lastSeen = this.recentSignals.get(dedupeKey) ?? 0;
    if (now - lastSeen < 450) {
      return;
    }

    this.recentSignals.set(dedupeKey, now);
    this.eventRouter.route({
      type: "coding",
      source: "fileWatcher",
      message: `${action} ${relativePath}`,
      meta: {
        action,
        path: relativePath
      }
    });
  }

  async start() {
    if (this.watcher) {
      return;
    }

    this.watcher = chokidar.watch(this.rootDir, {
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
