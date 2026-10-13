import * as D from './data.js';
import { Audio } from './audio.js';
import { Soldier } from './soldier.js';
import { flatDist, pick, randf, randi } from './util.js';

const GO = new Set(['Space', 'Enter', 'NumpadEnter']);
const MINE = ['hp', 'armor', 'kit', 'kills', 'deaths', 'headshots', 'mvps', 'roundKills', 'streak', 'streakT', 'hurt', 'defuse'];

class GameState {
  constructor() {
    this.role = 'solo';
    this.authority = true;
    this.visual = true;
    this.sink = null;
    this.out = null;
    this.me = new Soldier(0, 'Petro');
    this.soldiers = [this.me];
    this.nextSoldier = 1;
    this.world = null;
    this.level = null;
    this.player = null;
    this.phase = 'title';
    this.resetMatchStats();
    this.timer = D.FREEZE_TIME;
    this.fuses = new Map();
    this.fuseOwner = new Map();
    this.flow = new Int32Array(0);
    this.kingChase = this.flow;
    this.flowKey = '';
    this.siteFlow = new Int32Array(0);
    this.kingFlow = new Int32Array(0);
    this.targetSite = ['A', null];
    this.resetRoundVars();
  }

  setRole(role) {
    this.role = role;
    this.authority = role !== 'client';
    this.visual = role !== 'server';
  }

  emit(msg) {
    if (this.sink) this.sink.all(msg);
  }

  emitTo(s, msg) {
    if (this.sink) this.sink.to(s, msg);
  }

  send(msg) {
    if (this.out) this.out(msg);
  }

  feedback(s, msg) {
    if (this.role === 'server') this.emitTo(s, { t: 'fb', ...msg });
    else if (s === this.me) this.applyFeedback(msg);
  }

  applyFeedback(msg) {
    switch (msg.k) {
      case 'hit': {
        this.hitmarker = 0.18;
        this.hitColor = msg.c;
        if (!msg.kill) {
          Audio.play('hit', 0.5);
          break;
        }
        Audio.play('squeak', 0.5);
        if (D.STREAK_SOUNDS[msg.streak] || msg.streak > 5) {
          Audio.play(D.STREAK_SOUNDS[msg.streak] || 'unstoppable', 0.8);
          this.callout = D.STREAK_NAMES[msg.streak] || 'UNSTOPPABLE';
          this.calloutT = 1.2;
        }
        if (msg.hs) {
          Audio.play('headshot', 0.7);
          if (this.player) this.player.fovKick = 4.0;
        }
        if (msg.hum) {
          Audio.play('humiliation', 0.8);
          this.say('HUMILIATION', 1.5);
        }
        break;
      }
      case 'hurt':
        this.hurt = 0.45;
        Audio.play('hurt', 0.5);
        if (msg.low) Audio.play('oh_boy', 0.8);
        if (msg.dead) {
          Audio.play('humiliation', 0.8);
          this.primary = '';
          this.current = 'usp';
          this.secondary = 'usp';
          this.ammo = {};
          this.armor = 0;
          this.kit = false;
        }
        break;
      default:
        break;
    }
  }

  addShake(v) {
    this.shake = Math.max(this.shake, v);
    this.emit({ t: 'shake', v });
  }

  resetMatchStats() {
    this.round = 0;
    this.ct = 0;
    this.t = 0;
    for (const s of this.soldiers) s.resetMatch();
    this.primary = '';
    this.secondary = 'usp';
    this.current = 'usp';
    this.ammo = {};
  }

  resetRoundVars() {
    for (const s of this.soldiers) s.resetRound();
    this.toSpawn = 0;
    this.alive = 0;
    this.spawnTimer = 0;
    this.reloading = 0;
    this.pop = 0;
    this.hitmarker = 0;
    this.hitColor = [1, 1, 1];
    this.callout = '';
    this.calloutT = 0;
    this.shake = 0;
    this.bossMax = D.BOSS_HP;
    this.bossHp = D.BOSS_HP;
    this.bossAlive = false;
    this.plantTimer = 0;
    this.bombPlanted = false;
    this.bombTimer = D.BOMB_TIME;
    this.bombPos = null;
    this.bombSite = '';
    this.needCarrier = false;
    this.carriers = 0;
    this.feedLines = [];
    this.announce = '';
    this.announceT = 0;
    this.result = '';
    this.reason = '';
    this.beep = 0;
    this.bombWarned = false;
  }

  attach(world) {
    this.world = world;
    this.level = world.level;
    this.player = world.player;
    if (this.player) this.me.position = this.player.position;
    world.loadMap(0);
    this.resetRoundState();
  }

  addSoldier(name) {
    const s = new Soldier(this.nextSoldier++, name);
    this.soldiers.push(s);
    return s;
  }

  removeSoldier(s) {
    const i = this.soldiers.indexOf(s);
    if (i >= 0) this.soldiers.splice(i, 1);
    if (this.phase === 'live' && this.authority && this.soldiers.length > 0 && !this.soldiers.some((x) => x.hp > 0)) {
      this.endRound('T', 'All Petros were eliminated');
    }
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
    this.emit({ t: 'newmatch' });
    Audio.play('accept', 0.7);
    this.startFreeze();
  }

  toTitle() {
    this.world.clearTemps();
    this.phase = 'title';
    this.resetMatchStats();
    this.resetRoundState();
  }

  resetRoundState() {
    const level = this.level;
    this.resetRoundVars();
    this.timer = D.FREEZE_TIME;
    this.fuses = new Map();
    this.fuseOwner = new Map();
    this.world.resetBarrels();
    this.siteFlow = new Int32Array(0);
    this.kingFlow = new Int32Array(0);
    this.targetSite = level.bombSites[0];
    if (this.authority) {
      this.world.placeSoldiers();
      this.rebuildFlow(true);
    }
  }

  rebuildFlow(force = false) {
    const level = this.level;
    const tiles = [];
    for (const s of this.soldiers) {
      if (s.hp <= 0 && !force) continue;
      const tile = level.tileAt(s.position.x, s.position.z);
      if (level.inside(tile[0], tile[1])) tiles.push(tile);
    }
    if (tiles.length === 0) {
      if (!force) return;
      tiles.push(level.tileAt(level.playerStart.x, level.playerStart.z));
    }
    const key = tiles.map((tile) => tile[1] * level.cols + tile[0]).sort((a, b) => a - b).join(',');
    if (!force && key === this.flowKey) return;
    this.flowKey = key;
    this.flow = level.flowFieldMulti(tiles);
    this.kingChase = level.kingLinks ? level.flowFieldMulti(tiles, level.kingLinks) : this.flow;
  }

  say(text, seconds = 2.5) {
    this.announce = text;
    this.announceT = seconds;
    this.emit({ t: 'say', text, sec: seconds });
  }

  feed(text) {
    this.feedLines.push([text, 6.0]);
    while (this.feedLines.length > 5) this.feedLines.shift();
    this.emit({ t: 'feed', text });
  }

  ensureAmmo(weapon) {
    if (weapon !== '' && !(weapon in this.ammo)) this.ammo[weapon] = D.WEAPONS[weapon].mag;
  }

  countKill(s) {
    s.kills++;
    s.roundKills++;
    s.streak = s.streakT > 0 ? s.streak + 1 : 1;
    s.streakT = 2.5;
    return s.streak;
  }

  startFreeze() {
    this.round++;
    this.emit({ t: 'freeze', round: this.round });
    this.resetRoundState();
    this.phase = 'buy';
    this.timer = D.FREEZE_TIME;
    this.ensureAmmo(this.secondary);
    this.ensureAmmo(this.primary);
    if (this.primary !== '') this.current = this.primary;
    if (this.round > 1) Audio.play('ready', 0.6);
  }

  rebuildSiteFlows() {
    const level = this.level;
    const [sc, sr] = level.tileAt(this.targetSite[1].x, this.targetSite[1].z);
    this.siteFlow = level.flowField(sc, sr);
    this.kingFlow = level.kingLinks ? level.flowField(sc, sr, level.kingLinks) : this.siteFlow;
  }

  startLive() {
    const level = this.level;
    this.phase = 'live';
    for (const s of this.soldiers) s.roundKills = 0;
    this.targetSite = pick(level.bombSites);
    this.rebuildSiteFlows();
    const crew = Math.max(1, this.soldiers.filter((s) => s.hp > 0).length);
    if (this.round <= D.ROUND_WAVES.length) {
      this.timer = D.ROUND_TIME;
      this.toSpawn = Math.round(D.ROUND_WAVES[this.round - 1] * (1 + D.COOP_WAVE * (crew - 1)));
      this.spawnTimer = 0.8;
      this.needCarrier = true;
      this.say('GO GO GO!');
      Audio.play(pick(['go_go_go', 'lets_go']), 0.8);
    } else {
      this.timer = D.PLANT_TIME + D.BOMB_TIME;
      this.plantTimer = D.PLANT_TIME;
      this.bossAlive = true;
      this.bossMax = Math.round(D.BOSS_HP * (1 + D.COOP_BOSS * (crew - 1)));
      this.bossHp = this.bossMax;
      this.world.spawnKing();
      Audio.play('boss_roar', 0.9);
      Audio.play('prepare', 0.8);
      this.say(`The Hamster King is going for bombsite ${this.targetSite[0]}! Stop him!`, 3.0);
    }
    this.emit({ t: 'live', site: this.targetSite[0], bossMax: this.bossMax });
  }

  switchMap(index) {
    this.world.clearTemps();
    this.world.loadMap(index);
    this.emit({ t: 'map', i: index });
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
      Audio.play(this.soldiers.every((s) => !s.played || s.hp === 100) ? 'bish_bash_bosh' : 'ct_win', 0.8);
      for (const s of this.soldiers) if (s.roundKills > 0) s.mvps++;
    } else {
      this.t++;
      this.result = 'HAMSTER-TERRORISTS WIN';
      Audio.play('t_win', 0.8);
    }
    this.emit({ t: 'rend', result: this.result, reason: why, ct: this.ct, tt: this.t });
  }

  hurtSoldier(s, dmg, killer) {
    if (s.hurt > 0 || s.hp <= 0 || !this.active()) return;
    if (s.armor > 0) {
      const absorbed = Math.min(s.armor, Math.floor(dmg / 2));
      s.armor -= absorbed;
      dmg -= absorbed;
    }
    s.hp -= dmg;
    s.hurt = 0.45;
    const fb = { k: 'hurt' };
    if (s.hp > 0 && s.hp < 35 && !s.lowHpSaid) {
      s.lowHpSaid = true;
      fb.low = true;
    }
    if (s.hp <= 0) {
      s.hp = 0;
      s.deaths++;
      fb.dead = true;
      this.feed(`${killer}  [nut]  ${s.name}`);
      s.armor = 0;
      s.kit = false;
    }
    this.feedback(s, fb);
    if (s.hp <= 0 && !this.soldiers.some((x) => x.hp > 0)) {
      const crew = this.soldiers.filter((x) => x.played).length;
      this.endRound('T', crew > 1 ? 'All Petros were eliminated' : `${s.name} was eliminated`);
    }
  }

  hurtPlayer(dmg, killer) {
    this.hurtSoldier(this.me, dmg, killer);
  }

  hurtAround(pos, radius, dmg, killer) {
    for (const s of this.soldiers) {
      if (s.hp > 0 && flatDist(s.position, pos) < radius && Math.abs(s.position.y - pos.y) < radius) this.hurtSoldier(s, dmg, killer);
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
    this.send({ t: 'buy', item });
    Audio.play('affirmative', 0.7);
    this.say(`Picked ${gear}`, 1.5);
  }

  damageHamster(h, dmg, weapon, headshot, impulse = null, shooter = this.me) {
    if (h.dead) return false;
    let color = [1, 1, 1];
    if (headshot && h.helmet) {
      h.knockHelmet(dmg);
      this.emit({ t: 'hm', id: h.id, d: dmg });
      headshot = false;
      color = [0.6, 0.6, 0.6];
    }
    h.hp -= dmg * (headshot ? 2 : 1);
    if (h.hp > 0) {
      h.flash = 0.25;
      this.emit({ t: 'hh', id: h.id });
      this.feedback(shooter, { k: 'hit', c: color });
      return false;
    }
    const pos = h.position.clone();
    const label = h.label;
    const size = h.size;
    h.die(impulse);
    this.emit({ t: 'hd', id: h.id, imp: impulse ? [impulse.x, impulse.y, impulse.z] : null, hs: headshot ? 1 : 0 });
    const streak = this.countKill(shooter);
    this.feed(`${shooter.name}  [${weapon}]${headshot ? '  (HS)' : ''}  ${label}`);
    const fb = { k: 'hit', c: [1.0, 0.25, 0.25], kill: true, streak, hs: headshot };
    if (headshot) {
      shooter.headshots++;
      if (this.visual) this.world.floatText(pos.clone().add({ x: 0, y: size + 0.3, z: 0 }), 'HEADSHOT', [1.0, 0.3, 0.3]);
    }
    const spec = D.WEAPONS[shooter.weapon];
    if (shooter.crouch && spec && spec.slot === 2 && weapon === spec.name) fb.hum = true;
    this.feedback(shooter, fb);
    if (this.round <= D.ROUND_WAVES.length && this.toSpawn === 0 && this.world.hamsters.length === 0) {
      Audio.play('enemy_down', 0.8);
    }
    return true;
  }

  hitKing(k, dmg, weapon, headshot, shooter = this.me) {
    if (this.bossHp <= 0) return;
    this.bossHp -= dmg * (headshot ? 2 : 1);
    k.flash = 0.15;
    this.emit({ t: 'kh', id: k.id });
    if (this.bossHp > 0) {
      this.feedback(shooter, { k: 'hit', c: [1, 1, 1] });
      return;
    }
    this.bossAlive = false;
    const streak = this.countKill(shooter);
    Audio.play('thats_how', 0.9);
    this.feed(`${shooter.name}  [${weapon}]${headshot ? '  (HS)' : ''}  Hamster King`);
    if (headshot) shooter.headshots++;
    if (this.visual) this.world.floatText({ x: k.position.x, y: k.position.y + 5.0, z: k.position.z }, 'THE KING IS DEAD', [1.0, 0.85, 0.2], 140);
    if (this.bombPlanted) this.say('Now defuse the bomb! (hold E)', 4.0);
    this.feedback(shooter, { k: 'hit', c: [1.0, 0.25, 0.25], kill: true, streak, hs: false });
    this.emit({ t: 'kd', id: k.id });
    k.die();
  }

  blast(pos, weapon, radius, dmg, bossRadius, bossDmg, shooter = this.me) {
    for (const h of [...this.world.hamsters]) {
      if (!h.dead && flatDist(h.position, pos) <= radius && Math.abs(h.position.y - pos.y) < radius) {
        let ox = h.position.x - pos.x;
        let oz = h.position.z - pos.z;
        const len = Math.hypot(ox, oz) || 1;
        ox /= len;
        oz /= len;
        this.damageHamster(h, dmg, weapon, false, { x: ox * 9, y: 5, z: oz * 9 }, shooter);
      }
    }
    for (const k of [...this.world.kings]) {
      if (flatDist(k.position, pos) < bossRadius) this.hitKing(k, bossDmg, weapon, false, shooter);
    }
    for (const cell of this.level.touching(pos, radius, 'o')) this.ignite(cell, D.BARREL_CHAIN, shooter);
  }

  ignite(cell, delay = 0, by = this.me) {
    const key = cell[1] * this.level.cols + cell[0];
    if (this.level.grid[cell[1]][cell[0]] === 'o' && !this.fuses.has(key)) {
      this.fuses.set(key, delay);
      this.fuseOwner.set(key, by);
    }
  }

  target(pos) {
    let best = null;
    let bestD = Infinity;
    for (const s of this.soldiers) {
      if (s.hp <= 0) continue;
      const d = flatDist(s.position, pos);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best || this.me;
  }

  playerPos() {
    return this.me.position;
  }

  playerEye() {
    return this.player ? this.player.eyePosition() : this.me.eyePosition();
  }

  clearLine(a, b) {
    return this.world.collision.clear(a, b);
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

  defused(by = this.me) {
    this.feed(by.kit ? `${by.name}  [defuse kit]  Nut Bomb` : `${by.name}  [bare hands]  Nut Bomb`);
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
          if (this.role === 'client') {
            this.send({ t: 'map', i });
          } else {
            this.switchMap(i);
            Audio.play('pickup', 0.6);
          }
        }
      }
      if (go) {
        if (this.role === 'client') this.send({ t: 'start' });
        else this.newMatch();
      }
      return;
    }
    if (this.phase === 'buy') {
      for (const [key, item] of D.BUY_MENU) if (code === key) this.tryBuy(item);
      if (go) {
        if (this.role === 'client') {
          if (!this.me.ready) {
            this.me.ready = true;
            this.send({ t: 'ready' });
            this.say('Waiting for the other players...', 2.0);
          }
        } else {
          this.startLive();
        }
      }
      return;
    }
    if (this.phase === 'live') {
      for (const [key, item] of D.BUY_MENU) if (code === key && D.WEAPONS[item]) this.tryBuy(item);
    }
  }

  command(s, msg) {
    switch (msg.t) {
      case 'map':
        if ((this.phase === 'title' || this.phase === 'match_end') && Number.isInteger(msg.i) && msg.i >= 0 && msg.i < this.level.maps.length && msg.i !== this.level.mapIndex) {
          this.switchMap(msg.i);
        }
        break;
      case 'start':
        if (this.phase === 'title' || this.phase === 'match_end') this.newMatch();
        break;
      case 'ready':
        if (this.phase === 'buy' && s.hp > 0) s.ready = true;
        break;
      case 'buy':
        if (this.phase === 'buy' || this.phase === 'live') {
          if (msg.item === 'kevlar') s.armor = 100;
          else if (msg.item === 'kit') s.kit = true;
        }
        break;
      default:
        break;
    }
  }

  update(dt) {
    if (!this.world) return;
    this.pop = Math.max(0, this.pop - dt);
    this.hitmarker = Math.max(0, this.hitmarker - dt);
    this.calloutT = Math.max(0, this.calloutT - dt);
    this.shake = Math.max(0, this.shake - dt);
    this.announceT = Math.max(0, this.announceT - dt);
    for (const s of this.soldiers) {
      s.hurt = Math.max(0, s.hurt - dt);
      s.streakT = Math.max(0, s.streakT - dt);
    }
    for (const item of this.feedLines) item[1] -= dt;
    this.feedLines = this.feedLines.filter((item) => item[1] > 0);
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        this.ammo[this.current] = D.WEAPONS[this.current].mag;
        Audio.play('reload_done', 0.85);
      }
    }
    if (!this.authority) {
      if (this.phase !== 'title' && this.phase !== 'match_end') this.timer = Math.max(0, this.timer - dt);
      if (this.bombPlanted) this.bombTimer = Math.max(0, this.bombTimer - dt);
      return;
    }
    if (this.playing()) this.rebuildFlow();
    switch (this.phase) {
      case 'buy':
        this.timer -= dt;
        if (this.timer <= 0 || (this.role === 'server' && this.allReady())) this.startLive();
        break;
      case 'round_end':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.world.clearTemps();
          this.emit({ t: 'clear' });
          if (this.round >= D.TOTAL_ROUNDS) {
            this.phase = 'match_end';
            this.emit({ t: 'mend' });
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

  allReady() {
    const crew = this.soldiers.filter((s) => s.played);
    return crew.length > 0 && crew.every((s) => s.ready || s.hp <= 0);
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
    if (this.role === 'server') this.updateDefuse(dt);
    if (this.phase !== 'live') return;
    this.updateBomb(dt);
    if (this.phase !== 'live') return;
    if (this.round <= D.ROUND_WAVES.length && !this.bombPlanted) {
      if (this.toSpawn === 0 && this.alive === 0) this.endRound('CT', 'All hamsters eliminated');
      else if (this.timer <= 0) this.endRound('T', 'Time ran out - the hamsters own the site');
    }
  }

  updateDefuse(dt) {
    for (const s of this.soldiers) {
      const near = this.bombPlanted && s.hp > 0 && s.defusing && flatDist(s.position, this.bombPos) < D.DEFUSE_RANGE;
      if (!near) {
        s.defuse = 0;
        continue;
      }
      s.defuse += dt;
      if (s.defuse >= (s.kit ? D.KIT_DEFUSE_TIME : D.DEFUSE_TIME)) {
        this.defused(s);
        return;
      }
    }
  }

  spawn(dt) {
    if (this.toSpawn <= 0) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const level = this.level;
    const speed = (95.0 + this.round * 25.0 + randf(0, 40)) * D.SPEED_SCALE;
    const spitEvery = 5.0 - this.round * 0.8;
    const crew = this.soldiers.filter((s) => s.hp > 0);
    const nearest = (p) => crew.reduce((m, s) => Math.min(m, flatDist(p, s.position)), Infinity);
    const far = level.spawnPoints.filter((p) => nearest(p) > D.SPAWN_SAFE_DIST);
    let at;
    if (far.length === 0) {
      const sorted = [...level.spawnPoints].sort((a, b) => nearest(b) - nearest(a));
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
      this.addShake(0.9);
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
    const owners = ready.map((key) => this.fuseOwner.get(key) || this.me);
    for (const key of ready) this.fuseOwner.delete(key);
    const cells = ready.map((key) => [key % level.cols, Math.floor(key / level.cols)]);
    for (const cell of cells) {
      this.world.removeBarrel(cell);
      this.emit({ t: 'bx', c: cell[0], r: cell[1] });
    }
    cells.forEach((cell, i) => {
      const pos = level.tileCenter(cell[0], cell[1]);
      this.world.decal({ x: pos.x, y: pos.y + 0.05, z: pos.z }, { x: 0, y: 1, z: 0 }, 3.2);
      this.world.explosionFx(pos, 1.3);
      Audio.playAt('explosion', 0.9, { x: pos.x, y: pos.y + 1, z: pos.z });
      this.addShake(0.5);
      this.blast(pos, 'Oil Barrel', D.BARREL_RADIUS, D.BARREL_DMG, D.BARREL_RADIUS + 1.0, 10, owners[i]);
      this.hurtAround(pos, D.BARREL_SELF_RADIUS, D.BARREL_SELF_DMG, 'an oil barrel');
    });
    this.rebuildFlow(true);
    if (this.siteFlow.length > 0) this.rebuildSiteFlows();
  }

  clock(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
}

for (const key of MINE) {
  Object.defineProperty(GameState.prototype, key, {
    get() {
      return this.me[key];
    },
    set(value) {
      this.me[key] = value;
    },
  });
}

export const Game = new GameState();
