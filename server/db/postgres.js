'use strict';

// PostgreSQL / Supabase adapter. Same interface as the SQLite store.
// Supabase: use the project's Postgres connection string as DATABASE_URL.

const { Pool } = require('pg');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orders (
  id              BIGSERIAL PRIMARY KEY,
  number          TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'new',
  services        JSONB NOT NULL,
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
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_status  ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);

CREATE TABLE IF NOT EXISTS order_files (
  id            BIGSERIAL PRIMARY KEY,
  order_id      BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stored_name   TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime          TEXT NOT NULL,
  size          INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_files_order ON order_files(order_id);

CREATE TABLE IF NOT EXISTS order_history (
  id          BIGSERIAL PRIMARY KEY,
  order_id    BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_order ON order_history(order_id);
`;

const ORDER_COLUMNS = [
  'number', 'services', 'project_name', 'description', 'features', 'references_text',
  'deadline', 'budget', 'name', 'email', 'phone', 'telegram', 'contact_method',
  'search_text', 'ip_hash', 'user_agent',
];

const SORTS = {
  newest: 'created_at DESC, id DESC',
  oldest: 'created_at ASC, id ASC',
};

const iso = (v) => (v instanceof Date ? v.toISOString() : v);

function rowToOrder(row) {
  if (!row) return null;
  const { search_text, ip_hash, user_agent, ...rest } = row;
  return {
    ...rest,
    id: Number(row.id),
    files_count: row.files_count !== undefined ? Number(row.files_count) : undefined,
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  };
}

async function createPostgresStore(connectionString) {
  const needsSsl = /supabase\.(co|com)|sslmode=require/.test(connectionString);
  const pool = new Pool({
    connectionString,
    max: 10,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
  await pool.query(SCHEMA);

  function buildWhere({ q, status, service, budget }) {
    const clauses = [];
    const params = [];
    const p = (v) => { params.push(v); return `$${params.length}`; };
    if (q) clauses.push(`search_text LIKE ${p(`%${q.toLowerCase()}%`)}`);
    if (status) clauses.push(`status = ${p(status)}`);
    if (service) clauses.push(`services ? ${p(service)}`);
    if (budget) clauses.push(`budget = ${p(budget)}`);
    return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  return {
    kind: 'postgres',

    async createOrder(order, files) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const values = ORDER_COLUMNS.map((c) => (c === 'services' ? JSON.stringify(order.services) : order[c] ?? ''));
        const { rows } = await client.query(
          `INSERT INTO orders (${ORDER_COLUMNS.join(', ')})
           VALUES (${ORDER_COLUMNS.map((_, i) => `$${i + 1}`).join(', ')})
           RETURNING id, number, created_at`,
          values
        );
        const id = rows[0].id;
        for (const f of files) {
          await client.query(
            'INSERT INTO order_files (order_id, stored_name, original_name, mime, size) VALUES ($1, $2, $3, $4, $5)',
            [id, f.storedName, f.originalName, f.mime, f.size]
          );
        }
        await client.query('INSERT INTO order_history (order_id, from_status, to_status) VALUES ($1, NULL, $2)', [id, 'new']);
        await client.query('COMMIT');
        return { id: Number(id), number: rows[0].number, created_at: iso(rows[0].created_at) };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
    },

    async numberExists(number) {
      const { rowCount } = await pool.query('SELECT 1 FROM orders WHERE number = $1', [number]);
      return rowCount > 0;
    },

    async listOrders({ q, status, service, budget, sort = 'newest', limit = 20, offset = 0 }) {
      const { where, params } = buildWhere({ q, status, service, budget });
      const total = await pool.query(`SELECT COUNT(*)::int AS n FROM orders ${where}`, params);
      const { rows } = await pool.query(
        `SELECT o.*, (SELECT COUNT(*) FROM order_files f WHERE f.order_id = o.id)::int AS files_count
         FROM orders o ${where} ORDER BY ${SORTS[sort] || SORTS.newest}
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );
      return { total: total.rows[0].n, items: rows.map(rowToOrder) };
    },

    async getOrder(id) {
      const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
      const order = rowToOrder(rows[0]);
      if (!order) return null;
      const files = await pool.query(
        'SELECT id, original_name, mime, size, created_at FROM order_files WHERE order_id = $1 ORDER BY id', [id]
      );
      const history = await pool.query(
        'SELECT from_status, to_status, changed_at FROM order_history WHERE order_id = $1 ORDER BY id', [id]
      );
      order.files = files.rows.map((f) => ({ ...f, id: Number(f.id), created_at: iso(f.created_at) }));
      order.history = history.rows.map((h) => ({ ...h, changed_at: iso(h.changed_at) }));
      return order;
    },

    async updateOrder(id, { status, admin_note }) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const cur = await client.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [id]);
        if (!cur.rowCount) { await client.query('ROLLBACK'); return null; }
        if (status && status !== cur.rows[0].status) {
          await client.query('UPDATE orders SET status = $1, updated_at = now() WHERE id = $2', [status, id]);
          await client.query(
            'INSERT INTO order_history (order_id, from_status, to_status) VALUES ($1, $2, $3)',
            [id, cur.rows[0].status, status]
          );
        }
        if (typeof admin_note === 'string') {
          await client.query('UPDATE orders SET admin_note = $1, updated_at = now() WHERE id = $2', [admin_note, id]);
        }
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        client.release();
      }
      return this.getOrder(id);
    },

    async getFile(orderId, fileId) {
      const { rows } = await pool.query('SELECT * FROM order_files WHERE id = $1 AND order_id = $2', [fileId, orderId]);
      return rows[0] || null;
    },

    async stats() {
      const { rows } = await pool.query('SELECT status, COUNT(*)::int AS n FROM orders GROUP BY status');
      const week = await pool.query("SELECT COUNT(*)::int AS n FROM orders WHERE created_at >= now() - interval '7 days'");
      return { byStatus: Object.fromEntries(rows.map((r) => [r.status, r.n])), lastWeek: week.rows[0].n };
    },

    async close() { await pool.end(); },
  };
}

module.exports = { createPostgresStore };
