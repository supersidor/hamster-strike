import * as D from './data.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { Net } from './net.js';

const el = (tag, id, parent, cls) => {
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
};

export class Hud {
  constructor(root, assetsBase) {
    this.root = root;
    this.vignette = el('div', 'vignette', root);
    this.scope = el('div', 'scope', root);
    this.cross = el('canvas', 'crosshair', root);
    this.radar = el('canvas', 'radar', root);
    this.radar.width = 260;
    this.radar.height = 260;
    this.radar.style.cssText = 'left:16px;top:16px;width:260px;height:260px';
    this.score = el('div', 'score', root, 'out');
    this.hp = el('div', 'hp', root, 'out');
    this.ammo = el('div', 'ammo', root, 'out');
    this.loadout = el('div', 'loadout', root, 'out');
    this.feed = el('div', 'feed', root, 'out mono');
    this.announce = el('div', 'announce', root, 'out');
    this.callout = el('div', 'callout', root, 'out');
    this.face = el('img', 'face', root);
    this.face.src = `${assetsBase}petro.webp`;
    this.boss = el('div', 'boss', root);
    el('div', null, this.boss, 'back');
    this.bossFill = el('div', null, this.boss, 'fill');
    el('div', null, this.boss, 'name out').textContent = 'THE HAMSTER KING';
    this.banner = el('div', 'banner', root, 'mono');
    this.board = el('div', 'board', root, 'mono out');
    this.spec = el('div', 'spec', root, 'out');
    this.click = el('div', 'click', root, 'out');
    this.click.innerHTML = 'CLICK TO CAPTURE MOUSE<small>ESC frees the mouse</small>';
    this.cctx = this.cross.getContext('2d');
    this.rctx = this.radar.getContext('2d');
    this.radarBuilt = -1;
    this.radarCanvas = null;
    this.last = {};
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cross.width = Math.round(window.innerWidth * dpr);
    this.cross.height = Math.round(window.innerHeight * dpr);
    this.cross.style.cssText = 'left:0;top:0;width:100%;height:100%';
    this.dpr = dpr;
    const ui = Math.max(0.55, Math.min(1.25, Math.min(window.innerWidth / 1280, window.innerHeight / 720)));
    this.root.style.setProperty('--ui', String(ui));
    for (const e of [this.score, this.hp, this.ammo, this.loadout, this.feed, this.announce, this.banner, this.click, this.board, this.spec]) e.style.zoom = String(ui);
    this.callout.style.zoom = String(ui);
    this.boss.style.zoom = String(ui);
    this.radar.style.zoom = String(ui);
    this.face.style.zoom = String(ui);
  }

  setText(key, element, text) {
    if (this.last[key] !== text) {
      this.last[key] = text;
      element.textContent = text;
    }
  }

  setHtml(key, element, html) {
    if (this.last[key] !== html) {
      this.last[key] = html;
      element.innerHTML = html;
    }
  }

  show(element, on, display = 'block') {
    element.style.display = on ? display : 'none';
  }

  mapList() {
    const level = Game.level;
    return level.mapNames.map((name, i) => `[${i + 1}] ${name.padEnd(20)}${i === level.mapIndex ? '<' : ' '}`).join('\n');
  }

  buyMenu() {
    const lines = [`CHOOSE YOUR LOADOUT     ${Game.clock(Game.timer)}`, ''];
    let n = 1;
    for (const [, item] of D.BUY_MENU) {
      let name;
      let owned;
      if (D.WEAPONS[item]) {
        name = D.WEAPONS[item].name;
        owned = Game.primary === item || Game.secondary === item;
      } else {
        name = D.GEAR[item];
        owned = (item === 'kevlar' && Game.armor >= 100) || (item === 'kit' && Game.kit);
      }
      lines.push(`[${n}] ${name.padEnd(18)}${owned ? '<' : ' '}`);
      n++;
    }
    lines.push('');
    const boss = Game.round > D.ROUND_WAVES.length ? '  -  BOMB ROUND: stop the Hamster King!' : '';
    lines.push(`Round ${Game.round}/${D.TOTAL_ROUNDS}${boss}`);
    lines.push(Game.role === 'client' && Game.me.ready ? 'Waiting for the other players...' : 'SPACE - ready');
    return lines.join('\n');
  }

  crew() {
    return [...Game.soldiers].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  }

  crewLines(limit = 8) {
    return this.crew().slice(0, limit).map((s) => `${s === Game.me ? '>' : ' '} ${s.name.padEnd(16)} K ${String(s.kills).padStart(2)}  D ${String(s.deaths).padStart(2)}`).join('\n');
  }

  boardText() {
    const rows = this.crew().map((s) => {
      const hs = s.kills > 0 ? Math.round((100 * s.headshots) / s.kills) : 0;
      const state = s.hp > 0 ? '  ' : 'x ';
      const ping = s === Game.me ? Math.round(Net.rtt) : s.ping;
      return `${s === Game.me ? '>' : ' '}${state}${s.name.padEnd(16)} ${String(s.kills).padStart(3)} ${String(s.deaths).padStart(3)} ${String(hs).padStart(3)}% ${String(s.mvps).padStart(3)} ${String(ping).padStart(4)}ms`;
    });
    return `${'PLAYER'.padEnd(19)} ${'K'.padStart(3)} ${'D'.padStart(3)} ${'HS'.padStart(4)} ${'MVP'.padStart(3)} ${'PING'.padStart(6)}\n${rows.join('\n')}`;
  }

  titleFooter(level) {
    const maps = `1-${level.mapNames.length} choose map`;
    if (Net.state === 'connecting') return 'Connecting to the server...';
    if (Net.state === 'online') {
      const n = Game.soldiers.length;
      const names = this.crew().map((x) => x.name).join(', ');
      const shown = names.length > 64 ? `${names.slice(0, 63)}...` : names;
      return `ONLINE - ${n} player${n === 1 ? '' : 's'}: ${shown}\n${maps}    SPACE - start match    X - leave`;
    }
    const note = Net.notice ? `${Net.notice}\n\n` : '';
    return `${note}${maps}    SPACE - solo    O - play online\nPlaying as ${Net.name || 'Petro'} (N to rename)`;
  }

  bannerText() {
    const level = Game.level;
    switch (Game.phase) {
      case 'title':
        return `COUNTER-HAMSTER 3D\n\n${this.mapList()}\n\nPetro (CT) vs the Hamster-Terrorists\n`
          + `${D.ROUND_WAVES.length} rounds of hamsters, then the Hamster King.\n`
          + 'Hamsters carry a nut bomb to A or B. Defuse it!\n\n'
          + 'WASD move   MOUSE look   LMB shoot   RMB scope (AWP)\n'
          + 'SPACE jump   CTRL / C crouch   SHIFT walk\n'
          + 'R reload   Q switch weapon   1-7 pick any weapon\n'
          + 'G HE grenade   F smoke (unlimited)   E (hold) defuse\n'
          + 'H dog mode   Z bark   X growl   V whine   B howl (dog mode)\n'
          + 'TAB scoreboard (online)   ESC free mouse\n\n'
          + this.titleFooter(level);
      case 'buy':
        return this.buyMenu();
      case 'round_end':
        return `${Game.result}\n\n${Game.reason}\n\nCT ${Game.ct} : ${Game.t} T`;
      case 'match_end': {
        const hs = Game.kills > 0 ? Math.round((100 * Game.headshots) / Game.kills) : 0;
        const verdict = Game.ct > Game.t ? 'VICTORY' : (Game.ct === Game.t ? 'DRAW' : 'DEFEAT');
        return `MATCH OVER - ${verdict}\n\nCT ${Game.ct} : ${Game.t} T\n\n`
          + `K ${Game.kills}   D ${Game.deaths}   HS ${hs}%   MVP x${Game.mvps}\n\n`
          + `Skill group: ${D.RANKS[Math.min(Game.ct, D.RANKS.length - 1)]}\n\n`
          + (Game.role === 'client' ? `${this.crewLines(5)}\n\n` : '')
          + `Next map: ${level.mapName}\n${this.mapList()}\n\n`
          + (Game.role === 'client'
            ? `1-${level.mapNames.length} choose map    SPACE - play again    X - leave`
            : `1-${level.mapNames.length} choose map    SPACE - queue again`);
      }
      default:
        return '';
    }
  }

  update(player, camera) {
    const playing = Game.playing();
    const msg = this.bannerText();
    this.show(this.banner, msg !== '');
    this.setText('banner', this.banner, msg);
    for (const e of [this.score, this.hp, this.ammo, this.loadout, this.feed, this.announce, this.face, this.radar]) this.show(e, playing);
    this.show(this.boss, Game.phase === 'live' && Game.bossAlive);
    this.bossFill.style.width = `${514 * Math.max(0, Math.min(1, Game.bossHp / Game.bossMax))}px`;
    this.show(this.click, playing && !Input.locked && Game.hp > 0);
    const board = Game.role === 'client' && Input.isDown('Tab');
    this.show(this.board, board);
    if (board) this.setText('board', this.board, this.boardText());
    const watching = playing && Net.watching;
    this.show(this.spec, !!watching);
    if (watching) this.setText('spec', this.spec, `SPECTATING ${Net.watching.name}  (click to switch)`);
    const scoped = playing && player.scoped;
    this.show(this.scope, scoped);
    if (scoped) this.scope.style.setProperty('--r', `${Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.46)}px`);
    this.vignette.style.opacity = String(Game.hp > 0 ? (0.35 * Game.hurt) / 0.45 : 0.35);
    this.drawCrosshair(player);
    if (!playing) {
      this.rctx.clearRect(0, 0, 260, 260);
      return;
    }
    let middle;
    if (Game.bombPlanted && Game.phase === 'live') middle = `BOMB ${Game.bombSite}  ${Game.clock(Game.bombTimer)}`;
    else if (Game.phase === 'buy') middle = `LOADOUT  ${Game.clock(Game.timer)}`;
    else middle = Game.clock(Game.timer);
    this.setText('score', this.score, `CT ${Game.ct}    [ ${middle} ]    ${Game.t} T`);
    const armor = Game.armor > 0 ? `    ARMOR ${Game.armor}` : '';
    const kit = Game.kit ? '    KIT' : '';
    this.setText('hp', this.hp, `+ ${Game.hp}${armor}${kit}`);
    this.hp.style.color = Game.hp < 35 ? '#ff5950' : '#fff';
    const spec = D.WEAPONS[Game.current];
    const status = Game.reloading > 0 ? '  reloading...' : '';
    this.setText('ammo', this.ammo, `${spec.name}   ${Game.ammo[Game.current] || 0} / INF${status}`);
    const names = [Game.primary, Game.secondary].filter((w) => w !== '').map((w) => D.WEAPONS[w].name);
    this.setText('loadout', this.loadout, `${names.join('  |  ')}      [1-7] pick weapon   [Q] switch   [G] HE   [F] smoke`);
    this.setText('feed', this.feed, Game.feedLines.map((l) => l[0]).join('\n'));
    const near = Game.bombPlanted && Math.hypot(player.position.x - Game.bombPos.x, player.position.z - Game.bombPos.z) < D.DEFUSE_RANGE;
    let ann;
    if (Game.phase === 'live' && Game.defuse > 0) {
      const need = Game.kit ? D.KIT_DEFUSE_TIME : D.DEFUSE_TIME;
      ann = `DEFUSING  ${Math.floor((100 * Game.defuse) / need)}%`;
    } else if (Game.phase === 'live' && near) {
      ann = 'Hold E to defuse';
    } else {
      ann = Game.announceT > 0 ? Game.announce : '';
    }
    this.setText('announce', this.announce, ann);
    const showCallout = Game.calloutT > 0;
    this.show(this.callout, showCallout);
    if (showCallout) {
      const age = 1.2 - Game.calloutT;
      this.setText('callout', this.callout, Game.callout);
      const k = 1.6 + (1.0 - 1.6) * Math.min(1, age / 0.15);
      this.callout.style.transform = `scale(${k})`;
      this.callout.style.opacity = String(Math.min(1, Game.calloutT / 0.3));
    }
    const t = Game.now();
    const pop = Game.pop > 0 ? Math.sin((Game.pop / 0.15) * Math.PI) * 0.08 : 0;
    this.face.style.transform = `rotate(${Math.sin(t * 2) * 0.05}rad) scale(${1 + pop})`;
    this.face.style.filter = Game.hurt > 0 ? 'sepia(1) saturate(6) hue-rotate(-30deg)' : 'none';
    this.drawRadar(player);
  }

  drawCrosshair(player) {
    const ctx = this.cctx;
    const w = this.cross.width;
    const h = this.cross.height;
    ctx.clearRect(0, 0, w, h);
    if (!Game.playing() || player.scoped || Game.hp <= 0) return;
    const d = this.dpr;
    const cx = w / 2;
    const cy = h / 2;
    const gap = (4 + player.spread * 500) * d;
    const len = 9 * d;
    ctx.lineCap = 'butt';
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1], [0, 1]]) {
      ctx.beginPath();
      ctx.moveTo(cx + dx * gap, cy + dy * gap);
      ctx.lineTo(cx + dx * (gap + len), cy + dy * (gap + len));
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 4 * d;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(102,255,115,0.95)';
      ctx.lineWidth = 2 * d;
      ctx.stroke();
    }
    if (Game.hitmarker > 0) {
      const [r, g, b] = Game.hitColor;
      ctx.strokeStyle = `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${Game.hitmarker / 0.18})`;
      ctx.lineWidth = 2 * d;
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        ctx.beginPath();
        ctx.moveTo(cx + dx * 7 * d, cy + dy * 7 * d);
        ctx.lineTo(cx + dx * 14 * d, cy + dy * 14 * d);
        ctx.stroke();
      }
    }
  }

  buildRadar() {
    const level = Game.level;
    this.radarBuilt = level.mapIndex;
    const c = document.createElement('canvas');
    c.width = level.cols;
    c.height = level.rowCount;
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(level.cols, level.rowCount);
    for (let r = 0; r < level.rowCount; r++) {
      for (let col = 0; col < level.cols; col++) {
        const ch = level.rows[r][col];
        const lift = Math.max(0, Math.min(0.6, level.kind === 'mesh' ? (level.top(col, r) / level.maxTop) * 0.6 : level.top(col, r) / 4));
        let rgba = [0.5 + (1 - 0.5) * lift, 0.5 + (1 - 0.5) * lift, 0.48 + (1 - 0.48) * lift, 0.8];
        if (level.isSlope(col, r)) rgba = [rgba[0] * 0.65 + 0.85 * 0.35, rgba[1] * 0.65 + 0.75 * 0.35, rgba[2] * 0.65 + 0.45 * 0.35, 0.8];
        if (ch === '#') rgba = [0.06, 0.06, 0.08, 0.85];
        else if (ch === 'c' || ch === 'o') rgba = [0.3, 0.28, 0.25, 0.85];
        else if (ch === 'x') rgba = [0.42, 0.4, 0.34, 0.85];
        const k = (r * level.cols + col) * 4;
        img.data[k] = rgba[0] * 255;
        img.data[k + 1] = rgba[1] * 255;
        img.data[k + 2] = rgba[2] * 255;
        img.data[k + 3] = rgba[3] * 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    this.radarCanvas = c;
  }

  drawRadar(player) {
    const level = Game.level;
    if (this.radarBuilt !== level.mapIndex) this.buildRadar();
    const ctx = this.rctx;
    ctx.clearRect(0, 0, 260, 260);
    const scale = Math.min(260 / level.cols, 260 / level.rowCount);
    const aw = level.cols * scale;
    const ah = level.rowCount * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.radarCanvas, 0, 0, aw, ah);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, aw - 2, ah - 2);
    const px = (p) => [((p.x + level.width / 2) / level.tile) * scale, ((p.z + level.depth / 2) / level.tile) * scale];
    ctx.font = 'bold 18px Menlo, monospace';
    ctx.fillStyle = '#ff9933';
    for (const [label, p] of level.bombSites) {
      const [x, y] = px(p);
      ctx.fillText(label, x - 6, y + 6);
    }
    const me = player.position;
    const dot = (p, r, color) => {
      const [x, y] = px(p);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };
    for (const h of Game.world.hamsters) {
      if (Math.hypot(h.position.x - me.x, h.position.y - me.y, h.position.z - me.z) < 25 || h.carrier) dot(h.position, 3.5, h.carrier ? '#ff9919' : '#ff3333');
    }
    for (const k of Game.world.kings) dot(k.position, 7, '#ffd91a');
    for (const s of Game.soldiers) if (s !== Game.me && s.hp > 0) dot(s.position, 4.5, '#6fe38a');
    if (Game.bombPlanted && Math.floor(Game.now() * 4) % 2 === 0) {
      const [x, y] = px(Game.bombPos);
      ctx.fillStyle = '#ff1a1a';
      ctx.fillRect(x - 4, y - 4, 8, 8);
    }
    const [x, y] = px(me);
    const fx = -Math.sin(player.yaw);
    const fy = -Math.cos(player.yaw);
    const sx = fy;
    const sy = -fx;
    ctx.beginPath();
    ctx.moveTo(x + fx * 9, y + fy * 9);
    ctx.lineTo(x - fx * 5 + sx * 5, y - fy * 5 + sy * 5);
    ctx.lineTo(x - fx * 5 - sx * 5, y - fy * 5 - sy * 5);
    ctx.closePath();
    ctx.fillStyle = '#4dccff';
    ctx.fill();
  }
}
