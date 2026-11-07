#!/usr/bin/env node
// Run the whole app locally:  node scripts/dev-server.mjs   →  http://localhost:8787
// Uses an in-memory database seeded with a demo ground:
//   customer:  /demo
//   owner:     /owner   phone 9847012345  PIN 1234
//   helper:    /helper  phone 9946055321  PIN 1111   (added by the seed)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LocalD1, migrate } from './local.mjs';
import { handleApi } from '../src/worker.js';
import { hashPin } from '../src/lib/util.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 8787);

export async function makeEnv({ seed = true } = {}) {
  const DB = new LocalD1(':memory:');
  migrate(DB, root);
  if (seed) {
    const sql = execFileSync(process.execPath, [
      path.join(root, 'scripts/new-ground.mjs'),
      '--slug', 'demo', '--name', 'Green Field Turf', '--area', 'Edappally, Kochi',
      '--maps', 'https://maps.google.com/?q=Edappally+Kochi', '--upi', 'greenfieldturf@ybl', '--upi-name', 'Green Field Turf',
      '--owner', 'Rajesh', '--phone', '9847012345', '--pin', '1234', '--full', '1200,1500', '--half', '700,900',
      '--facilities', 'Floodlights,Parking,Drinking water,Changing room', '--open', '6', '--close', '24',
    ]).toString();
    DB.db.exec(sql);
    DB.db.exec(`INSERT INTO staff (ground_id, role, name, phone, pin_hash, created_at)
      VALUES (1, 'helper', 'Manoj', '9946055321', '${await hashPin('1111')}', ${Date.now()})`);
  }
  return { DB };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };

export function createServer(env) {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname.startsWith('/api/')) {
      const hasBody = !['GET', 'HEAD'].includes(req.method);
      const request = new Request(url, {
        method: req.method,
        headers: { ...req.headers, 'cf-connecting-ip': req.socket.remoteAddress || '' },
        body: hasBody ? Readable.toWeb(req) : undefined,
        duplex: hasBody ? 'half' : undefined,
      });
      const r = await handleApi(request, env);
      const headers = {};
      r.headers.forEach((v, k) => (headers[k] = v));
      res.writeHead(r.status, headers);
      res.end(Buffer.from(await r.arrayBuffer()));
      return;
    }
    let file = path.join(root, 'public', decodeURIComponent(url.pathname));
    if (!file.startsWith(path.join(root, 'public')) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(root, 'public', 'index.html');
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(fs.readFileSync(file));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const env = await makeEnv();
  createServer(env).listen(port, () => console.log(`GoArena running at http://localhost:${port}  (customer: /demo, owner: /owner, helper: /helper)`));
}
