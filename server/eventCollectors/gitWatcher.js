import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitWatcher {
  constructor({ rootDir, eventRouter, intervalMs = 7000 }) {
    this.rootDir = rootDir;
    this.eventRouter = eventRouter;
    this.intervalMs = intervalMs;
    this.intervalHandle = null;
    this.previousSnapshot = null;
    this.pending = false;
  }

  async runGit(args) {
    const { stdout } = await execFileAsync("git", args, {
      cwd: this.rootDir,
      windowsHide: true
    });
    return stdout.trim();
  }

  async getSnapshot() {
    try {
      const [branch, head, statusRaw] = await Promise.all([
        this.runGit(["rev-parse", "--abbrev-ref", "HEAD"]),
        this.runGit(["rev-parse", "HEAD"]),
        this.runGit(["status", "--short"])
      ]);

      const dirtyFiles = statusRaw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      return {
        branch,
        head,
        dirtyCount: dirtyFiles.length
      };
    } catch (error) {
      return null;
    }
  }

  async poll() {
    if (this.pending) {
      return;
    }

    this.pending = true;

    try {
      const snapshot = await this.getSnapshot();
      if (!snapshot) {
        return;
      }

      if (!this.previousSnapshot) {
        this.previousSnapshot = snapshot;
        return;
      }

      if (snapshot.branch !== this.previousSnapshot.branch) {
        this.eventRouter.route({
          type: "research",
          source: "gitWatcher",
          message: `Switched git branch from ${this.previousSnapshot.branch} to ${snapshot.branch}.`,
          meta: {
            branch: snapshot.branch
          }
        });
      }

      if (snapshot.head !== this.previousSnapshot.head) {
        this.eventRouter.route({
          type: "research",
          source: "gitWatcher",
          message: `New commit detected on ${snapshot.branch}.`,
          meta: {
            branch: snapshot.branch,
            head: snapshot.head
          }
        });
      }

      if (snapshot.dirtyCount === 0 && this.previousSnapshot.dirtyCount > 0) {
        this.eventRouter.route({
          type: "testing",
          source: "gitWatcher",
          message: "Working tree returned to a clean state.",
          meta: {
            branch: snapshot.branch
          }
        });
      }

      this.previousSnapshot = snapshot;
    } finally {
      this.pending = false;
    }
  }

  async start() {
    if (this.intervalHandle) {
      return;
    }

    await this.poll();
    this.intervalHandle = setInterval(() => {
      this.poll().catch(() => {});
    }, this.intervalMs);
  }

  stop() {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
  }
}

export default GitWatcher;
