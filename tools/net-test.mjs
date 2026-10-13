import { Room } from '../server/room.mjs';

let failed = 0;
const fail = (m) => { failed++; console.error('FAIL:', m); };
const eq = (cond, msg) => { if (!cond) fail(msg); };

let clock = 0;
const room = new Room(() => clock);
const STEP_MS = 1000 / 120 + 0.01;
const level = room.world.level;

function makeClient(name) {
  const c = {
    name, inbox: [], ws: { bufferedAmount: 0 }, soldier: null, hamsters: new Map(), pos: null, snap: null, phases: new Set(), kinds: new Set(), you: null, id: 0,
    send(text) {
      const m = JSON.parse(text);
      this.inbox.push(m);
      if (m.t === 'welcome') {
        this.id = m.id;
        this.you = m.you;
        for (const h of m.hs) this.hamsters.set(h.id, { x: h.p[0], z: h.p[2] });
      }
      for (const e of m.e || []) {
        if (e.t === 'place') this.pos = e.p;
        if (e.t === 'hs') this.hamsters.set(e.id, { x: e.p[0], z: e.p[2] });
        if (e.t === 'hd') this.hamsters.delete(e.id);
        if (e.t === 'freeze') this.phases.add('buy');
        if (e.t === 'live') this.phases.add('live');
        if (e.t === 'rend') this.phases.add('round_end');
        if (e.t === 'ks') this.kinds.add('king');
      }
      if (m.s) {
        this.snap = m.s;
        this.phases.add(m.s.ph);
        for (const row of m.s.h) this.hamsters.set(row[0], { x: row[1], z: row[3] });
        for (const row of m.s.k) this.kings = true;
      }
    },
  };
  return c;
}

function runMatch(label, clients, seconds) {
  let t = 0;
  const startPhase = room.Game.phase;
  while (t < seconds && room.Game.phase !== 'match_end') {
    clock += STEP_MS;
    t += STEP_MS / 1000;
    for (const c of clients) {
      if (!c.soldier || !c.pos) continue;
      const phase = room.Game.phase;
      if (Math.floor(t * 10) % 3 === 0) {
        room.message(c, JSON.stringify({ t: 's', x: c.pos[0], y: c.pos[1], z: c.pos[2], yw: 0.5, pt: 0, cr: 0, w: 'ak47', df: room.Game.bombPlanted ? 1 : 0, dg: c.name === 'A' ? 1 : 0 }));
      }
      if (phase === 'buy') room.message(c, JSON.stringify({ t: 'ready' }));
      if (phase === 'live' && Math.floor(t * 120) % 20 === 0) {
        let best = null;
        let bd = 1e9;
        for (const [id, h] of c.hamsters) {
          const d = Math.hypot(h.x - c.pos[0], h.z - c.pos[2]);
          if (d < bd) { bd = d; best = id; }
        }
        if (best !== null && bd < 14) room.message(c, JSON.stringify({ t: 'hit', id: best, w: 'ak47', hs: 0, d: [1, 0, 0] }));
        if (room.world.kings.length) room.message(c, JSON.stringify({ t: 'hit', id: room.world.kings[0].id, k: 1, w: 'awp', hs: 0 }));
      }
    }
    room.tick();
  }
  return t;
}

for (let map = 0; map < level.maps.length; map++) {
  room.Game.switchMap(map);
  const a = makeClient('A');
  const b = makeClient('B');
  eq(room.join(a, 'Alice'), `${label(map)} A joins`);
  eq(room.join(b, 'Bob'), `${label(map)} B joins`);
  eq(room.Game.soldiers.length === 2, `${label(map)} two soldiers`);
  eq(a.inbox[0].t === 'welcome' && a.inbox[0].map === map, `${label(map)} welcome has the map`);
  room.message(a, JSON.stringify({ t: 'start' }));
  room.tick();
  eq(room.Game.phase === 'buy', `${label(map)} start moves to buy`);
  const secs = runMatch(label(map), [a, b], 60 * 12);
  eq(room.Game.phase === 'match_end', `${label(map)} reached match_end (phase ${room.Game.phase}, round ${room.Game.round}, ${secs.toFixed(0)}s)`);
  for (const ph of ['buy', 'live', 'round_end']) eq(a.phases.has(ph), `${label(map)} saw phase ${ph}`);
  eq(a.kinds.has('king'), `${label(map)} king round happened`);
  const rowOf = (c, id) => c.snap.s.find((r) => r[0] === id);
  eq(rowOf(b, a.id)[19] === 1, `${label(map)} B sees A as a dog`);
  eq(rowOf(a, b.id)[19] === 0, `${label(map)} A does not see B as a dog`);
  const scored = room.Game.soldiers.reduce((n, s) => n + s.kills, 0);
  eq(scored > 0, `${label(map)} players got kills`);
  console.log(`net ok: ${level.mapName} ${secs.toFixed(0)}s CT ${room.Game.ct}:${room.Game.t} kills ${scored}`);
  room.leave(a);
  room.leave(b);
  eq(room.Game.phase === 'title', `${label(map)} empty room goes back to title`);
}

function label(map) {
  return `map ${map}`;
}

room.Game.switchMap(0);
const p1 = makeClient('P1');
room.join(p1, 'One');
room.message(p1, JSON.stringify({ t: 'start' }));
room.tick();
room.message(p1, JSON.stringify({ t: 'ready' }));
for (let i = 0; i < 300; i++) { clock += STEP_MS; room.tick(); }
eq(room.Game.phase === 'live', 'solo player in the room goes live when ready');
const late = makeClient('Late');
room.join(late, '<b>Late</b>');
eq(late.soldier.hp === 100 && late.soldier.played, 'a player joining mid-round plays right away');
const lateGap = Math.hypot(late.soldier.position.x - p1.soldier.position.x, late.soldier.position.z - p1.soldier.position.z);
eq(lateGap < 4 && Math.abs(late.soldier.position.y - p1.soldier.position.y) < 0.5, `a late joiner spawns next to a teammate on the same level (gap ${lateGap.toFixed(1)}, dy ${(late.soldier.position.y - p1.soldier.position.y).toFixed(2)})`);
eq(late.soldier.name === 'bLate/b' || !/[<>]/.test(late.soldier.name), 'names are sanitised');
eq(late.inbox[0].t === 'welcome' && late.inbox[0].hs.length > 0, 'late joiner gets the live hamsters');
room.message(p1, '{"t":"s","x":"boom"}');
room.message(p1, 'not json');
room.message(p1, JSON.stringify({ t: 'hit', id: 1, w: 'nuke' }));
room.message(p1, JSON.stringify({ t: 'nade', p: [0, 0, 0], v: [999, 0, 0], sm: 0 }));
for (let i = 0; i < 50; i++) { clock += STEP_MS; room.tick(); }
const clients = Array.from({ length: 10 }, (_, i) => makeClient(`F${i}`));
const joined = clients.filter((c) => room.join(c, `F${i(c)}`)).length;
function i(c) { return c.name; }
eq(joined <= 6, `room caps at ${8} players (joined ${joined} more)`);

room.stop();
if (failed) {
  console.error(`${failed} net check(s) failed`);
  process.exit(1);
}
console.log('NET PASS');
process.exit(0);
