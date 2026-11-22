// All sound is synthesised with WebAudio oscillators: no audio files, no network.
// Every call is guarded, so a blocked AudioContext (autoplay policy, headless screenshot
// runs) can never crash the game: sound is simply silent until a gesture unlocks it.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let alarmTimer = null;

  function context() {
    if (muted) return null;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    } catch {
      return null;
    }
  }

  function tone(freq, dur, type, gain, when = 0, slideTo = null) {
    const ac = context();
    if (!ac) return;
    try {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      const t0 = ac.currentTime + when;
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch {
      // A failed note is silent, never fatal.
    }
  }

  return {
    get muted() {
      return muted;
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    /** Soft carpet footstep tick. */
    footstep() {
      tone(180, 0.07, 'triangle', 0.045, 0, 120);
    },
    /** Two-note chime when loot is swept up. */
    chime() {
      tone(880, 0.16, 'sine', 0.09);
      tone(1318, 0.28, 'sine', 0.07, 0.09);
    },
    /** A low alarm swell while the meter climbs or lockdown hits. */
    alarmSwell() {
      if (alarmTimer !== null) return;
      tone(220, 0.7, 'sawtooth', 0.05, 0, 440);
      tone(233, 0.7, 'sawtooth', 0.04, 0.35, 466);
      alarmTimer = window.setTimeout(() => {
        alarmTimer = null;
      }, 900);
    },
    /** Short descending thud when the thief is caught. */
    caught() {
      tone(320, 0.3, 'square', 0.06, 0, 90);
    },
    /** Rising arpeggio for a clean escape. */
    win() {
      [523, 659, 784, 1046].forEach((freq, i) => tone(freq, 0.32, 'sine', 0.09, i * 0.12));
    },
  };
}
