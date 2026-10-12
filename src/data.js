export const TILE = 2.0;
export const WALL_H = 4.0;
export const CRATE_H = 2.0;
export const SANDBAG_H = 0.9;
export const BARREL_H = 1.5;
export const STEP_H = 0.5;
export const STAIR_STEP = 0.18;
export const MAX_CLIMB = 0.55;
export const SLOPES = {
  '>': [1, 0, 'stairs'], '<': [-1, 0, 'stairs'],
  'v': [0, 1, 'stairs'], '^': [0, -1, 'stairs'],
  'E': [1, 0, 'ramp'], 'W': [-1, 0, 'ramp'],
  'S': [0, 1, 'ramp'], 'N': [0, -1, 'ramp'],
};

export const SOLID = '#cox';
export const OPAQUE = '#co';
export const FLOOR_KINDS = ".,:_=-'*+;";
const c = (r, g, b) => [r, g, b];
export const FLOOR_COLORS = {
  '.': [c(0.80, 0.62, 0.42), c(0.74, 0.56, 0.37)],
  ':': [c(0.52, 0.72, 0.68), c(0.48, 0.68, 0.64)],
  ',': [c(0.93, 0.93, 0.90), c(0.76, 0.84, 0.90)],
  '_': [c(0.95, 0.86, 0.62), c(0.91, 0.81, 0.56)],
  '=': [c(0.50, 0.43, 0.36), c(0.46, 0.39, 0.32)],
  '-': [c(0.70, 0.66, 0.60), c(0.66, 0.62, 0.56)],
  "'": [c(0.82, 0.50, 0.36), c(0.77, 0.46, 0.32)],
  '*': [c(0.62, 0.60, 0.56), c(0.57, 0.55, 0.51)],
  '+': [c(0.45, 0.62, 0.35), c(0.41, 0.58, 0.32)],
  ';': [c(0.55, 0.60, 0.66), c(0.50, 0.55, 0.61)],
};

export const LAYER_WORLD = 1;
export const LAYER_SIGHT = 2;
export const LAYER_PLAYER = 4;
export const LAYER_HAMSTERS = 8;

export const PLAYER_R = 0.4;
export const PLAYER_H = 1.8;
export const PLAYER_EYE = 1.62;
export const PLAYER_SPEED = 6.5;
export const PLAYER_WALK = 3.4;
export const PLAYER_CROUCH_EYE = 1.1;
export const JUMP_SPEED = 6.2;
export const GRAVITY = 18.0;

export const HAMSTER_SIZE = 1.25;
export const HAMSTER_R = 0.45;
export const CHUBBY_SIZE = 1.65;
export const CHUBBY_R = 0.62;
export const BOSS_SIZE = 4.6;
export const BOSS_R = 1.35;
export const BOSS_WALL_R = 0.85;
export const BOSS_HP = 60;
export const SPEED_SCALE = 0.025;
export const NUT_SPEED_SCALE = 0.04;
export const SIGHT_RANGE = 18.0;
export const BOSS_SIGHT_RANGE = 22.0;
export const SPAWN_SAFE_DIST = 10.0;
export const SPAWN_SHIELD = 1.0;

export const ROUND_WAVES = [8, 12, 16];
export const HAMSTER_KINDS = {
  normal: { speed: 1.0, hp: 2, size: HAMSTER_SIZE, r: HAMSTER_R, tint: [1, 1, 1], contact: 25, label: 'Hamster' },
  chubby: { speed: 0.7, hp: 4, size: CHUBBY_SIZE, r: CHUBBY_R, tint: [1, 1, 1], contact: 25, label: 'Chubby Hamster' },
  speedy: { speed: 1.7, hp: 1, size: 1.0, r: 0.36, tint: [1.0, 0.9, 0.45], contact: 20, label: 'Speedy Hamster' },
  tank: { speed: 0.6, hp: 6, size: 1.5, r: 0.58, tint: [0.8, 0.85, 0.95], contact: 35, label: 'Tank Hamster' },
  sniper: { speed: 0.9, hp: 2, size: HAMSTER_SIZE, r: HAMSTER_R, tint: [0.75, 0.95, 0.75], contact: 25, label: 'Sniper Hamster' },
};
export const KIND_WEIGHTS = [
  { normal: 6, chubby: 2, speedy: 2 },
  { normal: 5, chubby: 3, speedy: 2, tank: 1 },
  { normal: 4, chubby: 3, speedy: 2, tank: 2, sniper: 2 },
];
export const HELMET_HP = 3;
export const SNIPER_RANGE = 20.0;
export const SNIPER_AIM = 1.2;
export const SNIPER_DMG = 30;
export const SNIPER_NUT_SPEED = 32.0;
export const CORPSE_TIME = 0.7;
export const TOTAL_ROUNDS = 4;
export const ROUND_TIME = 90.0;
export const FREEZE_TIME = 15.0;
export const ROUND_END_TIME = 4.0;
export const BOMB_TIME = 45.0;
export const PLANT_TIME = 40.0;
export const DEFUSE_TIME = 5.0;
export const KIT_DEFUSE_TIME = 2.5;
export const DEFUSE_RANGE = 2.0;
export const PLANT_RANGE = 2.6;

export const BARREL_RADIUS = 5.5;
export const BARREL_DMG = 6;
export const BARREL_SELF_RADIUS = 5.0;
export const BARREL_SELF_DMG = 30;
export const BARREL_CHAIN = 0.2;
export const HE_RADIUS = 4.5;
export const HE_DMG = 4;
export const HE_SELF_RADIUS = 3.0;
export const HE_SELF_DMG = 15;
export const NADE_COOLDOWN = 0.8;
export const SMOKE_RADIUS = 5.0;
export const SMOKE_TIME = 12.0;

export const WEAPONS = {
  usp: { name: 'USP-S', slot: 2, rate: 0.18, mag: 12, dmg: 1, spread: 0.012, pellets: 1, reload: 1.1, range: 70.0, pierce: false, kick: 0.012, climb: 0.0, color: [0.25, 0.30, 0.35], length: 0.30, model: 'Pistol' },
  deagle: { name: 'Desert Eagle', slot: 2, rate: 0.45, mag: 7, dmg: 3, spread: 0.008, pellets: 1, reload: 1.4, range: 80.0, pierce: false, kick: 0.045, climb: 0.0, color: [0.85, 0.72, 0.30], length: 0.34, model: 'Pistol', tint: true },
  nova: { name: 'Nova', slot: 1, rate: 0.8, mag: 8, dmg: 1, spread: 0.09, pellets: 6, reload: 2.0, range: 16.0, pierce: false, kick: 0.05, climb: 0.0, color: [0.90, 0.35, 0.20], length: 0.70, model: 'ShotGun' },
  p90: { name: 'P90', slot: 1, rate: 0.065, mag: 50, dmg: 1, spread: 0.035, pellets: 1, reload: 2.2, range: 60.0, pierce: false, kick: 0.006, climb: 0.004, color: [0.35, 0.85, 0.40], length: 0.50, model: 'Gun-AK47', tint: true },
  ak47: { name: 'AK-47', slot: 1, rate: 0.1, mag: 30, dmg: 2, spread: 0.02, pellets: 1, reload: 1.8, range: 100.0, pierce: false, kick: 0.016, climb: 0.009, color: [0.95, 0.60, 0.15], length: 0.75, model: 'Gun-AK47' },
  m4a4: { name: 'M4A4', slot: 1, rate: 0.09, mag: 30, dmg: 2, spread: 0.01, pellets: 1, reload: 1.8, range: 100.0, pierce: false, kick: 0.011, climb: 0.006, color: [0.25, 0.50, 0.95], length: 0.72, model: 'Gun-AK47', tint: true },
  awp: { name: 'AWP', slot: 1, rate: 1.3, mag: 5, dmg: 10, spread: 0.0, pellets: 1, reload: 2.4, range: 150.0, pierce: true, kick: 0.06, climb: 0.0, color: [0.30, 0.90, 0.35], length: 0.95, move: 0.85, model: 'Sniper' },
  negev: { name: 'Negev', slot: 1, rate: 0.075, mag: 150, dmg: 2, spread: 0.06, pellets: 1, reload: 4.5, range: 100.0, pierce: false, kick: 0.008, climb: 0.008, color: [0.38, 0.40, 0.28], length: 0.85, move: 0.8, settle: true, model: 'Gun-AK47', tint: true },
};

export const BUY_MENU = [
  ['Digit1', 'deagle'], ['Digit2', 'nova'], ['Digit3', 'p90'], ['Digit4', 'ak47'],
  ['Digit5', 'm4a4'], ['Digit6', 'awp'], ['Digit7', 'negev'], ['Digit8', 'kevlar'], ['Digit9', 'kit'],
];
export const GEAR = { kevlar: 'Kevlar + Helmet', kit: 'Defuse Kit' };
export const MAP_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'];

export const RANKS = [
  'Silver I (blame the hamsters)',
  'Silver Elite Master',
  'Gold Nova Hamster',
  'Legendary Eagle Master',
  'THE GLOBAL ELITE',
];

export const WEAPON_SOUNDS = {
  usp: ['usp', 0.5], deagle: ['deagle', 0.45], nova: ['nova', 0.5], p90: ['p90', 0.3],
  ak47: ['ak47', 0.35], m4a4: ['m4a4', 0.35], awp: ['awp', 0.6], negev: ['ak47', 0.3, 0.8],
};
export const STREAK_SOUNDS = { 2: 'double_kill', 3: 'triple_kill', 4: 'rampage', 5: 'unstoppable' };
export const STREAK_NAMES = { 2: 'DOUBLE KILL', 3: 'TRIPLE KILL', 4: 'RAMPAGE', 5: 'UNSTOPPABLE' };
