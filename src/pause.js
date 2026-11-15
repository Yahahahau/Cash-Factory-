// Centralized game pause manager. One state for the whole main game: every gameplay system (physics, production, machines,
// cursor assistant, timers, animations, income, stage progress) runs only while the state is RUNNING.
//   RUNNING          normal play
//   MINIGAME_ACTIVE  an exclusive mini-game session owns the input; the main game is frozen exactly as it was
//   RESUMING         the mini-game closed; the next frame re-bases every clock (no catch-up step) and returns to RUNNING
import * as E from './economy.js';

export const GS = { RUNNING: 'RUNNING', MINIGAME: 'MINIGAME_ACTIVE', RESUMING: 'RESUMING' };

export class PauseManager {
  constructor() {
    this.state = GS.RUNNING;
    this.listeners = [];
    this.snapshot = null;
    this.pausedAt = 0;
    this.lastPauseMs = 0;
  }
  get running() { return this.state === GS.RUNNING; }
  get frozen() { return this.state !== GS.RUNNING; }
  on(fn) { this.listeners.push(fn); }
  _emit() { for (const f of this.listeners) f(this.state, this); }

  // 1-3: check the main game is active, remember what the player had, flip the global state
  enterMini(s) {
    if (this.state !== GS.RUNNING) return false;
    const now = E.clock.now();
    this.snapshot = {
      boostRemaining: s.boost.mult > 1 && s.boost.until > now ? s.boost.until - now : 0,
      cooldownRemaining: s.cooldownUntil > now ? s.cooldownUntil - now : 0,
      cash: s.cash, gems: s.gems, stage: s.stage, progress: s.progress, run: s.run,
    };
    E.clock.freeze(); // 6: boost / cooldown deadlines stop moving
    this.pausedAt = performance.now();
    this.state = GS.MINIGAME;
    this._emit();
    return true;
  }

  // closing the finished mini-game: restore the timer durations and request a fresh baseline for the loop
  exitMini(s) {
    if (this.state !== GS.MINIGAME) return false;
    this.lastPauseMs = E.clock.thaw(s);
    this.state = GS.RESUMING;
    this._emit();
    return true;
  }

  // called by the main loop on the first frame after exitMini, once every clock was re-based
  settle() {
    if (this.state !== GS.RESUMING) return false;
    this.state = GS.RUNNING;
    this._emit();
    return true;
  }
}
