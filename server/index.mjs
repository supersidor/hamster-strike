import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Room, cleanName } from './room.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const port = Number(process.env.PORT) || 8080;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.wav': 'audio/wav',
  '.glb': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

function serve(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let file = path.normalize(path.join(dist, decodeURIComponent(url.pathname)));
  if (!file.startsWith(dist)) {
    res.writeHead(403).end();
    return;
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(dist, 'index.html');
  const ext = path.extname(file);
  const headers = { 'Content-Type': TYPES[ext] || 'application/octet-stream' };
  if (file.includes(`${path.sep}assets${path.sep}`)) headers['Cache-Control'] = 'public, max-age=31536000, immutable';
  else if (file.endsWith('index.html')) headers['Cache-Control'] = 'no-cache';
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(serve);
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
const room = new Room();
room.start();

server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, 'http://localhost').pathname !== '/ws') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws));
});

wss.on('connection', (ws) => {
  if (wss.clients.size > 64) {
    ws.close();
    return;
  }
  const client = {
    ws,
    soldier: null,
    send: (text) => {
      if (ws.readyState === 1) ws.send(text);
    },
  };
  const hello = setTimeout(() => ws.close(), 10000);
  let alive = true;
  ws.on('pong', () => { alive = true; });
  const beat = setInterval(() => {
    if (!alive) {
      ws.terminate();
      return;
    }
    alive = false;
    ws.ping();
  }, 20000);
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    const text = data.toString();
    if (!client.soldier) {
      let m;
      try {
        m = JSON.parse(text);
      } catch {
        return;
      }
      if (!m || m.t !== 'hello') return;
      clearTimeout(hello);
      if (!room.join(client, cleanName(m.name, 'Petro'))) {
        ws.send(JSON.stringify({ e: [{ t: 'full' }] }));
        ws.close();
      }
      return;
    }
    room.message(client, text);
  });
  ws.on('close', () => {
    clearTimeout(hello);
    clearInterval(beat);
    room.leave(client);
  });
  ws.on('error', () => ws.terminate());
});

server.listen(port, () => console.log(`hamster-strike listening on :${port}`));
