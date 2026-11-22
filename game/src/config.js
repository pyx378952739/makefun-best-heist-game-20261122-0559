// Every tuning number and colour in one place. The playfield is a fixed 1280x720 logical area;
// the renderer scales it to the window, so no rule below depends on the screen size.

export const FIELD = { width: 1280, height: 720 };

/** Height of the HUD bar across the top; the museum floor starts below it. */
export const HUD_HEIGHT = 46;

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const LIVES = 3;

/** Loot value the thief must carry before the exit door opens. */
export const LOOT_GOAL = 40000;

export const THIEF = {
  radius: 14,
  speed: 205,
  /** Seconds of mercy after being caught and sent back to the entry. */
  invulnerable: 2.5,
  /** How close the thief must be to sweep loot off a pedestal by walking over it. */
  grabRadius: 36,
  /** Reach of the E key when grabbing from a step away. */
  grabKeyRadius: 52,
};

export const GUARD = {
  radius: 15,
  patrolSpeed: 92,
  chaseSpeed: 158,
  visionRange: 230,
  /** Half of the vision cone, in radians. */
  visionHalfAngle: 0.56,
  /** Being this close to a chasing guard gets the thief caught. */
  catchRadius: 28,
  /** Suspicion 0..1: how fast a guard who can see the thief becomes certain. */
  suspicionRise: 1.4,
  suspicionFall: 0.45,
  /** Seconds a chasing guard keeps hunting after losing sight. */
  chaseMemory: 3,
};

export const CAMERA = {
  range: 285,
  /** Half of the camera cone, in radians. */
  halfAngle: 0.5,
  /** How far, in radians, the cone sweeps either side of its base angle. */
  sweep: 0.96,
  /** Sweep speed, radians per second of phase. */
  sweepSpeed: 0.55,
};

export const ALARM = {
  /** Alarm points per second while a guard has eyes on the thief. */
  guardRise: 30,
  /** Alarm points per second while a camera has eyes on the thief. */
  cameraRise: 22,
  /** Alarm points per second the meter drains while nobody sees the thief. */
  decay: 5,
  /** Alarm 100: lockdown, every guard chases. */
  lockdown: 100,
  /** Alarm level after being caught and respawned at the entry. */
  respawn: 50,
};

/** Win bonus: seconds under this par time pay 10 points each. */
export const PAR_TIME = 600;
/** Points per life still held when the thief escapes. */
export const LIFE_BONUS = 2000;

export const PALETTE = {
  backdrop: '#0a0a12',
  floorA: '#1d1a26',
  floorB: '#221e2e',
  floorLine: '#2e2940',
  wall: '#3a3348',
  wallTop: '#574d6e',
  wallBase: '#241f30',
  rope: '#a4123f',
  ropePost: '#d8b25c',
  caseGlass: '#9fc4d8',
  caseBase: '#4a4038',
  gold: '#d8b25c',
  diamond: '#7fe3f0',
  text: '#f2ecdf',
  muted: '#9a93ad',
  panel: '#14101d',
  panelLine: '#3a3348',
  alarmLow: '#7fc76a',
  alarmMid: '#f2c94c',
  alarmHigh: '#e5534b',
  coneCalm: '#f2c94c',
  coneWarn: '#f08c1e',
  coneHot: '#e5534b',
  thief: '#15131c',
  thiefTrim: '#e8e2f2',
  guard: '#2b2f3a',
  guardTrim: '#c8ccd8',
  exit: '#3fae6a',
  exitOpen: '#57d98a',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'velvet-vault.best';
