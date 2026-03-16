import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export class GitWatcher {
  constructor({ projects, defaultProjectId, eventRouter, intervalMs = 7000 }) {
    this.projects = projects;
    this.defaultProjectId = defaultProjectId;
    this.eventRouter = eventRouter;
    this.intervalMs = intervalMs;
    this.intervalHandle = null;
    this.previousSnapshots = new Map();
    this.pending = false;
  }

  async runGit(cwd, args) {
    const { stdout } = await execFileAsync("git", args, {
      cwd,
      windowsHide: true
    });
    return stdout.trim();
  }

  async getSnapshot(project) {
    try {
      const [branch, head, statusRaw] = await Promise.all([
        this.runGit(project.path, ["rev-parse", "--abbrev-ref", "HEAD"]),
        this.runGit(project.path, ["rev-parse", "HEAD"]),
        this.runGit(project.path, ["status", "--short"])
      ]);

      const dirtyFiles = statusRaw
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      return {
        projectId: project.id,
        branch,
        head,
        dirtyCount: dirtyFiles.length
      };
    } catch {
      return null;
    }
  }

  async poll() {
    if (this.pending) {
      return;
    }

    this.pending = true;

    try {
      const liveProjects = this.projects.filter((project) => project.exists);
      for (const project of liveProjects) {
        const snapshot = await this.getSnapshot(project);
        if (!snapshot) {
          continue;
        }

        const previousSnapshot = this.previousSnapshots.get(project.id);
        if (!previousSnapshot) {
          this.previousSnapshots.set(project.id, snapshot);
          continue;
        }

        if (snapshot.branch !== previousSnapshot.branch) {
          this.eventRouter.route({
            type: "research",
            source: "gitWatcher",
            projectId: project.id,
            projectName: project.name,
            projectPath: project.path,
            message: `${project.name}: switched git branch from ${previousSnapshot.branch} to ${snapshot.branch}.`,
            meta: {
              branch: snapshot.branch
            }
          });
        }

        if (snapshot.head !== previousSnapshot.head) {
          this.eventRouter.route({
            type: "research",
            source: "gitWatcher",
            projectId: project.id,
            projectName: project.name,
            projectPath: project.path,
            message: `${project.name}: new commit detected on ${snapshot.branch}.`,
            meta: {
              branch: snapshot.branch,
              head: snapshot.head
            }
          });
        }

        if (snapshot.dirtyCount === 0 && previousSnapshot.dirtyCount > 0) {
          this.eventRouter.route({
            type: "testing",
            source: "gitWatcher",
            projectId: project.id,
            projectName: project.name,
            projectPath: project.path,
            message: `${project.name}: working tree returned to a clean state.`,
            meta: {
              branch: snapshot.branch
            }
          });
        }

        this.previousSnapshots.set(project.id, snapshot);
      }
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
