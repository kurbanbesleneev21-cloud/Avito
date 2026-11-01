'use strict';

const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  number          TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'new',
  services        TEXT NOT NULL,
  project_name    TEXT NOT NULL,
  description     TEXT NOT NULL,
  features        TEXT NOT NULL DEFAULT '',
  references_text TEXT NOT NULL DEFAULT '',
  deadline        TEXT NOT NULL,
  budget          TEXT NOT NULL,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL,
  phone           TEXT NOT NULL,
  telegram        TEXT NOT NULL DEFAULT '',
  contact_method  TEXT NOT NULL,
  admin_note      TEXT NOT NULL DEFAULT '',
  search_text     TEXT NOT NULL DEFAULT '',
  ip_hash         TEXT NOT NULL DEFAULT '',
  user_agent      TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stored_name   TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_files_order ON order_files(order_id);

CREATE TABLE IF NOT EXISTS order_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  changed_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_history_order ON order_history(order_id);
`;

const ORDER_COLUMNS = [
  'number', 'status', 'services', 'project_name', 'description', 'features',
  'references_text', 'deadline', 'budget', 'name', 'email', 'phone', 'telegram',
  'contact_method', 'search_text', 'ip_hash', 'user_agent', 'created_at', 'updated_at',
];

const SORTS = {
  newest: 'created_at DESC, id DESC',
  oldest: 'created_at ASC, id ASC',
};

function rowToOrder(row) {
  if (!row) return null;
  const { search_text, ip_hash, user_agent, ...rest } = { ...row };
  return { ...rest, services: JSON.parse(row.services) };
}

function createSqliteStore(dataDir) {
  const db = new DatabaseSync(path.join(dataDir, 'codeforge.sqlite'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);

  const insertOrder = db.prepare(
    `INSERT INTO orders (${ORDER_COLUMNS.join(', ')}) VALUES (${ORDER_COLUMNS.map(() => '?').join(', ')})`
  );
  const insertFile = db.prepare(
    'INSERT INTO order_files (order_id, stored_name, original_name, mime, size, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const insertHistory = db.prepare(
    'INSERT INTO order_history (order_id, from_status, to_status, changed_at) VALUES (?, ?, ?, ?)'
  );

  function buildWhere({ q, status, service, budget }) {
    const clauses = [];
    const params = [];
    if (q) { clauses.push('search_text LIKE ?'); params.push(`%${q.toLowerCase()}%`); }
    if (status) { clauses.push('status = ?'); params.push(status); }
    if (service) { clauses.push('services LIKE ?'); params.push(`%"${service}"%`); }
    if (budget) { clauses.push('budget = ?'); params.push(budget); }
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  return {
    kind: 'sqlite',

    async createOrder(order, files) {
      const now = new Date().toISOString();
      db.exec('BEGIN');
      try {
        const values = ORDER_COLUMNS.map((c) => {
          if (c === 'services') return JSON.stringify(order.services);
          if (c === 'created_at' || c === 'updated_at') return now;
          if (c === 'status') return 'new';
          return order[c] ?? '';
        });
        const { lastInsertRowid } = insertOrder.run(...values);
        const id = Number(lastInsertRowid);
        for (const f of files) insertFile.run(id, f.storedName, f.originalName, f.mime, f.size, now);
        insertHistory.run(id, null, 'new', now);
        db.exec('COMMIT');
        return { id, number: order.number, created_at: now };
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },

    async numberExists(number) {
      return !!db.prepare('SELECT 1 FROM orders WHERE number = ?').get(number);
    },

    async listOrders({ q, status, service, budget, sort = 'newest', limit = 20, offset = 0 }) {
      const { where, params } = buildWhere({ q, status, service, budget });
      const total = db.prepare(`SELECT COUNT(*) AS n FROM orders ${where}`).get(...params).n;
      const rows = db
        .prepare(
          `SELECT o.*, (SELECT COUNT(*) FROM order_files f WHERE f.order_id = o.id) AS files_count
           FROM orders o ${where} ORDER BY ${SORTS[sort] || SORTS.newest} LIMIT ? OFFSET ?`
        )
        .all(...params, limit, offset);
      return { total: Number(total), items: rows.map(rowToOrder) };
    },

    async getOrder(id) {
      const order = rowToOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(id));
      if (!order) return null;
      order.files = db
        .prepare('SELECT id, original_name, mime, size, created_at FROM order_files WHERE order_id = ? ORDER BY id')
        .all(id).map((r) => ({ ...r }));
      order.history = db
        .prepare('SELECT from_status, to_status, changed_at FROM order_history WHERE order_id = ? ORDER BY id')
        .all(id).map((r) => ({ ...r }));
      return order;
    },

    async updateOrder(id, { status, admin_note }) {
      const current = db.prepare('SELECT status FROM orders WHERE id = ?').get(id);
      if (!current) return null;
      const now = new Date().toISOString();
      db.exec('BEGIN');
      try {
        if (status && status !== current.status) {
          db.prepare('UPDATE orders SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
          insertHistory.run(id, current.status, status, now);
        }
        if (typeof admin_note === 'string') {
          db.prepare('UPDATE orders SET admin_note = ?, updated_at = ? WHERE id = ?').run(admin_note, now, id);
        }
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return this.getOrder(id);
    },

    async getFile(orderId, fileId) {
      const row = db
        .prepare('SELECT * FROM order_files WHERE id = ? AND order_id = ?')
        .get(fileId, orderId);
      return row ? { ...row } : null;
    },

    async stats() {
      const rows = db.prepare('SELECT status, COUNT(*) AS n FROM orders GROUP BY status').all();
      const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
      const since = new Date(Date.now() - 7 * 864e5).toISOString();
      const lastWeek = db.prepare('SELECT COUNT(*) AS n FROM orders WHERE created_at >= ?').get(since).n;
      return { byStatus, lastWeek: Number(lastWeek) };
    },

    async close() { db.close(); },
  };
}

module.exports = { createSqliteStore };
