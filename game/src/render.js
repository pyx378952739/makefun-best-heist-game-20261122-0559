// Everything the player sees, drawn on one canvas: the marble museum floor, walls, velvet
// ropes, display cases, loot, guards with their vision cones, sweeping cameras, the thief,
// the HUD bar, and the title / paused / caught / victory / game-over screens.
// Importing this module touches no DOM; the canvas is handed in by createRenderer.
import {
  ALARM, CAMERA, FIELD, FONT, GUARD, HUD_HEIGHT, LOOT_GOAL, PALETTE, THIEF,
} from './config.js';
import { CASES, EXIT, WALLS } from './world.js';
import { finalScore } from './world.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const TAU = Math.PI * 2;

function fmtMoney(value) {
  return `$${value.toLocaleString('en-US')}`;
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function coneColor(suspicion) {
  if (suspicion >= 0.66) return PALETTE.coneHot;
  if (suspicion >= 0.33) return PALETTE.coneWarn;
  return PALETTE.coneCalm;
}

export function createRenderer(canvas) {
  canvas.width = FIELD.width;
  canvas.height = FIELD.height;
  const ctx = canvas.getContext('2d');

  // Deterministic floor speckle, fixed once at boot so screenshots are stable.
  let seed = 1234567;
  const speckles = [];
  for (let i = 0; i < 260; i += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    speckles.push({ x: (seed % 1280), y: HUD_HEIGHT + (seed % 654), r: 1 + (seed % 3) * 0.5 });
  }

  function drawFloor() {
    ctx.fillStyle = PALETTE.floorA;
    ctx.fillRect(0, HUD_HEIGHT, FIELD.width, FIELD.height - HUD_HEIGHT);
    const tile = 80;
    for (let y = HUD_HEIGHT; y < FIELD.height; y += tile) {
      for (let x = 0; x < FIELD.width; x += tile) {
        if (((x / tile) + (y / tile)) % 2 === 0) {
          ctx.fillStyle = PALETTE.floorB;
          ctx.fillRect(x, y, tile, tile);
        }
      }
    }
    ctx.strokeStyle = PALETTE.floorLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= FIELD.width; x += tile) {
      ctx.moveTo(x, HUD_HEIGHT);
      ctx.lineTo(x, FIELD.height);
    }
    for (let y = HUD_HEIGHT; y <= FIELD.height; y += tile) {
      ctx.moveTo(0, y);
      ctx.lineTo(FIELD.width, y);
    }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (const s of speckles) {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
  }

  function drawWalls() {
    for (const w of WALLS) {
      ctx.fillStyle = PALETTE.wall;
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.fillStyle = PALETTE.wallTop;
      if (w.h <= 20) ctx.fillRect(w.x, w.y, w.w, 4);
      else ctx.fillRect(w.x, w.y, 4, w.h);
      ctx.fillStyle = PALETTE.wallBase;
      if (w.h <= 20) ctx.fillRect(w.x, w.y + w.h - 3, w.w, 3);
      else ctx.fillRect(w.x + w.w - 3, w.y, 3, w.h);
    }
  }

  function drawRopes() {
    // Velvet ropes cordon off the gallery pieces: red rope between gold posts.
    const runs = [
      [[70, 170], [370, 170]],
      [[480, 170], [620, 170]],
      [[720, 170], [870, 170]],
      [[950, 170], [1210, 170]],
      [[480, 470], [760, 470]],
      [[820, 470], [1180, 470]],
    ];
    ctx.strokeStyle = PALETTE.rope;
    ctx.lineWidth = 4;
    for (const [[x1, y1], [x2, y2]] of runs) {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo((x1 + x2) / 2, y1 + 14, x2, y2);
      ctx.stroke();
      for (const [px, py] of [[x1, y1], [x2, y2]]) {
        ctx.fillStyle = PALETTE.ropePost;
        ctx.beginPath();
        ctx.arc(px, py, 5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#8a6d2f';
        ctx.fillRect(px - 1.5, py - 12, 3, 12);
      }
    }
  }

  function drawCases() {
    for (const c of CASES) {
      ctx.fillStyle = PALETTE.caseBase;
      ctx.fillRect(c.x, c.y, c.w, c.h);
      ctx.fillStyle = 'rgba(159,196,216,0.28)';
      ctx.fillRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8);
      ctx.strokeStyle = 'rgba(230,240,245,0.55)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(c.x + 4, c.y + 4, c.w - 8, c.h - 8);
      ctx.beginPath();
      ctx.moveTo(c.x + 8, c.y + c.h - 8);
      ctx.lineTo(c.x + c.w - 20, c.y + 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.stroke();
    }
  }

  function sparkle(x, y, time, color) {
    const pulse = 0.6 + 0.4 * Math.sin(time * 5 + x);
    const r = 7 * pulse + 3;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - r, y);
    ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r);
    ctx.lineTo(x, y + r);
    ctx.stroke();
  }

  function drawLootItem(item, time) {
    const { x, y } = item;
    if (item.kind === 'painting') {
      // The Starlit Duchess, framed in gold on the gallery wall.
      ctx.fillStyle = PALETTE.gold;
      ctx.fillRect(x - 46, y - 32, 92, 64);
      ctx.fillStyle = '#1b2a52';
      ctx.fillRect(x - 40, y - 26, 80, 52);
      ctx.fillStyle = '#e8d9a8';
      ctx.beginPath();
      ctx.arc(x, y - 6, 11, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#7a5c8f';
      ctx.fillRect(x - 16, y + 4, 32, 22);
      ctx.fillStyle = '#f2ecdf';
      for (let i = 0; i < 6; i += 1) {
        ctx.fillRect(x - 36 + i * 13, y - 24 + (i % 2) * 4, 2, 2);
      }
    } else if (item.kind === 'diamond') {
      ctx.fillStyle = PALETTE.diamond;
      ctx.beginPath();
      ctx.moveTo(x - 16, y - 4);
      ctx.lineTo(x, y - 18);
      ctx.lineTo(x + 16, y - 4);
      ctx.lineTo(x + 9, y + 14);
      ctx.lineTo(x - 9, y + 14);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#dff8ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 16, y - 4);
      ctx.lineTo(x + 16, y - 4);
      ctx.moveTo(x, y - 18);
      ctx.lineTo(x, y + 14);
      ctx.stroke();
    } else if (item.kind === 'safe') {
      ctx.fillStyle = '#5a5f6a';
      ctx.fillRect(x - 26, y - 18, 52, 36);
      ctx.fillStyle = '#2e323c';
      ctx.fillRect(x - 20, y - 12, 40, 24);
      ctx.strokeStyle = PALETTE.gold;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 6, y - 5);
      ctx.stroke();
    } else if (item.kind === 'vase') {
      ctx.fillStyle = '#3f8f6a';
      ctx.beginPath();
      ctx.moveTo(x - 8, y - 18);
      ctx.lineTo(x + 8, y - 18);
      ctx.lineTo(x + 13, y + 2);
      ctx.lineTo(x + 7, y + 16);
      ctx.lineTo(x - 7, y + 16);
      ctx.lineTo(x - 13, y + 2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#bfe8d2';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 12);
      ctx.quadraticCurveTo(x - 12, y, x - 5, y + 12);
      ctx.stroke();
    } else if (item.kind === 'watch') {
      ctx.fillStyle = PALETTE.gold;
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#f7efdc';
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#3a3348';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y - 8);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 6, y + 2);
      ctx.stroke();
    } else {
      // Ruby brooch.
      ctx.fillStyle = '#c22447';
      ctx.beginPath();
      ctx.moveTo(x, y - 13);
      ctx.lineTo(x + 11, y);
      ctx.lineTo(x, y + 13);
      ctx.lineTo(x - 11, y);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#ff9db4';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    sparkle(x, y - 24, time, '#ffe9a8');
  }

  function drawCone(ox, oy, angle, range, halfAngle, color, alpha) {
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.arc(ox, oy, range, angle - halfAngle, angle + halfAngle);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawGuard(guard) {
    drawCone(guard.x, guard.y, guard.angle, GUARD.visionRange, GUARD.visionHalfAngle,
      coneColor(guard.suspicion), guard.mode === 'chase' ? 0.30 : 0.16);
    // Dark suit, pale shirt front, head; a small torch dot at the cone's root.
    ctx.fillStyle = PALETTE.guard;
    ctx.beginPath();
    ctx.arc(guard.x, guard.y, GUARD.radius, 0, TAU);
    ctx.fill();
    ctx.fillStyle = PALETTE.guardTrim;
    ctx.beginPath();
    ctx.arc(guard.x + Math.cos(guard.angle) * 6, guard.y + Math.sin(guard.angle) * 6, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#d9a06a';
    ctx.beginPath();
    ctx.arc(guard.x + Math.cos(guard.angle) * 2, guard.y + Math.sin(guard.angle) * 2 - 4, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff2b0';
    ctx.beginPath();
    ctx.arc(guard.x + Math.cos(guard.angle) * (GUARD.radius + 3),
      guard.y + Math.sin(guard.angle) * (GUARD.radius + 3), 2.5, 0, TAU);
    ctx.fill();
    if (guard.mode === 'chase') {
      ctx.fillStyle = PALETTE.coneHot;
      ctx.font = 'bold 13px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('!', guard.x, guard.y - GUARD.radius - 6);
    }
  }

  function drawCamera(cam) {
    drawCone(cam.x, cam.y, cam.angle, CAMERA.range, CAMERA.halfAngle, '#ff5a4e', 0.10);
    ctx.fillStyle = '#3a3f4c';
    ctx.fillRect(cam.x - 12, cam.y - 7, 24, 14);
    ctx.fillStyle = '#e5534b';
    ctx.beginPath();
    ctx.arc(cam.x, cam.y, 4, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cam.x + Math.cos(cam.angle) * 10, cam.y + Math.sin(cam.angle) * 10, 2, 0, TAU);
    ctx.fill();
  }

  function drawThief(thief, time) {
    // Black-clad figure with a pale mask band; blinks in and out while invulnerable.
    if (thief.invuln > 0 && Math.floor(time * 10) % 2 === 0) return;
    ctx.fillStyle = PALETTE.thief;
    ctx.beginPath();
    ctx.arc(thief.x, thief.y, THIEF.radius, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = PALETTE.thiefTrim;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = PALETTE.thiefTrim;
    ctx.beginPath();
    ctx.arc(thief.x + Math.cos(thief.angle) * 5, thief.y + Math.sin(thief.angle) * 5, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#15131c';
    ctx.fillRect(thief.x - 7, thief.y - 3, 14, 5);
    if (thief.target) {
      ctx.strokeStyle = 'rgba(242,236,223,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(thief.target.x, thief.target.y, 8, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(thief.target.x - 12, thief.target.y);
      ctx.lineTo(thief.target.x + 12, thief.target.y);
      ctx.moveTo(thief.target.x, thief.target.y - 12);
      ctx.lineTo(thief.target.x, thief.target.y + 12);
      ctx.stroke();
    }
  }

  function drawExit(state) {
    ctx.fillStyle = state.exitOpen ? PALETTE.exitOpen : PALETTE.exit;
    ctx.fillRect(EXIT.x, EXIT.y, EXIT.w, EXIT.h);
    ctx.fillStyle = '#0a0a12';
    ctx.font = 'bold 15px ' + FONT;
    ctx.textAlign = 'center';
    ctx.fillText(state.exitOpen ? 'EXIT — OPEN' : 'EXIT — LOCKED', EXIT.x + EXIT.w / 2, EXIT.y + 20);
    ctx.font = '11px ' + FONT;
    ctx.fillText(state.exitOpen ? 'run for it' : `needs ${fmtMoney(LOOT_GOAL)} loot`, EXIT.x + EXIT.w / 2, EXIT.y + 36);
  }

  function drawHud(state) {
    ctx.fillStyle = PALETTE.panel;
    ctx.fillRect(0, 0, FIELD.width, HUD_HEIGHT);
    ctx.strokeStyle = PALETTE.panelLine;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, HUD_HEIGHT - 0.5);
    ctx.lineTo(FIELD.width, HUD_HEIGHT - 0.5);
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = PALETTE.gold;
    ctx.font = 'bold 17px ' + FONT;
    ctx.fillText(`LOOT ${fmtMoney(state.lootValue)}`, 18, HUD_HEIGHT / 2 - 7);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '12px ' + FONT;
    ctx.fillText(`goal ${fmtMoney(LOOT_GOAL)}`, 18, HUD_HEIGHT / 2 + 12);

    const barX = 260;
    const barW = 300;
    const barY = 13;
    const barH = 20;
    ctx.fillStyle = '#241f30';
    ctx.fillRect(barX, barY, barW, barH);
    const frac = state.alarm / ALARM.lockdown;
    ctx.fillStyle = frac >= 0.66 ? PALETTE.alarmHigh : frac >= 0.33 ? PALETTE.alarmMid : PALETTE.alarmLow;
    ctx.fillRect(barX, barY, barW * frac, barH);
    ctx.strokeStyle = PALETTE.panelLine;
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillText(`ALARM ${Math.round(state.alarm)}%`, barX + barW + 12, HUD_HEIGHT / 2);

    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 17px ' + FONT;
    ctx.fillText(fmtTime(state.time), 760, HUD_HEIGHT / 2);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '12px ' + FONT;
    ctx.fillText('TIME', 760, HUD_HEIGHT / 2 + 14);

    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 17px ' + FONT;
    let lives = '';
    for (let i = 0; i < state.lives; i += 1) lives += '♥ ';
    ctx.fillText(lives || '—', 880, HUD_HEIGHT / 2);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '12px ' + FONT;
    ctx.fillText('LIVES', 880, HUD_HEIGHT / 2 + 14);

    ctx.fillStyle = state.exitOpen ? PALETTE.exitOpen : PALETTE.muted;
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillText(state.exitOpen ? 'EXIT OPEN — run for the door!' : 'Grab $40,000, then reach the exit',
      FIELD.width - 18, HUD_HEIGHT / 2);
    ctx.textAlign = 'left';
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(8,8,16,0.72)';
    ctx.fillRect(0, HUD_HEIGHT, FIELD.width, FIELD.height - HUD_HEIGHT);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent || PALETTE.gold;
    ctx.font = 'bold 54px ' + FONT;
    ctx.fillText(title, FIELD.width / 2, 250);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '19px ' + FONT;
    lines.forEach((line, i) => {
      ctx.fillText(line, FIELD.width / 2, 310 + i * 32);
    });
    ctx.textAlign = 'left';
  }

  function draw(state, screen, best) {
    ctx.clearRect(0, 0, FIELD.width, FIELD.height);
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    drawFloor();
    drawExit(state);
    drawRopes();
    drawCases();
    for (const item of state.loot) {
      if (!item.taken) drawLootItem(item, state.time);
    }
    for (const cam of state.cameras) drawCamera(cam);
    for (const guard of state.guards) drawGuard(guard);
    drawThief(state.thief, state.time);
    drawWalls();
    drawHud(state);

    if (state.caughtFlash > 0) {
      ctx.fillStyle = `rgba(229,83,75,${(state.caughtFlash / 0.6) * 0.35})`;
      ctx.fillRect(0, HUD_HEIGHT, FIELD.width, FIELD.height - HUD_HEIGHT);
    }

    if (screen === SCREEN_TITLE) {
      overlay('THE VELVET VAULT', [
        'A top-down stealth heist. Slip past the guards and cameras,',
        'grab $40,000 of loot, and reach the exit before the alarm hits 100.',
        '',
        'WASD / arrows to walk · click to move · E to grab · P pause · R restart · M mute',
        '',
        'Press Enter or click to begin the heist.',
      ]);
      if (best > 0) {
        ctx.textAlign = 'center';
        ctx.fillStyle = PALETTE.muted;
        ctx.font = '16px ' + FONT;
        ctx.fillText(`Best escape score: ${best.toLocaleString('en-US')}`, FIELD.width / 2, 560);
        ctx.textAlign = 'left';
      }
    } else if (screen === SCREEN_PAUSED) {
      overlay('PAUSED', ['The museum holds its breath.', '', 'P or Enter to keep going · R to start over.']);
    } else if (screen === SCREEN_OVER) {
      overlay('LOCKED IN', [
        'The guards caught you three times. The vault stays shut tonight.',
        `Loot carried: ${fmtMoney(state.lootValue)} · Time in the museum: ${fmtTime(state.time)}`,
        '',
        'Press Enter or click to try again.',
      ], PALETTE.alarmHigh);
    } else if (screen === SCREEN_WIN) {
      const taken = state.loot.filter((item) => item.taken);
      const lines = [
        `You slipped out with ${fmtMoney(state.lootValue)} in ${fmtTime(state.time)} — clean getaway.`,
        '',
        ...taken.map((item) => `  ${item.name} — ${fmtMoney(item.value)}`),
        '',
        `Score: ${finalScore(state).toLocaleString('en-US')}   Best: ${Math.max(best, finalScore(state)).toLocaleString('en-US')}`,
        '',
        'Press Enter or click to heist again.',
      ];
      overlay('CLEAN GETAWAY', lines, PALETTE.exitOpen);
    }
  }

  return { draw };
}
