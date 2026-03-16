export const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export const rand = (min, max) => Math.random() * (max - min) + min;

export const randInt = (min, max) => Math.floor(rand(min, max + 1));

export const distance = (a, b) => Math.hypot((b.x ?? 0) - (a.x ?? 0), (b.y ?? 0) - (a.y ?? 0));

export const normalize = (dx, dy) => {
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
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

export const trimArray = (items, maxLength) => {
  if (items.length <= maxLength) {
    return items;
  }

  return items.slice(items.length - maxLength);
};
