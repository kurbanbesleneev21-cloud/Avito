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
const isVercel = Boolean(env.VERCEL);
const isProd = env.NODE_ENV === 'production' || isVercel;

// Vercel's filesystem is read-only except /tmp (and /tmp is wiped between invocations).
const dataDir = isVercel ? '/tmp/codeforge' : path.resolve(ROOT, env.DATA_DIR || 'data');
fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });

// The Vercel ↔ Supabase integration provides SUPABASE_JWT_SECRET; a key derived from it
// (with a distinct label) is used when SESSION_SECRET is not set explicitly.
let sessionSecret = env.SESSION_SECRET;
if ((!sessionSecret || sessionSecret.length < 32) && env.SUPABASE_JWT_SECRET && env.SUPABASE_JWT_SECRET.length >= 32) {
  sessionSecret = crypto.createHmac('sha256', env.SUPABASE_JWT_SECRET).update('codeforge-session-v1').digest('hex');
}
if (!sessionSecret || sessionSecret.length < 32) {
  if (isProd) {
    // Don't crash the whole site: public pages keep working, admin and order form report a config error.
    console.error('SESSION_SECRET (>= 32 chars) is not set — admin login and order form are disabled');
    sessionSecret = null;
  } else {
    // Dev fallback: persist a random secret so sessions survive restarts.
    const secretFile = path.join(dataDir, '.session-secret');
    if (fs.existsSync(secretFile)) {
      sessionSecret = fs.readFileSync(secretFile, 'utf8').trim();
    } else {
      sessionSecret = crypto.randomBytes(48).toString('hex');
      fs.writeFileSync(secretFile, sessionSecret, { mode: 0o600 });
    }
  }
}

module.exports = {
  ROOT,
  isProd,
  isVercel,
  port: Number(env.PORT) || 3000,
  siteUrl: (env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, ''),
  trustProxy: env.TRUST_PROXY === 'true',
  dataDir,
  uploadDir: path.join(dataDir, 'uploads'),
  // DATABASE_URL, or POSTGRES_URL as created by the Vercel ↔ Supabase integration (transaction pooler)
  databaseUrl: env.DATABASE_URL || env.POSTGRES_URL || '',
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
  supabase: {
    url: (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, ''),
    serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
    privateBucket: env.SUPABASE_PRIVATE_BUCKET || 'order-files',
    publicBucket: env.SUPABASE_PUBLIC_BUCKET || 'site-media',
  },
  // Vercel functions accept request bodies up to 4.5 MB, so uploads are capped lower there.
  uploads: {
    maxFiles: 5,
    maxFileSize: (isVercel ? 4 : 10) * 1024 * 1024,
    maxTotal: (isVercel ? 4 : 25) * 1024 * 1024,
  },
};
