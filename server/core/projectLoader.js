import path from "node:path";
import { access, readFile } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { longestPrefixMatch, normalizeFsPath, slugify } from "./utils.js";

const PROJECT_COLORS = ["#5ed6ff", "#78f58e", "#ffca63", "#ff7f71", "#d98cff", "#67f2d0"];

const pathExists = async (targetPath) => {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

export const loadProjectConfig = async ({ rootDir, filePath }) => {
  const rawConfig = JSON.parse(await readFile(filePath, "utf8"));
  const rawProjects = Array.isArray(rawConfig.projects) ? rawConfig.projects : [];

  const projects = await Promise.all(
    rawProjects.map(async (project, index) => {
      const projectPath = path.isAbsolute(project.path)
        ? project.path
        : path.resolve(rootDir, project.path);
      const normalizedPath = normalizeFsPath(path.normalize(projectPath));
      const exists = await pathExists(projectPath);
      return {
        id: project.id || slugify(project.name),
        name: project.name || `Project ${index + 1}`,
        path: normalizedPath,
        rawPath: project.path,
        exists,
        status: exists ? "online" : "offline",
        color: project.color || PROJECT_COLORS[index % PROJECT_COLORS.length],
        slotIndex: index
      };
    })
  );

  const defaultProject =
    longestPrefixMatch(normalizeFsPath(rootDir), projects, (project) => project.path) ||
    projects.find((project) => project.exists) ||
    projects[0] ||
    null;

  return {
    projects,
    defaultProjectId: defaultProject?.id ?? null
  };
};

export const findProjectForPath = (filePath, projects, defaultProjectId = null) =>
  longestPrefixMatch(filePath, projects, (project) => project.path) ||
  projects.find((project) => project.id === defaultProjectId) ||
  projects[0] ||
  null;

export default loadProjectConfig;
