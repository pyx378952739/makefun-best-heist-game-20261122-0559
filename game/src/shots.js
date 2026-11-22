// The screenshot scenes behind ?shot=start|play|alarm|victory. Each one plays the real rules
// forward from a fresh world, steered by a simple autopilot (look ahead in each of eight
// directions, keep clear of guard and camera cones, chase the nearest loot when that is safe),
// so the frame is what a short game really looks like and the same seed always gives the same
// frame. The alarm and victory scenes are staged on top of the same rules, not faked art.
import { ALARM, FIELD, STEP } from './config.js';
import { EVENT_OVER, EVENT_WIN, SOLIDS, hasLineOfSight } from './world.js';
import { SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 5;
const HORIZON_PLAY = 0.7;
const HORIZON_ALARM = 0.18;
const DIRECTIONS = [
  [0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

/** Clone a plain-data world state so the autopilot can try a direction without moving the real game. */
function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

/**
 * Simulate `horizon` seconds from a cloned state with the thief walking in `direction`.
 * Returns the alarm gained (scaled by `risk`, lower means bolder), a heavy penalty for being
 * caught, and where the thief ends up — so a direction that runs into a wall and makes no
 * progress scores worse than one that actually moves toward the waypoint.
 */
function simulate(world, direction, horizon, risk) {
  const saved = world.state;
  world.state = cloneState(saved);
  let danger = 0;
  const alarm0 = world.state.alarm;
  // Step the full horizon in fixed STEP increments (sampling by SAMPLE would halve the time).
  for (let t = 0; t < horizon; t += STEP) {
    const events = world.step(STEP, { x: direction[0], y: direction[1] }, null, false);
    if (events & EVENT_OVER) {
      danger += 1000;
      break;
    }
  }
  danger += (world.state.alarm - alarm0) * 2 * risk;
  danger += world.state.lives < saved.lives ? 1000 : 0;
  const end = { x: world.state.thief.x, y: world.state.thief.y };
  world.state = saved;
  return { danger, ...end };
}

/** Coarse grid for the autopilot's pathfinding: 40 px cells over the whole field. */
const CELL = 40;
const COLS = 32;
const ROWS = 18;

/** True when a cell centre is unwalkable: inside a wall or case (with a thief-sized margin). */
function blockedCell(cx, cy) {
  const x = cx * CELL + CELL / 2;
  const y = cy * CELL + CELL / 2;
  for (const solid of SOLIDS) {
    if (x > solid.x - 16 && x < solid.x + solid.w + 16 && y > solid.y - 16 && y < solid.y + solid.h + 16) return true;
  }
  return false;
}

/**
 * Breadth-first path across the grid from (sx,sy) to (tx,ty), returning the cell centres to
 * walk through. Walls make a straight-line autopilot slide along them forever; the grid route
 * walks the thief through the door gaps instead.
 */
function findPath(sx, sy, tx, ty) {
  let scx = Math.max(0, Math.min(COLS - 1, Math.floor(sx / CELL)));
  let scy = Math.max(0, Math.min(ROWS - 1, Math.floor(sy / CELL)));
  const tcx = Math.max(0, Math.min(COLS - 1, Math.floor(tx / CELL)));
  const tcy = Math.max(0, Math.min(ROWS - 1, Math.floor(ty / CELL)));
  // A thief pressed against a wall sits in a blocked cell; snap the start to the nearest open
  // cell, or the route's first step would cut straight through the wall.
  if (blockedCell(scx, scy)) {
    let found = false;
    for (let r = 1; r <= 4 && !found; r += 1) {
      for (let dy = -r; dy <= r && !found; dy += 1) {
        for (let dx = -r; dx <= r && !found; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const nx = scx + dx;
          const ny = scy + dy;
          if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || blockedCell(nx, ny)) continue;
          scx = nx;
          scy = ny;
          found = true;
        }
      }
    }
    if (!found) return [];
  }
  const prev = new Map();
  const queue = [[scx, scy]];
  prev.set(`${scx},${scy}`, null);
  while (queue.length > 0) {
    const [cx, cy] = queue.shift();
    if (cx === tcx && cy === tcy) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
      const key = `${nx},${ny}`;
      if (prev.has(key) || blockedCell(nx, ny)) continue;
      prev.set(key, `${cx},${cy}`);
      queue.push([nx, ny]);
    }
  }
  const path = [];
  let key = `${tcx},${tcy}`;
  if (!prev.has(key)) return path;
  while (key !== null) {
    const [cx, cy] = key.split(',').map(Number);
    path.unshift({ x: cx * CELL + CELL / 2, y: cy * CELL + CELL / 2 });
    key = prev.get(key);
  }
  return path;
}

/** Steer toward the nearest loot that is still on display, keeping out of the cones. */
export function autopilot(world, horizon, risk = 1) {
  const state = world.state;
  const t = state.thief;
  let target = null;
  let bestDist = Infinity;
  for (const item of state.loot) {
    if (item.taken) continue;
    const d = Math.hypot(item.x - t.x, item.y - t.y);
    if (d < bestDist) {
      bestDist = d;
      target = item;
    }
  }
  const tx = target ? target.x : FIELD.width / 2;
  const ty = target ? target.y : FIELD.height / 2;
  // Follow the grid path to the loot (through door gaps), not the straight line through walls.
  const path = findPath(t.x, t.y, tx, ty);
  let wx = tx;
  let wy = ty;
  for (const node of path) {
    if (Math.hypot(node.x - t.x, node.y - t.y) > CELL * 0.75) {
      wx = node.x;
      wy = node.y;
      break;
    }
  }
  const wantAngle = Math.atan2(wy - t.y, wx - t.x);
  let bestDir = [0, 0];
  let bestScore = -Infinity;
  for (const dir of DIRECTIONS) {
    const sim = simulate(world, dir, horizon, risk);
    let score = -sim.danger;
    // Progress toward the loot itself beats standing still against a wall, however well
    // aligned the blocked direction looks: a wall-slide that closes the distance wins.
    score -= Math.hypot(sim.x - tx, sim.y - ty) * 0.10;
    if (dir[0] !== 0 || dir[1] !== 0) {
      const dirAngle = Math.atan2(dir[1], dir[0]);
      const align = Math.cos(dirAngle - wantAngle);
      score += align * 4;
    }
    score -= bestDist * 0.002;
    if (score > bestScore) {
      bestScore = score;
      bestDir = dir;
    }
  }
  return { x: bestDir[0], y: bestDir[1] };
}

/** True when the point sits in open floor, clear of every wall and case. */
function isOpen(x, y) {
  for (const solid of SOLIDS) {
    if (x > solid.x - 14 && x < solid.x + solid.w + 14 && y > solid.y - 14 && y < solid.y + solid.h + 14) return false;
  }
  return x > 30 && x < 1250 && y > 70 && y < 690;
}

/**
 * Nudge a staged point into open floor: try the point, then rings around it, then a known
 * open spot in the middle of gallery B. Never leaves a staged figure inside a wall.
 */
function placeInOpen(x, y) {
  if (isOpen(x, y)) return { x, y };
  for (let r = 20; r <= 160; r += 20) {
    for (const [dx, dy] of [[0, -r], [r, 0], [0, r], [-r, 0], [r, -r], [r, r], [-r, r], [-r, -r]]) {
      if (isOpen(x + dx, y + dy)) return { x: x + dx, y: y + dy };
    }
  }
  return { x: 670, y: 300 };
}

/**
 * Set `world` to the named scene (start, play, alarm or victory; any other name is start)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'alarm' && name !== 'victory') {
    // Title screen over a living museum: five seconds of patrols and sweeping cameras.
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, { x: 0, y: 0 }, null, true);
    return { screen: SCREEN_TITLE, best: 0 };
  }

  if (name === 'victory') {
    // A full night's work, finished: every piece taken, thief at the open exit.
    for (const item of world.state.loot) item.taken = true;
    world.state.lootValue = world.state.loot.reduce((sum, item) => sum + item.value, 0);
    world.state.exitOpen = true;
    world.state.time = 247;
    world.state.thief.x = 105;
    world.state.thief.y = 678;
    world.state.thief.angle = Math.PI / 2;
    // One attract step first so the cameras sit mid-sweep instead of at their base angle
    // (step() returns early once won is set, so this has to come before it).
    world.step(STEP, { x: 0, y: 0 }, null, true);
    world.state.won = true;
    return { screen: SCREEN_WIN, best: 0 };
  }

  if (name === 'alarm') {
    // A hurried thief walks straight into the gallery guard's cone: alarm high, guard chasing.
    const limit = 12;
    for (let i = 0; i < limit / STEP; i += 1) {
      if (world.step(STEP, autopilot(world, HORIZON_ALARM), false) & EVENT_OVER) break;
      if (world.state.alarm >= 45) break;
    }
    // Stage the peak of the chase deterministically: put the thief 130 px ahead of the
    // gallery guard, inside its cone with a clear sightline, alarm near the top. The guard
    // is re-seated too, so the pair can never land on opposite sides of a wall or on top
    // of each other (a caught thief would respawn at the entry mid-staging).
    const guard = world.state.guards[0];
    const facing = guard.angle;
    let thiefSpot = placeInOpen(
      guard.x + Math.cos(facing) * 130,
      guard.y + Math.sin(facing) * 130,
    );
    let guardSpot = placeInOpen(
      thiefSpot.x - Math.cos(facing) * 130,
      thiefSpot.y - Math.sin(facing) * 130,
    );
    if (!hasLineOfSight(guardSpot.x, guardSpot.y, thiefSpot.x, thiefSpot.y)) {
      thiefSpot = { x: 670, y: 300 };
      guardSpot = { x: 540, y: 300 };
    }
    guard.x = guardSpot.x;
    guard.y = guardSpot.y;
    guard.angle = Math.atan2(thiefSpot.y - guardSpot.y, thiefSpot.x - guardSpot.x);
    guard.mode = 'chase';
    guard.suspicion = 1;
    world.state.thief.x = thiefSpot.x;
    world.state.thief.y = thiefSpot.y;
    world.state.alarm = 85;
    for (let i = 0; i < 0.3 / STEP; i += 1) world.step(STEP, { x: 0, y: 0 }, null, false);
    // Pin the meter after the settling steps: the chase keeps the alarm climbing otherwise.
    world.state.alarm = ALARM.lockdown - 15;
    return { screen: SCREEN_PLAY, best: 0 };
  }

  // play: careful autopilot play, then a bold stretch that trips the alarm, then a few
  // careful seconds to break contact and let the meter settle in the 30s — a mid-heist
  // frame with loot taken, the thief near the diamond, and heat on.
  for (let i = 0; i < 16 / STEP; i += 1) {
    const events = world.step(STEP, autopilot(world, HORIZON_PLAY), false);
    if (events & (EVENT_OVER | EVENT_WIN)) break;
  }
  for (let i = 0; i < 10 / STEP; i += 1) {
    if (world.state.alarm >= 30) break;
    const events = world.step(STEP, autopilot(world, 0.3, 0.15), false);
    if (events & (EVENT_OVER | EVENT_WIN)) break;
  }
  for (let i = 0; i < 8 / STEP; i += 1) {
    if (i > 60 && world.state.alarm <= 40) break;
    const events = world.step(STEP, autopilot(world, HORIZON_PLAY), false);
    if (events & (EVENT_OVER | EVENT_WIN)) break;
  }
  return { screen: SCREEN_PLAY, best: 0 };
}
