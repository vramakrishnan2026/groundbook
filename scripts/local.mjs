// Local stand-ins for Cloudflare D1 (SQLite via node:sqlite) and R2 (a folder on disk),
// so the Worker can be run and tested without a Cloudflare account.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const norm = (params) => params.map((p) => (p === undefined ? null : typeof p === 'boolean' ? Number(p) : p));
const plain = (r) => (r ? { ...r } : null);

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.db, this.sql, norm(params));
  }
  _run() {
    const st = this.db.prepare(this.sql);
    if (/^\s*(SELECT|WITH)/i.test(this.sql)) return { results: st.all(...this.params).map(plain), success: true, meta: {} };
    const r = st.run(...this.params);
    return { results: [], success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async first(col) {
    const r = plain(this.db.prepare(this.sql).get(...this.params));
    return r && col ? r[col] : r;
  }
  async all() {
    return this._run();
  }
  async run() {
    return this._run();
  }
}

export class LocalD1 {
  constructor(file = ':memory:') {
    this.db = new DatabaseSync(file);
  }
  prepare(sql) {
    return new Statement(this.db, sql);
  }
  async batch(stmts) {
    this.db.exec('BEGIN');
    try {
      const out = stmts.map((s) => s._run());
      this.db.exec('COMMIT');
      return out;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  async exec(sql) {
    this.db.exec(sql);
  }
}

export class LocalR2 {
  constructor(dir) {
    this.dir = dir;
    fs.mkdirSync(dir, { recursive: true });
  }
  _p(key) {
    return path.join(this.dir, encodeURIComponent(key));
  }
  async put(key, data, opts = {}) {
    fs.writeFileSync(this._p(key), Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data));
    fs.writeFileSync(this._p(key) + '.meta', JSON.stringify(opts.httpMetadata || {}));
  }
  async get(key) {
    if (!fs.existsSync(this._p(key))) return null;
    return { body: fs.readFileSync(this._p(key)), httpMetadata: JSON.parse(fs.readFileSync(this._p(key) + '.meta', 'utf8')) };
  }
  async delete(key) {
    for (const f of [this._p(key), this._p(key) + '.meta']) if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

export function migrate(d1, root) {
  const dir = path.join(root, 'migrations');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) d1.db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
}
