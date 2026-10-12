import * as D from './data.js';
import { Audio } from './audio.js';
import { flatDist, pick, randf, randi } from './util.js';

const GO = new Set(['Space', 'Enter', 'NumpadEnter']);

class GameState {
  constructor() {
    this.world = null;
    this.level = null;
    this.player = null;
    this.collision = null;
    this.phase = 'title';
    this.resetMatchStats();
    this.hp = 100;
    this.timer = D.FREEZE_TIME;
    this.fuses = new Map();
    this.flow = new Int32Array(0);
    this.flowTile = [-1, -1];
    this.siteFlow = new Int32Array(0);
    this.targetSite = ['A', null];
    this.resetRoundVars();
  }

  resetMatchStats() {
    this.round = 0;
    this.ct = 0;
    this.t = 0;
    this.kills = 0;
    this.deaths = 0;
    this.headshots = 0;
    this.mvps = 0;
    this.roundKills = 0;
    this.primary = '';
    this.secondary = 'usp';
    this.current = 'usp';
    this.ammo = {};
    this.armor = 0;
    this.kit = false;
    this.streak = 0;
    this.streakT = 0;
  }

  resetRoundVars() {
    this.hp = 100;
    this.toSpawn = 0;
    this.alive = 0;
    this.spawnTimer = 0;
    this.reloading = 0;
    this.hurt = 0;
    this.pop = 0;
    this.hitmarker = 0;
    this.hitColor = [1, 1, 1];
    this.callout = '';
    this.calloutT = 0;
    this.shake = 0;
    this.bossHp = D.BOSS_HP;
    this.bossAlive = false;
    this.plantTimer = 0;
    this.bombPlanted = false;
    this.bombTimer = D.BOMB_TIME;
    this.bombPos = null;
    this.bombSite = '';
    this.needCarrier = false;
    this.carriers = 0;
    this.defuse = 0;
    this.feedLines = [];
    this.announce = '';
    this.announceT = 0;
    this.result = '';
    this.reason = '';
    this.beep = 0;
    this.bombWarned = false;
    this.lowHpSaid = false;
  }

  attach(world) {
    this.world = world;
    this.level = world.level;
    this.player = world.player;
    this.collision = world.collision;
    world.loadMap(0);
    this.resetRoundState();
  }

  now() {
    return performance.now() / 1000;
  }

  active() {
    return this.phase === 'live';
  }

  playing() {
    return this.phase === 'buy' || this.phase === 'live' || this.phase === 'round_end';
  }

  newMatch() {
    this.resetMatchStats();
    this.world.clearTemps();
    Audio.play('accept', 0.7);
    this.startFreeze();
  }

  resetRoundState() {
    const level = this.level;
    this.resetRoundVars();
    this.timer = D.FREEZE_TIME;
    this.fuses = new Map();
    this.world.resetBarrels();
    this.flowTile = level.tileAt(level.playerStart.x, level.playerStart.z);
    this.flow = level.flowField(this.flowTile[0], this.flowTile[1]);
    this.siteFlow = new Int32Array(0);
    this.targetSite = level.bombSites[0];
    this.world.placePlayer();
  }

  say(text, seconds = 2.5) {
    this.announce = text;
    this.announceT = seconds;
  }

  feed(text) {
    this.feedLines.push([text, 6.0]);
    while (this.feedLines.length > 5) this.feedLines.shift();
  }

  ensureAmmo(weapon) {
    if (weapon !== '' && !(weapon in this.ammo)) this.ammo[weapon] = D.WEAPONS[weapon].mag;
  }

  countKill() {
    this.kills++;
    this.roundKills++;
    this.streak = this.streakT > 0 ? this.streak + 1 : 1;
    this.streakT = 2.5;
    Audio.play('squeak', 0.5);
    if (D.STREAK_SOUNDS[this.streak] || this.streak > 5) {
      Audio.play(D.STREAK_SOUNDS[this.streak] || 'unstoppable', 0.8);
      this.callout = D.STREAK_NAMES[this.streak] || 'UNSTOPPABLE';
      this.calloutT = 1.2;
    }
  }

  startFreeze() {
    this.round++;
    this.resetRoundState();
    this.phase = 'buy';
    this.timer = D.FREEZE_TIME;
    this.ensureAmmo(this.secondary);
    this.ensureAmmo(this.primary);
    if (this.primary !== '') this.current = this.primary;
    if (this.round > 1) Audio.play('ready', 0.6);
  }

  startLive() {
    const level = this.level;
    this.phase = 'live';
    this.roundKills = 0;
    this.targetSite = pick(level.bombSites);
    const [sc, sr] = level.tileAt(this.targetSite[1].x, this.targetSite[1].z);
    this.siteFlow = level.flowField(sc, sr);
    if (this.round <= D.ROUND_WAVES.length) {
      this.timer = D.ROUND_TIME;
      this.toSpawn = D.ROUND_WAVES[this.round - 1];
      this.spawnTimer = 0.8;
      this.needCarrier = true;
      this.say('GO GO GO!');
      Audio.play(pick(['go_go_go', 'lets_go']), 0.8);
    } else {
      this.timer = D.PLANT_TIME + D.BOMB_TIME;
      this.plantTimer = D.PLANT_TIME;
      this.bossAlive = true;
      this.world.spawnKing();
      Audio.play('boss_roar', 0.9);
      Audio.play('prepare', 0.8);
      this.say(`The Hamster King is going for bombsite ${this.targetSite[0]}! Stop him!`, 3.0);
    }
  }

  switchMap(index) {
    this.world.clearTemps();
    this.world.loadMap(index);
    this.resetRoundState();
  }

  endRound(winner, why) {
    if (this.phase !== 'live') return;
    this.phase = 'round_end';
    this.timer = D.ROUND_END_TIME;
    this.reason = why;
    if (winner === 'CT') {
      this.ct++;
      this.result = 'COUNTER-TERRORISTS WIN';
      Audio.play(this.hp === 100 ? 'bish_bash_bosh' : 'ct_win', 0.8);
      if (this.roundKills > 0) this.mvps++;
    } else {
      this.t++;
      this.result = 'HAMSTER-TERRORISTS WIN';
      Audio.play('t_win', 0.8);
    }
  }

  hurtPlayer(dmg, killer) {
    if (this.hurt > 0 || !this.active()) return;
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, Math.floor(dmg / 2));
      this.armor -= absorbed;
      dmg -= absorbed;
    }
    this.hp -= dmg;
    this.hurt = 0.45;
    Audio.play('hurt', 0.5);
    if (this.hp > 0 && this.hp < 35 && !this.lowHpSaid) {
      this.lowHpSaid = true;
      Audio.play('oh_boy', 0.8);
    }
    if (this.hp <= 0) {
      this.hp = 0;
      Audio.play('humiliation', 0.8);
      this.deaths++;
      this.feed(`${killer}  [nut]  Petro`);
      this.primary = '';
      this.current = 'usp';
      this.secondary = 'usp';
      this.ammo = {};
      this.armor = 0;
      this.kit = false;
      this.endRound('T', 'Petro was eliminated');
    }
  }

  tryBuy(item) {
    const spec = D.WEAPONS[item];
    if (spec) {
      if (this.current === item) {
        this.say(`${spec.name} already in your hands`, 1.2);
        return;
      }
      const owned = spec.slot === 1 ? this.primary === item : this.secondary === item;
      if (owned) {
        this.current = item;
        this.reloading = 0;
        this.say(spec.name, 1.0);
        return;
      }
      delete this.ammo[item];
      this.ensureAmmo(item);
      if (spec.slot === 1) this.primary = item;
      else this.secondary = item;
      this.current = item;
      this.reloading = 0;
      Audio.play('pickup', 0.7);
      this.say(`Picked ${spec.name}`, 1.5);
      return;
    }
    const gear = D.GEAR[item];
    if ((item === 'kevlar' && this.armor >= 100) || (item === 'kit' && this.kit)) {
      Audio.play('denied', 0.7);
      this.say(`You can't carry more ${gear}`);
      return;
    }
    if (item === 'kevlar') this.armor = 100;
    else this.kit = true;
    Audio.play('affirmative', 0.7);
    this.say(`Picked ${gear}`, 1.5);
  }

  damageHamster(h, dmg, weapon, headshot, impulse = null) {
    if (h.dead) return false;
    this.hitmarker = 0.18;
    this.hitColor = [1, 1, 1];
    if (headshot && h.helmet) {
      h.knockHelmet(dmg);
      headshot = false;
      this.hitColor = [0.6, 0.6, 0.6];
    }
    h.hp -= dmg * (headshot ? 2 : 1);
    if (h.hp > 0) {
      h.flash = 0.25;
      Audio.play('hit', 0.5);
      return false;
    }
    this.hitColor = [1.0, 0.25, 0.25];
    const pos = h.position.clone();
    h.die(impulse);
    this.countKill();
    this.feed(`Petro  [${weapon}]${headshot ? '  (HS)' : ''}  ${h.label}`);
    if (headshot) {
      this.headshots++;
      Audio.play('headshot', 0.7);
      this.world.floatText(pos.clone().add({ x: 0, y: h.size + 0.3, z: 0 }), 'HEADSHOT', [1.0, 0.3, 0.3]);
      this.player.fovKick = 4.0;
    }
    const spec = D.WEAPONS[this.current];
    if (this.player.crouching && spec && spec.slot === 2 && weapon === spec.name) {
      Audio.play('humiliation', 0.8);
      this.say('HUMILIATION', 1.5);
    }
    if (this.round <= D.ROUND_WAVES.length && this.toSpawn === 0 && this.world.hamsters.length === 0) {
      Audio.play('enemy_down', 0.8);
    }
    return true;
  }

  hitKing(k, dmg, weapon, headshot) {
    if (this.bossHp <= 0) return;
    this.bossHp -= dmg * (headshot ? 2 : 1);
    k.flash = 0.15;
    this.hitmarker = 0.18;
    Audio.play('hit', 0.5);
    if (this.bossHp > 0) return;
    this.bossAlive = false;
    this.countKill();
    Audio.play('thats_how', 0.9);
    this.feed(`Petro  [${weapon}]${headshot ? '  (HS)' : ''}  Hamster King`);
    if (headshot) this.headshots++;
    this.world.floatText({ x: k.position.x, y: k.position.y + 5.0, z: k.position.z }, 'THE KING IS DEAD', [1.0, 0.85, 0.2], 140);
    if (this.bombPlanted) this.say('Now defuse the bomb! (hold E)', 4.0);
    k.die();
  }

  blast(pos, weapon, radius, dmg, bossRadius, bossDmg) {
    for (const h of [...this.world.hamsters]) {
      if (!h.dead && flatDist(h.position, pos) <= radius && Math.abs(h.position.y - pos.y) < radius) {
        let ox = h.position.x - pos.x;
        let oz = h.position.z - pos.z;
        const len = Math.hypot(ox, oz) || 1;
        ox /= len;
        oz /= len;
        this.damageHamster(h, dmg, weapon, false, { x: ox * 9, y: 5, z: oz * 9 });
      }
    }
    for (const k of [...this.world.kings]) {
      if (flatDist(k.position, pos) < bossRadius) this.hitKing(k, bossDmg, weapon, false);
    }
    for (const cell of this.level.touching(pos, radius, 'o')) this.ignite(cell, D.BARREL_CHAIN);
  }

  ignite(cell, delay = 0) {
    const key = cell[1] * this.level.cols + cell[0];
    if (this.level.grid[cell[1]][cell[0]] === 'o' && !this.fuses.has(key)) this.fuses.set(key, delay);
  }

  playerPos() {
    return this.player.position;
  }

  playerEye() {
    return this.player.eyePosition();
  }

  clearLine(a, b) {
    return this.collision.clear(a, b);
  }

  smoked(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const length = dx * dx + dy * dy + dz * dz;
    for (const s of this.world.smokes) {
      const center = s.center();
      const r = s.radius;
      const k = length === 0 ? 0 : Math.min(1, Math.max(0, ((center.x - a.x) * dx + (center.y - a.y) * dy + (center.z - a.z) * dz) / length));
      const px = a.x + dx * k - center.x;
      const py = a.y + dy * k - center.y;
      const pz = a.z + dz * k - center.z;
      if (px * px + py * py + pz * pz < r * r) return true;
    }
    return false;
  }

  plantBomb() {
    this.bombPlanted = true;
    this.bombSite = this.targetSite[0];
    this.bombPos = this.targetSite[1].clone();
    this.bombTimer = D.BOMB_TIME;
    this.world.spawnBomb(this.bombPos);
    Audio.play('bomb_planted', 0.9);
    this.say(`The bomb has been planted at ${this.bombSite}!`, 3.0);
  }

  defused() {
    this.feed(this.kit ? 'Petro  [defuse kit]  Nut Bomb' : 'Petro  [bare hands]  Nut Bomb');
    Audio.play('bomb_defused', 0.9);
    this.say('Bomb has been defused.', 3.0);
    this.endRound('CT', 'Bomb has been defused');
  }

  onKey(code) {
    if (!this.world) return;
    const go = GO.has(code);
    if (this.phase === 'title' || this.phase === 'match_end') {
      const n = Math.min(D.MAP_KEYS.length, this.level.maps.length);
      for (let i = 0; i < n; i++) {
        if (code === D.MAP_KEYS[i] && i !== this.level.mapIndex) {
          this.switchMap(i);
          Audio.play('pickup', 0.6);
        }
      }
      if (go) this.newMatch();
      return;
    }
    if (this.phase === 'buy') {
      for (const [key, item] of D.BUY_MENU) if (code === key) this.tryBuy(item);
      if (go) this.startLive();
      return;
    }
    if (this.phase === 'live') {
      for (const [key, item] of D.BUY_MENU) if (code === key && D.WEAPONS[item]) this.tryBuy(item);
    }
  }

  update(dt) {
    if (!this.world) return;
    this.hurt = Math.max(0, this.hurt - dt);
    this.pop = Math.max(0, this.pop - dt);
    this.hitmarker = Math.max(0, this.hitmarker - dt);
    this.calloutT = Math.max(0, this.calloutT - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.streakT = Math.max(0, this.streakT - dt);
    this.announceT = Math.max(0, this.announceT - dt);
    for (const item of this.feedLines) item[1] -= dt;
    this.feedLines = this.feedLines.filter((item) => item[1] > 0);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.ammo[this.current] = D.WEAPONS[this.current].mag;
        Audio.play('reload_done', 0.85);
      }
    }
    switch (this.phase) {
      case 'buy':
        this.timer -= dt;
        if (this.timer <= 0) this.startLive();
        break;
      case 'round_end':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.world.clearTemps();
          if (this.round >= D.TOTAL_ROUNDS) {
            this.phase = 'match_end';
            if (this.ct > this.t) {
              Audio.play('easy_peasy', 0.8);
              this.switchMap((this.level.mapIndex + 1) % this.level.maps.length);
            }
          } else {
            this.startFreeze();
          }
        }
        break;
      case 'live':
        this.live(dt);
        break;
      default:
        break;
    }
  }

  live(dt) {
    this.timer -= dt;
    this.updateFuses(dt);
    if (this.phase !== 'live') return;
    this.spawn(dt);
    const hamsters = this.world.hamsters;
    this.alive = hamsters.length;
    let carrying = 0;
    for (const h of hamsters) if (h.carrier) carrying++;
    if (this.round <= D.ROUND_WAVES.length && !this.bombPlanted && carrying === 0) this.needCarrier = true;
    this.updateBomb(dt);
    if (this.phase !== 'live') return;
    if (this.round <= D.ROUND_WAVES.length && !this.bombPlanted) {
      if (this.toSpawn === 0 && this.alive === 0) this.endRound('CT', 'All hamsters eliminated');
      else if (this.timer <= 0) this.endRound('T', 'Time ran out - the hamsters own the site');
    }
  }

  spawn(dt) {
    if (this.toSpawn <= 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const level = this.level;
    const speed = (95.0 + this.round * 25.0 + randf(0, 40)) * D.SPEED_SCALE;
    const spitEvery = 5.0 - this.round * 0.8;
    const me = this.playerPos();
    const far = level.spawnPoints.filter((p) => flatDist(p, me) > D.SPAWN_SAFE_DIST);
    let at;
    if (far.length === 0) {
      const sorted = [...level.spawnPoints].sort((a, b) => flatDist(b, me) - flatDist(a, me));
      at = sorted[0].clone();
    } else {
      at = pick(far).clone();
    }
    const kind = this.rollKind();
    at.x += randf(-0.3, 0.3);
    at.z += randf(-0.3, 0.3);
    this.world.spawnHamster(at, speed, spitEvery, kind);
    if (kind === 'tank') Audio.play('oh_boy', 0.6);
    this.world.burst({ x: at.x, y: at.y + 0.6, z: at.z }, [[0.95, 0.85, 0.7], [1.0, 0.7, 0.75]], 12, 3.0, 0.12);
    this.toSpawn--;
    this.spawnTimer = Math.max(0.5, 1.4 - this.round * 0.25);
  }

  rollKind() {
    const weights = D.KIND_WEIGHTS[Math.min(D.KIND_WEIGHTS.length - 1, Math.max(0, this.round - 1))];
    let total = 0;
    for (const k in weights) total += weights[k];
    let roll = randi(0, total - 1);
    for (const k in weights) {
      roll -= weights[k];
      if (roll < 0) return k;
    }
    return 'normal';
  }

  updateBomb(dt) {
    if (!this.bombPlanted) {
      if (this.round <= D.ROUND_WAVES.length) return;
      if (!this.bossAlive) {
        this.say('The Hamster King never made it to the site!', 3.0);
        this.endRound('CT', 'The Hamster King was eliminated before planting');
        return;
      }
      this.plantTimer -= dt;
      let arrived = false;
      for (const k of this.world.kings) {
        if (flatDist(k.position, this.targetSite[1]) < D.PLANT_RANGE + 1.0) arrived = true;
      }
      if (arrived || this.plantTimer <= 0) this.plantBomb();
      return;
    }
    this.bombTimer -= dt;
    if (this.bombTimer < 10 && !this.bombWarned) {
      this.bombWarned = true;
      Audio.play('get_out', 0.8);
    }
    const rate = this.bombTimer > 10 ? 2.0 : (this.bombTimer > 3 ? 5.0 : 12.0);
    const tick = Math.floor(this.now() * rate);
    if (tick % 2 === 0 && tick !== this.beep) {
      Audio.playAt('c4_beep', 0.5, { x: this.bombPos.x, y: this.bombPos.y + 0.3, z: this.bombPos.z });
    }
    this.beep = tick;
    if (this.bombTimer <= 0) {
      this.world.explosionFx(this.bombPos, 3.0);
      Audio.play('c4_explosion', 1.0);
      this.shake = 0.9;
      this.feed(`Nut Bomb  [kaboom]  ${this.level.mapName}`);
      this.endRound('T', 'Target bombed');
    }
  }

  updateFuses(dt) {
    if (this.fuses.size === 0) return;
    const level = this.level;
    const ready = [];
    for (const [key, left] of [...this.fuses]) {
      const next = left - dt;
      if (next <= 0) {
        ready.push(key);
        this.fuses.delete(key);
      } else {
        this.fuses.set(key, next);
      }
    }
    if (ready.length === 0) return;
    const cells = ready.map((key) => [key % level.cols, Math.floor(key / level.cols)]);
    for (const cell of cells) this.world.removeBarrel(cell);
    for (const cell of cells) {
      const pos = level.tileCenter(cell[0], cell[1]);
      this.world.decal({ x: pos.x, y: pos.y + 0.05, z: pos.z }, { x: 0, y: 1, z: 0 }, 3.2);
      this.world.explosionFx(pos, 1.3);
      Audio.playAt('explosion', 0.9, { x: pos.x, y: pos.y + 1, z: pos.z });
      this.shake = Math.max(this.shake, 0.5);
      this.blast(pos, 'Oil Barrel', D.BARREL_RADIUS, D.BARREL_DMG, D.BARREL_RADIUS + 1.0, 10);
      const pp = this.playerPos();
      if (this.active() && flatDist(pp, pos) < D.BARREL_SELF_RADIUS && Math.abs(pp.y - pos.y) < D.BARREL_SELF_RADIUS) {
        this.hurtPlayer(D.BARREL_SELF_DMG, 'an oil barrel');
      }
    }
    this.flow = level.flowField(this.flowTile[0], this.flowTile[1]);
    if (this.siteFlow.length > 0) {
      const [sc, sr] = level.tileAt(this.targetSite[1].x, this.targetSite[1].z);
      this.siteFlow = level.flowField(sc, sr);
    }
  }

  clock(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}

export const Game = new GameState();
