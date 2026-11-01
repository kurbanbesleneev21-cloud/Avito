'use strict';

const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');

// Minimal .env loader (no dependency). Real environment variables win.
function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const ROOT = path.resolve(__dirname, '..');
loadDotEnv(path.join(ROOT, '.env'));

const env = process.env;
const isProd = env.NODE_ENV === 'production';

const dataDir = path.resolve(ROOT, env.DATA_DIR || 'data');
fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });

let sessionSecret = env.SESSION_SECRET;
if (!sessionSecret || sessionSecret.length < 32) {
  if (isProd) {
    throw new Error('SESSION_SECRET (>= 32 chars) is required in production');
  }
  // Dev fallback: persist a random secret so sessions survive restarts.
  const secretFile = path.join(dataDir, '.session-secret');
  if (fs.existsSync(secretFile)) {
    sessionSecret = fs.readFileSync(secretFile, 'utf8').trim();
  } else {
    sessionSecret = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(secretFile, sessionSecret, { mode: 0o600 });
  }
}

module.exports = {
  ROOT,
  isProd,
  port: Number(env.PORT) || 3000,
  siteUrl: (env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  trustProxy: env.TRUST_PROXY === 'true',
  dataDir,
  uploadDir: path.join(dataDir, 'uploads'),
  databaseUrl: env.DATABASE_URL || '',
  sessionSecret,
  admin: {
    user: env.ADMIN_USER || 'admin',
    passwordHash: env.ADMIN_PASSWORD_HASH || '',
    password: env.ADMIN_PASSWORD || '',
  },
  emailMxCheck: env.EMAIL_MX_CHECK !== 'false',
  orderRateLimit: Number(env.ORDER_RATE_LIMIT) || 6, // order submissions per IP per hour
  telegram: {
    token: env.TELEGRAM_BOT_TOKEN || '',
    chatId: env.TELEGRAM_CHAT_ID || '',
  },
  smtp: {
    host: env.SMTP_HOST || '',
    port: Number(env.SMTP_PORT) || 587,
    secure: env.SMTP_SECURE === 'true',
    user: env.SMTP_USER || '',
    pass: env.SMTP_PASS || '',
    from: env.MAIL_FROM || '',
    notifyTo: env.MAIL_NOTIFY_TO || '',
    sendClientConfirmation: env.MAIL_CLIENT_CONFIRMATION !== 'false',
  },
  uploads: {
    maxFiles: 5,
    maxFileSize: 10 * 1024 * 1024,
  },
};
