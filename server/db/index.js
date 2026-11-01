'use strict';

const config = require('../config');

async function createStore() {
  if (config.databaseUrl) {
    const { createPostgresStore } = require('./postgres');
    return createPostgresStore(config.databaseUrl);
  }
  if (config.isVercel) {
    // Vercel has no persistent disk: a local SQLite file would silently lose every order.
    throw new Error('DATABASE_URL is not set (required on Vercel: use a Supabase/Postgres connection string)');
  }
  const { createSqliteStore } = require('./sqlite');
  return createSqliteStore(config.dataDir);
}

module.exports = { createStore };
