// The museum and the heist itself: rooms, walls, display cases, loot, patrolling guards with
// vision cones, sweeping security cameras, the alarm meter, lives, timer and win/lose rules.
// Pure simulation: no DOM, no canvas, no sound here, so node can import and run it directly.
import {
  ALARM, CAMERA, FIELD, GUARD, HUD_HEIGHT, LIFE_BONUS, LIVES, LOOT_GOAL, PAR_TIME, THIEF,
} from './config.js';
import { createRandom } from './random.js';

export const EVENT_CAUGHT = 1;
export const EVENT_WIN = 2;
export const EVENT_OVER = 4;
export const EVENT_LOOT = 8;
export const EVENT_STEP = 16;

const TAU = Math.PI * 2;

/** The museum walls. The HUD bar occupies y 0..HUD_HEIGHT; the floor starts below it. */
export const WALLS = [
  { x: 0, y: HUD_HEIGHT, w: FIELD.width, h: 20 }, // north outer wall
  { x: 0, y: 700, w: FIELD.width, h: 20 }, // south outer wall
  { x: 0, y: HUD_HEIGHT, w: 20, h: 720 - HUD_HEIGHT }, // west outer wall
  { x: 1260, y: HUD_HEIGHT, w: 20, h: 720 - HUD_HEIGHT }, // east outer wall
  { x: 420, y: 66, w: 20, h: 214 }, // gallery A east wall, upper leaf (door gap 280..360)
  { x: 420, y: 360, w: 20, h: 340 }, // gallery A east wall, lower leaf
  { x: 440, y: 420, w: 180, h: 20 }, // gallery B south wall, west leaf (door gap 620..700)
  { x: 700, y: 420, w: 200, h: 20 }, // gallery B south wall, east leaf
  { x: 900, y: 66, w: 20, h: 114 }, // vault west wall, upper leaf (door gap 180..260)
  { x: 900, y: 260, w: 20, h: 160 }, // vault west wall, lower leaf
];

/** Solid display cases and fixtures the thief and guards walk around, not through. */
export const CASES = [
  { x: 640, y: 180, w: 60, h: 60 }, // diamond case, gallery B
  { x: 290, y: 290, w: 60, h: 60 }, // pocket-watch case, gallery A
  { x: 770, y: 540, w: 60, h: 60 }, // jade-vase pedestal, great hall
  { x: 1120, y: 570, w: 60, h: 60 }, // ruby-brooch pedestal, great hall
  { x: 1060, y: 66, w: 80, h: 60 }, // the vault safe, built into the north wall
];

/** Every solid rectangle: walls plus cases. */
export const SOLIDS = [...WALLS, ...CASES];

/** The loot on the night's list. Walking over a piece sweeps it up. Each piece sits just
 *  clear of its display case, so the thief can actually reach it. */
export const LOOT_DEFS = [
  { id: 'duchess', name: 'The Starlit Duchess', kind: 'painting', value: 12000, x: 220, y: 110 },
  { id: 'watch', name: 'Gold Pocket Watch', kind: 'watch', value: 4000, x: 320, y: 368 },
  { id: 'diamond', name: 'Moonlight Diamond', kind: 'diamond', value: 18000, x: 670, y: 256 },
  { id: 'safe', name: 'Vault Safe Contents', kind: 'safe', value: 15000, x: 1100, y: 140 },
  { id: 'vase', name: 'Jade Vase', kind: 'vase', value: 6000, x: 800, y: 626 },
  { id: 'brooch', name: 'Ruby Brooch', kind: 'brooch', value: 5000, x: 1150, y: 656 },
];

/** The three guards and the rooms they walk. Waypoints stay inside one connected space. */
export const GUARD_DEFS = [
  { name: 'Gallery B', waypoints: [[500, 130], [850, 130], [850, 340], [500, 340]] },
  { name: 'Great Hall', waypoints: [[480, 520], [1210, 520], [1210, 650], [480, 650]] },
  { name: 'Gallery A', waypoints: [[90, 130], [250, 130], [250, 330], [90, 330]] },
];

/** Wall-mounted cameras: base angle, sweep arc and a phase offset so they do not move in step. */
export const CAMERA_DEFS = [
  { x: 670, y: 70, baseAngle: Math.PI / 2, phase: 0 }, // gallery B north wall, looks south
  { x: 1252, y: 560, baseAngle: Math.PI, phase: 1.7 }, // great hall east wall, looks west
];

export const ENTRY = { x: 100, y: 640 };
export const EXIT = { x: 44, y: 655, w: 132, h: 45 }; // the service door in the south wall

function angleDiff(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** True when the segment from (ax,ay) to (bx,by) touches the rectangle. */
function segmentHitsRect(ax, ay, bx, by, r) {
  if (ax >= r.x && ax <= r.x + r.w && ay >= r.y && ay <= r.y + r.h) return true;
  if (bx >= r.x && bx <= r.x + r.w && by >= r.y && by <= r.y + r.h) return true;
  const edges = [
    [r.x, r.y, r.x + r.w, r.y],
    [r.x + r.w, r.y, r.x + r.w, r.y + r.h],
    [r.x + r.w, r.y + r.h, r.x, r.y + r.h],
    [r.x, r.y + r.h, r.x, r.y],
  ];
  for (const [cx, cy, dx, dy] of edges) {
    const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  }
  return false;
}

/** Line of sight between two points: clear when no wall or case crosses the segment. */
export function hasLineOfSight(ax, ay, bx, by) {
  for (const solid of SOLIDS) {
    if (segmentHitsRect(ax, ay, bx, by, solid)) return false;
  }
  return true;
}

/** True when (tx,ty) sits inside a vision cone from (ox,oy) facing `angle`, with a clear sightline. */
export function inCone(ox, oy, angle, range, halfAngle, tx, ty) {
  const dx = tx - ox;
  const dy = ty - oy;
  const dist = Math.hypot(dx, dy);
  if (dist > range) return false;
  if (dist < 1) return true;
  if (Math.abs(angleDiff(Math.atan2(dy, dx), angle)) > halfAngle) return false;
  return hasLineOfSight(ox, oy, tx, ty);
}

/** Slide a circle of `radius` along (dx,dy) without entering any solid rectangle. */
function moveCircle(body, dx, dy, radius) {
  let nx = body.x + dx;
  for (const s of SOLIDS) {
    if (nx + radius > s.x && nx - radius < s.x + s.w && body.y + radius > s.y && body.y - radius < s.y + s.h) {
      nx = dx > 0 ? s.x - radius : s.x + s.w + radius;
    }
  }
  body.x = nx;
  let ny = body.y + dy;
  for (const s of SOLIDS) {
    if (body.x + radius > s.x && body.x - radius < s.x + s.w && ny + radius > s.y && ny - radius < s.y + s.h) {
      ny = dy > 0 ? s.y - radius : s.y + s.h + radius;
    }
  }
  body.y = ny;
}

/** Final score: loot carried, plus a time bonus and a per-life bonus on a clean escape. */
export function finalScore(state) {
  let score = state.lootValue;
  if (state.won) score += Math.max(0, Math.round(PAR_TIME - state.time)) * 10 + state.lives * LIFE_BONUS;
  return score;
}

export function createWorld(random) {
  const seed = random.seed ?? 1;
  let rng = createRandom(seed);

  function freshState() {
    return {
      time: 0,
      alarm: 0,
      lootValue: 0,
      lives: LIVES,
      won: false,
      over: false,
      exitOpen: false,
      caughtFlash: 0,
      stepAcc: 0,
      thief: {
        x: ENTRY.x, y: ENTRY.y, angle: -Math.PI / 2, moving: false,
        target: null, invuln: 0,
      },
      guards: GUARD_DEFS.map((def, index) => ({
        name: def.name,
        x: def.waypoints[0][0],
        y: def.waypoints[0][1],
        angle: index === 1 ? 0 : Math.PI / 2,
        wpIndex: 1,
        mode: 'patrol',
        suspicion: 0,
        loseTimer: 0,
      })),
      cameras: CAMERA_DEFS.map((def) => ({
        x: def.x, y: def.y, baseAngle: def.baseAngle, phase: def.phase, angle: def.baseAngle,
      })),
      loot: LOOT_DEFS.map((def) => ({ ...def, taken: false })),
    };
  }

  const world = {
    state: freshState(),

    reset() {
      rng = createRandom(seed);
      world.state = freshState();
    },

    /** Grab a piece of loot near the thief (the E key); walking over loot grabs it for free. */
    tryGrab() {
      const { thief, loot } = world.state;
      for (const item of loot) {
        if (!item.taken && Math.hypot(item.x - thief.x, item.y - thief.y) <= THIEF.grabKeyRadius) {
          item.taken = true;
          world.state.lootValue += item.value;
          world.state.exitOpen = world.state.lootValue >= LOOT_GOAL;
          return item;
        }
      }
      return null;
    },

    /**
     * Advance the world one fixed step. `dir` is a unit vector from the keys (or 0,0);
     * `moveTarget` is a click-to-move waypoint the thief walks toward when no key is held.
     * In attract mode the guards keep patrolling and the cameras keep sweeping for the title screen.
     */
    step(dt, dir, moveTarget, attract) {
      const s = world.state;
      if (s.over || s.won) return 0;
      let events = 0;
      s.time += dt;
      if (s.caughtFlash > 0) s.caughtFlash = Math.max(0, s.caughtFlash - dt);
      if (s.thief.invuln > 0) s.thief.invuln = Math.max(0, s.thief.invuln - dt);

      // --- the thief ---------------------------------------------------------
      const t = s.thief;
      let mx = 0;
      let my = 0;
      if (dir && (dir.x !== 0 || dir.y !== 0)) {
        const len = Math.hypot(dir.x, dir.y) || 1;
        mx = dir.x / len;
        my = dir.y / len;
        t.target = null;
      } else if (moveTarget) {
        const dx = moveTarget.x - t.x;
        const dy = moveTarget.y - t.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 8) {
          mx = dx / dist;
          my = dy / dist;
        } else {
          t.target = null;
        }
      }
      t.moving = mx !== 0 || my !== 0;
      if (t.moving) {
        t.angle = Math.atan2(my, mx);
        moveCircle(t, mx * THIEF.speed * dt, my * THIEF.speed * dt, THIEF.radius);
        s.stepAcc += THIEF.speed * dt;
        if (s.stepAcc > 30) {
          s.stepAcc = 0;
          events |= EVENT_STEP;
        }
      }

      // --- cameras sweep, guards patrol or chase ----------------------------
      for (const cam of s.cameras) {
        cam.angle = cam.baseAngle + CAMERA.sweep * Math.sin(s.time * CAMERA.sweepSpeed + cam.phase);
      }
      for (const guard of s.guards) {
        const sees = inCone(guard.x, guard.y, guard.angle, GUARD.visionRange, GUARD.visionHalfAngle, t.x, t.y);
        if (!attract && sees && t.invuln <= 0) {
          guard.suspicion = Math.min(1, guard.suspicion + GUARD.suspicionRise * dt);
          guard.loseTimer = 0;
        } else {
          guard.suspicion = Math.max(0, guard.suspicion - GUARD.suspicionFall * dt);
        }
        const lockdown = s.alarm >= ALARM.lockdown;
        if (!attract && (guard.suspicion >= 1 || lockdown)) {
          if (guard.mode !== 'chase') guard.mode = 'chase';
        }
        if (guard.mode === 'chase') {
          if (attract) {
            guard.mode = 'patrol';
          } else if (sees) {
            guard.loseTimer = 0;
          } else {
            guard.loseTimer += dt;
            if (guard.loseTimer > GUARD.chaseMemory && !lockdown) guard.mode = 'patrol';
          }
          const dx = t.x - guard.x;
          const dy = t.y - guard.y;
          const dist = Math.hypot(dx, dy) || 1;
          guard.angle = Math.atan2(dy, dx);
          moveCircle(guard, (dx / dist) * GUARD.chaseSpeed * dt, (dy / dist) * GUARD.chaseSpeed * dt, GUARD.radius);
        } else {
          const wp = GUARD_DEFS[s.guards.indexOf(guard)].waypoints[guard.wpIndex];
          const dx = wp[0] - guard.x;
          const dy = wp[1] - guard.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 6) {
            guard.wpIndex = (guard.wpIndex + 1) % GUARD_DEFS[s.guards.indexOf(guard)].waypoints.length;
          } else {
            guard.angle = Math.atan2(dy, dx);
            moveCircle(guard, (dx / dist) * GUARD.patrolSpeed * dt, (dy / dist) * GUARD.patrolSpeed * dt, GUARD.radius);
          }
        }
      }

      // --- who can see the thief, and what it does to the alarm -------------
      let seenByGuard = false;
      let seenByCamera = false;
      if (!attract && t.invuln <= 0) {
        for (const guard of s.guards) {
          if (inCone(guard.x, guard.y, guard.angle, GUARD.visionRange, GUARD.visionHalfAngle, t.x, t.y)) {
            seenByGuard = true;
            break;
          }
        }
        for (const cam of s.cameras) {
          if (inCone(cam.x, cam.y, cam.angle, CAMERA.range, CAMERA.halfAngle, t.x, t.y)) {
            seenByCamera = true;
            break;
          }
        }
      }
      if (seenByGuard) s.alarm = Math.min(ALARM.lockdown, s.alarm + ALARM.guardRise * dt);
      else if (seenByCamera) s.alarm = Math.min(ALARM.lockdown, s.alarm + ALARM.cameraRise * dt);
      else s.alarm = Math.max(0, s.alarm - ALARM.decay * dt);

      // --- loot: walking over a piece sweeps it up --------------------------
      if (!attract) {
        for (const item of s.loot) {
          if (!item.taken && Math.hypot(item.x - t.x, item.y - t.y) <= THIEF.grabRadius) {
            item.taken = true;
            s.lootValue += item.value;
            s.exitOpen = s.lootValue >= LOOT_GOAL;
            events |= EVENT_LOOT;
          }
        }
      }

      // --- caught? -----------------------------------------------------------
      if (!attract && t.invuln <= 0) {
        for (const guard of s.guards) {
          if (Math.hypot(guard.x - t.x, guard.y - t.y) <= GUARD.catchRadius) {
            s.lives -= 1;
            s.caughtFlash = 0.6;
            events |= EVENT_CAUGHT;
            if (s.lives <= 0) {
              s.over = true;
              events |= EVENT_OVER;
              return events;
            }
            t.x = ENTRY.x;
            t.y = ENTRY.y;
            t.target = null;
            t.invuln = THIEF.invulnerable;
            s.alarm = ALARM.respawn;
            for (const g of s.guards) {
              g.mode = 'patrol';
              g.suspicion = 0;
              g.loseTimer = 0;
            }
            break;
          }
        }
      }

      // --- escape ------------------------------------------------------------
      if (!attract && s.exitOpen
        && t.x >= EXIT.x && t.x <= EXIT.x + EXIT.w && t.y >= EXIT.y && t.y <= EXIT.y + EXIT.h) {
        s.won = true;
        events |= EVENT_WIN;
      }
      return events;
    },
  };
  return world;
}
