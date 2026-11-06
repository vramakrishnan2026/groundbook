// Local stand-in for Cloudflare D1 (SQLite via node:sqlite),
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

export function migrate(d1, root) {
  const dir = path.join(root, 'migrations');
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) d1.db.exec(fs.readFileSync(path.join(dir, f), 'utf8'));
}
