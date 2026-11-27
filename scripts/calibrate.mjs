// Measures real coins/s collected by the full headless game (Rapier physics) at several upgrade states, so the
// progression simulator uses measured machine throughput instead of a guess. Run: node scripts/calibrate.mjs
import { loadRapier, Physics } from '../src/physics.js';
import { Machines } from '../src/machines.js';
import { Game } from '../src/game.js';
import * as E from '../src/economy.js';
let seed = 7; Math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
await loadRapier();
export function measure(stage, f, secs = 60) {
  const state = E.newState();
  state.stage = stage;
  for (const k of Object.keys(E.GLOBALS)) state.levels[k] = Math.round(f * E.GLOBALS[k].max);
  for (const id of E.MACHINE_IDS) state.machines[id] = Math.max(id === 'pusherA' ? 1 : 0, Math.round(f * E.MACHINE_TYPES[E.MACHINES[id].type].max));
  const phys = new Physics(130), machines = new Machines(phys, () => state);
  const world = { pipeKick: 0, pulse: 0, particles: { emit() {} }, project: () => ({ x: 0, y: 0 }), setStage() {} };
  const audio = { collect() {}, grade() {}, drop() {}, tap() {}, buy() {}, clunk() {} };
  const ui = { floatText() {}, stageBanner() {}, setStage() {} };
  const game = new Game({ state, physics: phys, machines, world, audio, ui });
  game.setQuality({ limit: 100 });
  game.loadStage(false);
  state.progress = -1e9; // never clear the stage during the measurement
  for (let i = 0; i < 60 * 25; i++) game.update(1 / 60);
  const c0 = state.stats.coinsCollected;
  for (let i = 0; i < 60 * secs; i++) game.update(1 / 60);
  return { stage, f, spawn: +E.spawnRate(state).toFixed(2), model: +E.throughput(state).toFixed(2), measured: +((state.stats.coinsCollected - c0) / secs).toFixed(2) };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  for (const st of [1, 3, 6]) for (const f of [0, 0.15, 0.35, 0.6, 1]) console.log(JSON.stringify(measure(st, f)));
}
