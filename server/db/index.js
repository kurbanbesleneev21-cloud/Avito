'use strict';

const config = require('../config');

async function createStore() {
  if (config.databaseUrl) {
    const { createPostgresStore } = require('./postgres');
    return createPostgresStore(config.databaseUrl);
  }
  const { createSqliteStore } = require('./sqlite');
  return createSqliteStore(config.dataDir);
}

module.exports = { createStore };
