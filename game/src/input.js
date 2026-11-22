// Keyboard and mouse: WASD/arrows to walk, click to set a waypoint the thief walks to,
// E to grab nearby loot, P to pause, R to restart, M to mute, Enter/Space/click to start.
// Click coordinates are converted from the page into the fixed 1280x720 logical field.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_RESTART = 4;
export const ACTION_GRAB = 8;
export const ACTION_MUTE = 16;

const KEYS = {
  KeyW: 'up', ArrowUp: 'up',
  KeyS: 'down', ArrowDown: 'down',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
};

export function createInput(canvas) {
  const held = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let waypoint = null;

  function toLogical(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * 1280,
      y: ((event.clientY - rect.top) / rect.height) * 720,
    };
  }

  window.addEventListener('keydown', (event) => {
    const dir = KEYS[event.code];
    if (dir) {
      held[dir] = true;
      event.preventDefault();
      return;
    }
    if (event.code === 'Enter' || event.code === 'Space') {
      actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (event.code === 'KeyP') {
      actions |= ACTION_PAUSE;
    } else if (event.code === 'KeyR') {
      actions |= ACTION_RESTART;
    } else if (event.code === 'KeyE') {
      actions |= ACTION_GRAB;
    } else if (event.code === 'KeyM') {
      actions |= ACTION_MUTE;
    }
  });
  window.addEventListener('keyup', (event) => {
    const dir = KEYS[event.code];
    if (dir) held[dir] = false;
  });
  canvas.addEventListener('pointerdown', (event) => {
    waypoint = toLogical(event);
    actions |= ACTION_CONFIRM;
  });

  return {
    /** Unit-ish movement vector from the held keys; 0,0 when none are held. */
    direction() {
      return {
        x: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        y: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
    /** The latest click-to-move waypoint, or null. Keys clear it in the world step. */
    moveTarget() {
      return waypoint;
    },
    clearWaypoint() {
      waypoint = null;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
