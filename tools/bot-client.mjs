import { WebSocket } from 'ws';

const url = process.argv[2] || 'ws://localhost:8080/ws';
const name = process.argv[3] || 'Bot';
const seconds = Number(process.argv[4]) || 120;
const weapon = process.argv[5] || 'ak47';
const autostart = process.argv[6] === 'autostart';

const ws = new WebSocket(url);
const hamsters = new Map();
const kings = new Map();
let me = null;
let pos = null;
let phase = 'title';
let log = { kills: 0, hits: 0, phases: new Set(), events: 0 };
let alive = true;

const send = (m) => ws.readyState === 1 && ws.send(JSON.stringify(m));

ws.on('open', () => send({ t: 'hello', name }));
ws.on('message', (data) => {
  const m = JSON.parse(data.toString());
  if (m.t === 'welcome') {
    me = m.id;
    pos = m.you.slice(1, 4);
    for (const h of m.hs) hamsters.set(h.id, { x: h.p[0], z: h.p[2] });
    console.log(`joined as ${m.you[18]} (id ${me})`);
    return;
  }
  for (const e of m.e || []) {
    log.events++;
    if (e.t === 'place') pos = e.p;
    if (e.t === 'hs') hamsters.set(e.id, { x: e.p[0], z: e.p[2] });
    if (e.t === 'hd') { hamsters.delete(e.id); }
    if (e.t === 'ks') kings.set(e.id, { x: e.p[0], z: e.p[2] });
    if (e.t === 'kd') kings.delete(e.id);
    if (e.t === 'clear') { hamsters.clear(); kings.clear(); }
    if (e.t === 'fb' && e.kill) log.kills++;
  }
  if (m.s) {
    phase = m.s.ph;
    log.phases.add(phase);
    for (const row of m.s.h) hamsters.set(row[0], { x: row[1], z: row[3] });
    for (const row of m.s.k) kings.set(row[0], { x: row[1], z: row[3] });
    const mine = m.s.s.find((r) => r[0] === me);
    if (mine) alive = mine[8] > 0;
  }
});
ws.on('close', () => { console.log('closed', JSON.stringify({ ...log, phases: [...log.phases] })); process.exit(0); });

setInterval(() => {
  if (!pos) return;
  send({ t: 's', x: pos[0], y: pos[1], z: pos[2], yw: 0.3, pt: 0, cr: 0, w: weapon, df: 0, pg: 20 });
  if (autostart && (phase === 'title' || phase === 'match_end')) send({ t: 'start' });
  if (phase === 'buy') send({ t: 'ready' });
}, 100);

setInterval(() => {
  if (phase !== 'live' || !alive || !pos) return;
  let best = null;
  let bd = 1e9;
  for (const [id, h] of hamsters) {
    const d = Math.hypot(h.x - pos[0], h.z - pos[2]);
    if (d < bd) { bd = d; best = id; }
  }
  if (best !== null && bd < 14) { send({ t: 'hit', id: best, w: weapon, hs: Math.random() < 0.3 ? 1 : 0, d: [1, 0, 0] }); log.hits++; }
  for (const id of kings.keys()) send({ t: 'hit', k: 1, id, w: weapon, hs: 0 });
}, 250);

setTimeout(() => ws.close(), seconds * 1000);
