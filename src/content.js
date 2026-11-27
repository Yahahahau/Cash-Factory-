// Expansion content (pure data, no imports): upgrade branches, machine parts, missions, run milestones, collections.
// economy.js reads the effect helpers at the bottom; progression.js implements buying / tracking; ui-progress.js draws it.

// ---- per-run branch upgrades that are not machines or the three original globals -----------------------------------
// unlock = stage (in the current run) at which the upgrade appears. Prices use the same dynamic price multiplier as
// every other upgrade (run x wallet tier), so they scale with the existing economy.
export const EXTRA = {
  polish: { branch: 'economy', name: 'Coin Polish', icon: 'coin', base: 120, growth: 1.32, max: 20, unlock: 2, info: 'Every collected coin is worth +5% per level.' },
  bounty: { branch: 'economy', name: 'Stage Bounty', icon: 'flag', base: 350, growth: 1.5, max: 10, unlock: 3, info: 'Stage-clear cash +15% per level and +1 gem every 2 levels.' },
  feeder: { branch: 'automation', name: 'Auto Feeder', icon: 'drop', base: 250, growth: 1.55, max: 8, unlock: 3, info: 'Uses a stored drop charge by itself. Faster every level.' },
  vault: { branch: 'automation', name: 'Night Vault', icon: 'clock', base: 700, growth: 1.5, max: 8, unlock: 5, info: 'Offline income: +1 h limit and +4% efficiency per level.' },
  combo: { branch: 'special', name: 'Combo Keeper', icon: 'speed', base: 1500, growth: 1.6, max: 6, unlock: 5, info: 'Combo window +0.4 s and combo bonus cap +10% per level.' },
  golden: { branch: 'special', name: 'Golden Touch', icon: 'trophy', base: 3000, growth: 1.55, max: 10, unlock: 6, info: '1.5% per level of new coins are golden: x3 value, shown in gold.' },
  resonance: { branch: 'special', name: 'Stage Resonance', icon: 'wave', base: 40000, growth: 2.0, max: 5, unlock: 7, info: 'Coins +3% per level for every stage cleared this run.' },
};
export const EXTRA_IDS = Object.keys(EXTRA);

export const BRANCHES = [
  { id: 'machine', name: 'Coin Machine', icon: 'piston', info: 'Pistons, conveyor, blower, magnet and launcher (tap a machine in the game).' },
  { id: 'economy', name: 'Economy', icon: 'coin', info: 'Coin rate, field capacity, rare coins, coin value and stage rewards.' },
  { id: 'automation', name: 'Automation', icon: 'mouse', info: 'Things the machine does for you, also while you are away.' },
  { id: 'special', name: 'Special', icon: 'trophy', info: 'Rare modifiers that change how coins behave. Unlock on later stages.' },
];

// ---- machine parts: PERMANENT (kept by New Run), bought with gems, unlocked by best stage ever reached ------------
export const TIERS = ['Stock', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Crystal'];
export const TIER_COLOR = [null, 0xc98a4a, 0xdfe4ec, 0xffcd38, 0xbfeaff, 0xc79bff];
export const PARTS = {
  piston: { name: 'Piston Drive', icon: 'piston', unlock: [2, 4, 6, 8, 10], gems: [8, 20, 40, 75, 130], info: 'Pistons push 6% more often and move 8% more coins per tier.', look: 'Piston heads' },
  deck: { name: 'Coin Deck', icon: 'coin', unlock: [3, 5, 7, 9, 11], gems: [10, 24, 45, 80, 140], info: 'Coin value +6% per tier.', look: 'Platform edges glow' },
  tray: { name: 'Collector Tray', icon: 'gem', unlock: [4, 6, 8, 10, 12], gems: [12, 26, 50, 85, 150], info: 'Rare coin chance +0.4% and combo cap +5% per tier.', look: 'Grinder rollers' },
  frame: { name: 'Machine Frame', icon: 'box', unlock: [2, 5, 8, 11, 14], gems: [8, 22, 45, 80, 140], info: '+4 coins on the field per tier, +1 drop charge at Silver and Platinum.', look: 'Machine housings' },
  drive: { name: 'Main Drive', icon: 'gear', unlock: [5, 7, 9, 11, 13], gems: [15, 30, 55, 95, 160], info: 'Conveyor, blower, magnet and launcher +7% power, coin rate +5% per tier.', look: 'Steel fittings' },
};
export const PART_IDS = Object.keys(PARTS);

// ---- run milestones: an ordered track per run, rewarded automatically ------------------------------------------------
// New Run needs stage NEWRUN_STAGE and at least NEWRUN_MILESTONES of these.
export const NEWRUN_STAGE = 10;
export const NEWRUN_MILESTONES = 10;
export const MILESTONES = [
  { id: 'm_piston', name: 'Install Piston A', test: (s) => s.machines.pusherA > 0, cash: 15, gems: 1 },
  { id: 'm_earn1', name: 'Earn $500 this run', test: (s) => s.runStats.earned >= 500, cash: 60, gems: 1 },
  { id: 'm_stage2', name: 'Clear stage 1', test: (s) => s.stage >= 2, cash: 0, gems: 2 },
  { id: 'm_mach3', name: 'Run 3 different machines', test: (s) => Object.values(s.machines).filter((v) => v > 0).length >= 3, cash: 200, gems: 2 },
  { id: 'm_up15', name: 'Buy 15 upgrades this run', test: (s) => s.runStats.upgrades >= 15, cash: 400, gems: 2 },
  { id: 'm_stage4', name: 'Clear stage 3', test: (s) => s.stage >= 4, cash: 0, gems: 3 },
  { id: 'm_polish', name: 'Coin Polish level 5', test: (s) => (s.xlv.polish || 0) >= 5, cash: 1500, gems: 3 },
  { id: 'm_auto', name: 'Own an Automation upgrade', test: (s) => s.cursor.owned || (s.xlv.feeder || 0) > 0 || (s.xlv.vault || 0) > 0, cash: 1000, gems: 3 },
  { id: 'm_earn2', name: 'Earn $50K this run', test: (s) => s.runStats.earned >= 5e4, cash: 0, gems: 4 },
  { id: 'm_stage6', name: 'Clear stage 5', test: (s) => s.stage >= 6, cash: 0, gems: 4 },
  { id: 'm_special', name: 'Own a Special upgrade', test: (s) => (s.xlv.combo || 0) + (s.xlv.golden || 0) + (s.xlv.resonance || 0) > 0, cash: 5000, gems: 5 },
  { id: 'm_combo', name: 'Reach a x30 combo this run', test: (s) => s.runStats.bestCombo >= 30, cash: 0, gems: 5 },
  { id: 'm_up60', name: 'Buy 60 upgrades this run', test: (s) => s.runStats.upgrades >= 60, cash: 0, gems: 5 },
  { id: 'm_stage8', name: 'Clear stage 7', test: (s) => s.stage >= 8, cash: 0, gems: 6 },
  { id: 'm_earn3', name: 'Earn $1M this run', test: (s) => s.runStats.earned >= 1e6, cash: 0, gems: 6 },
  { id: 'm_stage10', name: 'Clear stage 9', test: (s) => s.stage >= 10, cash: 0, gems: 8 },
];

// ---- missions: three at a time, generated from templates, claimed for gems ---------------------------------------
// progress = stat now - stat when the mission was created (so old progress never counts twice)
export const MISSION_KINDS = {
  coins: { stat: (s) => s.stats.coinsCollected, text: (n) => `Collect ${n} coins`, size: (q) => 120 + 60 * q },
  buy: { stat: (s) => s.stats.upgradesBought, text: (n) => `Buy ${n} upgrades`, size: (q) => 4 + (q % 4) * 2 },
  stage: { stat: (s) => s.stats.stagesCleared, text: (n) => `Clear ${n} stage${n > 1 ? 's' : ''}`, size: (q) => 1 + (q % 3 === 2 ? 1 : 0) },
  drops: { stat: (s) => s.stats.manualDrops, text: (n) => `Use ${n} manual drops`, size: (q) => 10 + 5 * (q % 3) },
  earn: { stat: (s) => s.stats.totalEarned, text: (n) => `Earn $${n >= 1000 ? Math.round(n / 1000) + 'K' : n}`, size: null },
  parts: { stat: (s) => s.stats.partsUpgraded, text: () => 'Upgrade a machine part', size: () => 1, needs: (s) => s.gems >= 8 || s.perm.bestStage >= 3 },
  fly: { stat: (s) => s.mini.wins, text: () => 'Win a Flying Ball round', size: () => 1 },
};

// ---- collections: cosmetic only (clearly labelled), earned through achievements and stages -----------------------
export const COSMETICS = {
  pipe_green: { cat: 'pipe', name: 'Classic Green', color: 0x2fc95b, how: 'Default' },
  pipe_ruby: { cat: 'pipe', name: 'Ruby', color: 0xe0384a, how: 'Achievement: Finish your first run' },
  pipe_cobalt: { cat: 'pipe', name: 'Cobalt', color: 0x2f6fe0, how: 'Achievement: Reach stage 10' },
  pipe_gold: { cat: 'pipe', name: 'Gold Leaf', color: 0xf2c230, how: 'Achievement: Earn $1M in total' },
  pipe_obsidian: { cat: 'pipe', name: 'Obsidian', color: 0x2a2633, how: 'Achievement: Install 15 part tiers' },
  pipe_candy: { cat: 'pipe', name: 'Candy Pink', color: 0xff7eb6, how: 'Achievement: Complete 25 missions' },
  spark_gold: { cat: 'spark', name: 'Gold Sparks', colors: [0xffe066, 0xffffff], how: 'Default' },
  spark_ice: { cat: 'spark', name: 'Ice Sparks', colors: [0x9fe8ff, 0xffffff], how: 'Achievement: Win Flying Ball 3 times' },
  spark_neon: { cat: 'spark', name: 'Neon Sparks', colors: [0xff5ce1, 0x7de8ff], how: 'Achievement: Reach a x50 combo' },
  spark_ember: { cat: 'spark', name: 'Ember Sparks', colors: [0xff7a2a, 0xffd36a], how: 'Achievement: Complete all run milestones' },
};
export const COSMETIC_CATS = { pipe: 'Pipe Paint', spark: 'Collect Sparks' };
export const DEFAULT_EQUIP = { pipe: 'pipe_green', spark: 'spark_gold' };

// ---- effect helpers (used by economy.js; every field may be missing in old saves) --------------------------------
export const feederInterval = (lvl) => (lvl <= 0 ? Infinity : Math.max(1.5, 9 - 0.95 * lvl));
export const xl = (s, k) => (s.xlv && s.xlv[k]) || 0;
export const pt = (s, k) => (s.parts && s.parts[k]) || 0;
