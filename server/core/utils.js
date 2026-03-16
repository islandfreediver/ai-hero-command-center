export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const rand = (min, max) => Math.random() * (max - min) + min;

export const randInt = (min, max) => Math.floor(rand(min, max + 1));

export const distance = (a, b) => Math.hypot((b.x ?? 0) - (a.x ?? 0), (b.y ?? 0) - (a.y ?? 0));

export const distance3d = (a, b) =>
  Math.hypot((b.x ?? 0) - (a.x ?? 0), (b.y ?? 0) - (a.y ?? 0), (b.z ?? 0) - (a.z ?? 0));

export const normalize = (dx, dy) => {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
};

export const normalize3d = (dx, dy, dz) => {
  const length = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / length, y: dy / length, z: dz / length };
};

export const uid = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const pickSpawnPoint = (zone) => ({
  x: rand(zone.xMin, zone.xMax),
  y: rand(zone.yMin, zone.yMax)
});

export const keepInsideArena = (entity, arena) => {
  entity.x = clamp(entity.x, arena.floorPadding, arena.width - arena.floorPadding);
  entity.y = clamp(entity.y, 92, arena.groundY - 8);
};

export const normalizeFsPath = (filePath = "") => filePath.replace(/\\/g, "/");

export const slugify = (value = "") =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "project";

export const projectNodePosition = (slotIndex, totalProjects, world = {}) => {
  const safeTotal = Math.max(1, totalProjects);
  const radius = world.projectRingRadius ?? 18;
  const angle = (slotIndex / safeTotal) * Math.PI * 2 - Math.PI / 2;
  return {
    x: Math.cos(angle) * radius,
    y: world.coreHeight ? world.coreHeight * 0.12 : 0,
    z: Math.sin(angle) * radius,
    angle
  };
};

export const cloneVector = (vector = {}) => ({
  x: vector.x ?? 0,
  y: vector.y ?? 0,
  z: vector.z ?? 0
});

export const moveTowards3d = (current, target, maxDistance) => {
  const dx = (target.x ?? 0) - (current.x ?? 0);
  const dy = (target.y ?? 0) - (current.y ?? 0);
  const dz = (target.z ?? 0) - (current.z ?? 0);
  const gap = Math.hypot(dx, dy, dz) || 0;

  if (gap <= maxDistance || gap === 0) {
    return {
      position: cloneVector(target),
      arrived: true,
      gap
    };
  }

  const direction = normalize3d(dx, dy, dz);
  return {
    position: {
      x: (current.x ?? 0) + direction.x * maxDistance,
      y: (current.y ?? 0) + direction.y * maxDistance,
      z: (current.z ?? 0) + direction.z * maxDistance
    },
    arrived: false,
    gap
  };
};

export const worldToPixel = (position, arena = {}, world = {}) => {
  const width = arena.width ?? 960;
  const groundY = arena.groundY ?? 520;
  const scaleX = world.pixelScaleX ?? 16;
  const scaleY = world.pixelScaleY ?? 9;
  return {
    x: width / 2 + (position.x ?? 0) * scaleX,
    y: groundY - (position.z ?? 0) * scaleY - (position.y ?? 0) * scaleY * 2.25
  };
};

export const longestPrefixMatch = (value, candidates, selector) => {
  const normalizedValue = normalizeFsPath(value).toLowerCase();
  let chosen = null;
  let chosenLength = -1;

  for (const candidate of candidates) {
    const candidateValue = normalizeFsPath(selector(candidate)).toLowerCase();
    if (
      normalizedValue === candidateValue ||
      normalizedValue.startsWith(`${candidateValue}/`) ||
      normalizedValue.startsWith(candidateValue)
    ) {
      if (candidateValue.length > chosenLength) {
        chosen = candidate;
        chosenLength = candidateValue.length;
      }
    }
  }

  return chosen;
};

export const trimArray = (items, maxLength) => {
  if (items.length <= maxLength) {
    return items;
  }

  return items.slice(items.length - maxLength);
};
