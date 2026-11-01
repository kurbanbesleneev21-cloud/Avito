'use strict';

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const multer = require('multer');

const config = require('./config');
const constants = require('./constants');
const { createStore } = require('./db');
const sec = require('./security');
const { orderSchema, adminUpdateSchema, listQuerySchema, formatZodError, emailDomainAccepts } = require('./validation');
const { upload, persistFiles, removeFiles, resolveStoredPath, UploadError } = require('./uploads');
const { notifyNewOrder } = require('./notify');
const { PROJECTS, getProject } = require('./projects');
const { renderProjectPage, contentPage } = require('./render');

const PUBLIC_DIR = path.join(config.ROOT, 'public');

class HttpError extends Error {
  constructor(status, message, extra = {}) { super(message); this.status = status; this.expose = true; Object.assign(this, extra); }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

async function createApp({ store } = {}) {
  store = store || (await createStore());
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  /* ---------- Security headers ---------- */
  app.use((req, res, next) => {
    res.set({
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com",
        "img-src 'self' data: blob:",
        "media-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
      'Cross-Origin-Opener-Policy': 'same-origin',
    });
    if (config.isProd) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // Reject cross-site state-changing requests (CSRF defence in depth on top of SameSite cookies).
  app.use('/api', (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (origin) {
      let host;
      try { host = new URL(origin).host; } catch { host = ''; }
      if (host !== req.get('host')) return next(new HttpError(403, 'Запрос с другого домена отклонён'));
    }
    next();
  });

  const orderLimiter = sec.createRateLimiter({ windowMs: 60 * 60 * 1000, max: config.orderRateLimit });
  const tokenLimiter = sec.createRateLimiter({ windowMs: 10 * 60 * 1000, max: 60 });
  const loginLimiter = sec.createRateLimiter({ windowMs: 15 * 60 * 1000, max: 8 });
  const clientIp = (req) => req.ip || req.socket.remoteAddress || 'unknown';

  /* ---------- Public API ---------- */

  app.get('/api/health', (req, res) => res.json({ ok: true, db: store.kind }));

  app.get('/api/form-token', (req, res, next) => {
    const r = tokenLimiter.hit(clientIp(req));
    if (!r.ok) return next(new HttpError(429, 'Слишком много запросов. Попробуйте позже.'));
    res.set('Cache-Control', 'no-store').json({ token: sec.issueFormToken() });
  });

  app.post(
    '/api/orders',
    (req, res, next) => {
      const r = orderLimiter.hit(clientIp(req));
      if (!r.ok) {
        res.set('Retry-After', String(r.retryAfter));
        return next(new HttpError(429, 'Слишком много заявок с вашего адреса. Попробуйте через час или напишите нам на почту.'));
      }
      next();
    },
    upload.array('files', config.uploads.maxFiles),
    wrap(async (req, res) => {
      const body = req.body || {};

      // Honeypot: real users never see this field. Answer like a success so bots learn nothing.
      if (body.company_site) {
        return res.status(201).json({ ok: true, number: sec.generateOrderNumber(), created_at: new Date().toISOString() });
      }

      const token = sec.verifyFormToken(body.form_token);
      if (!token.ok) {
        const msg = token.reason === 'too_fast'
          ? 'Форма отправлена слишком быстро. Пожалуйста, проверьте данные и отправьте ещё раз.'
          : 'Сессия формы устарела. Обновите страницу и попробуйте снова.';
        throw new HttpError(400, msg, { code: `token_${token.reason}` });
      }

      let services = body.services;
      if (typeof services === 'string') { try { services = JSON.parse(services); } catch { /* comma list */ } }
      const parsed = orderSchema.safeParse({ ...body, services });
      if (!parsed.success) {
        const fields = formatZodError(parsed.error);
        // object-level rules don't run while other fields are invalid — report them together
        if (body.contact_method === 'telegram' && !String(body.telegram || '').trim() && !fields.telegram) {
          fields.telegram = 'Укажите Telegram или выберите другой способ связи';
        }
        throw new HttpError(422, 'Проверьте правильность заполнения полей', { fields });
      }
      const data = parsed.data;

      if (config.emailMxCheck && !(await emailDomainAccepts(data.email))) {
        throw new HttpError(422, 'Проверьте правильность заполнения полей', {
          fields: { email: 'Домен этого адреса не принимает почту. Проверьте адрес.' },
        });
      }

      if (!sec.consumeNonce(token.nonce)) throw new HttpError(409, 'Эта заявка уже была отправлена.', { code: 'duplicate' });

      let files;
      try {
        files = await persistFiles(req.files);
      } catch (err) {
        sec.releaseNonce(token.nonce); // let the client fix the file and resend with the same token
        throw err;
      }
      try {
        let number;
        for (let i = 0; i < 5; i++) {
          number = sec.generateOrderNumber();
          if (!(await store.numberExists(number))) break;
        }
        const order = {
          ...data,
          number,
          search_text: [number, data.project_name, data.name, data.email, data.phone, data.telegram, data.description]
            .join(' ').toLowerCase(),
          ip_hash: sec.ipHash(clientIp(req)),
          user_agent: String(req.get('user-agent') || '').slice(0, 300),
        };
        const saved = await store.createOrder(order, files);
        notifyNewOrder({ ...order, id: saved.id }, files.length);
        res.status(201).json({
          ok: true,
          number: saved.number,
          created_at: saved.created_at,
          confirmation_sent: Boolean(config.smtp.host && config.smtp.from && config.smtp.sendClientConfirmation),
        });
      } catch (err) {
        await removeFiles(files.map((f) => f.storedName));
        sec.releaseNonce(token.nonce);
        throw err;
      }
    })
  );

  /* ---------- Admin API ---------- */

  const api = express.Router();
  api.use(express.json({ limit: '32kb' }));
  api.use((req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  api.post('/login', wrap(async (req, res) => {
    const key = clientIp(req);
    const r = loginLimiter.hit(key);
    if (!r.ok) {
      res.set('Retry-After', String(r.retryAfter));
      throw new HttpError(429, `Слишком много попыток входа. Повторите через ${Math.ceil(r.retryAfter / 60)} мин.`);
    }
    if (!sec.adminConfigured()) {
      throw new HttpError(503, 'Администратор не настроен: задайте ADMIN_PASSWORD_HASH (или ADMIN_PASSWORD) в .env');
    }
    const { username, password } = req.body || {};
    if (!sec.checkAdminCredentials(username, password)) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      throw new HttpError(401, 'Неверный логин или пароль');
    }
    loginLimiter.reset(key);
    res.set('Set-Cookie', sec.sessionCookie(sec.createSession(config.admin.user), sec.SESSION_TTL_MS));
    res.json({ ok: true, user: config.admin.user });
  }));

  const requireAdmin = (req, res, next) => {
    const session = sec.readSession(sec.parseCookies(req.get('cookie'))[sec.SESSION_COOKIE]);
    if (!session) return next(new HttpError(401, 'Требуется авторизация'));
    req.admin = session;
    next();
  };

  api.post('/logout', (req, res) => {
    sec.revokeSession(sec.readSession(sec.parseCookies(req.get('cookie'))[sec.SESSION_COOKIE]));
    res.set('Set-Cookie', sec.sessionCookie('', 0)).json({ ok: true });
  });

  api.get('/me', requireAdmin, (req, res) => res.json({ user: req.admin.u, expires: req.admin.exp }));

  api.get('/meta', requireAdmin, (req, res) => res.json(constants));

  api.get('/stats', requireAdmin, wrap(async (req, res) => {
    const { byStatus, lastWeek } = await store.stats();
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
    res.json({ total, lastWeek, byStatus, new: byStatus.new || 0, in_progress: byStatus.in_progress || 0, done: byStatus.done || 0 });
  }));

  api.get('/orders', requireAdmin, wrap(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const { total, items } = await store.listOrders({ ...q, limit: q.per_page, offset: (q.page - 1) * q.per_page });
    res.json({ total, page: q.page, per_page: q.per_page, items });
  }));

  const idParam = (v) => {
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n < 1) throw new HttpError(404, 'Заявка не найдена');
    return n;
  };

  api.get('/orders/:id', requireAdmin, wrap(async (req, res) => {
    const order = await store.getOrder(idParam(req.params.id));
    if (!order) throw new HttpError(404, 'Заявка не найдена');
    res.json(order);
  }));

  api.patch('/orders/:id', requireAdmin, wrap(async (req, res) => {
    const parsed = adminUpdateSchema.safeParse(req.body || {});
    if (!parsed.success) throw new HttpError(422, 'Некорректные данные', { fields: formatZodError(parsed.error) });
    const order = await store.updateOrder(idParam(req.params.id), parsed.data);
    if (!order) throw new HttpError(404, 'Заявка не найдена');
    res.json(order);
  }));

  api.get('/orders/:id/files/:fileId', requireAdmin, wrap(async (req, res) => {
    const file = await store.getFile(idParam(req.params.id), idParam(req.params.fileId));
    const filePath = file && resolveStoredPath(file.stored_name);
    if (!filePath || !fs.existsSync(filePath)) throw new HttpError(404, 'Файл не найден');
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': `attachment; filename="file${path.extname(file.stored_name)}"; filename*=UTF-8''${encodeURIComponent(file.original_name)}`,
      'Content-Security-Policy': "default-src 'none'; sandbox",
    });
    fs.createReadStream(filePath).pipe(res);
  }));

  api.get('/export.csv', requireAdmin, wrap(async (req, res) => {
    const q = listQuerySchema.parse(req.query);
    const { items } = await store.listOrders({ ...q, limit: 10000, offset: 0 });
    const cols = ['number', 'created_at', 'status', 'project_name', 'services', 'budget', 'deadline', 'name', 'email', 'phone', 'telegram', 'contact_method'];
    const cell = (v) => {
      let s = Array.isArray(v) ? v.map((x) => constants.SERVICES[x]).join(', ') : String(v ?? '');
      if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // CSV formula injection guard
      return `"${s.replace(/"/g, '""')}"`;
    };
    const lines = [cols.join(';'), ...items.map((o) => cols.map((c) => cell(
      c === 'status' ? constants.STATUSES[o.status] : c === 'budget' ? constants.BUDGETS[o.budget]
        : c === 'deadline' ? constants.DEADLINES[o.deadline] : c === 'contact_method' ? constants.CONTACT_METHODS[o.contact_method] : o[c]
    )).join(';'))];
    res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="orders.csv"' });
    res.send(`﻿${lines.join('\r\n')}`);
  }));

  app.use('/api/admin', api);
  app.use('/api', (req, res, next) => next(new HttpError(404, 'Not found')));

  /* ---------- Pages ---------- */

  // Home page: inject absolute URLs for canonical / Open Graph tags.
  let homeHtml = null;
  app.get(['/', '/index.html'], (req, res) => {
    if (!homeHtml || !config.isProd) {
      homeHtml = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8').replaceAll('__SITE_URL__', config.siteUrl);
    }
    res.set('Cache-Control', 'no-cache').type('html').send(homeHtml);
  });

  app.get('/projects/:slug', (req, res, next) => {
    const project = getProject(req.params.slug);
    if (!project) return next();
    res.set('Cache-Control', 'public, max-age=300').type('html').send(renderProjectPage(project, PROJECTS));
  });

  app.get('/privacy', (req, res) => res.type('html').send(contentPage('privacy', {
    title: 'Политика конфиденциальности — CODEFORGE',
    description: 'Как CODEFORGE собирает, использует и защищает персональные данные клиентов.',
    canonical: '/privacy',
  })));
  app.get('/terms', (req, res) => res.type('html').send(contentPage('terms', {
    title: 'Пользовательское соглашение — CODEFORGE',
    description: 'Условия использования сайта CODEFORGE и отправки заявок на разработку.',
    canonical: '/terms',
  })));

  app.get('/sitemap.xml', (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const urls = [
      ['/', '1.0', 'weekly'],
      ...PROJECTS.map((p) => [`/projects/${p.slug}`, '0.7', 'monthly']),
      ['/privacy', '0.3', 'yearly'],
      ['/terms', '0.3', 'yearly'],
    ];
    res.type('application/xml').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
        .map(([u, p, f]) => `  <url><loc>${config.siteUrl}${u}</loc><lastmod>${today}</lastmod><changefreq>${f}</changefreq><priority>${p}</priority></url>`)
        .join('\n')}\n</urlset>\n`
    );
  });

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /admin/\nDisallow: /api/\n\nSitemap: ${config.siteUrl}/sitemap.xml\n`);
  });

  app.use('/admin', (req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });

  app.use(express.static(PUBLIC_DIR, {
    extensions: ['html'],
    index: 'index.html',
    setHeaders(res, filePath) {
      if (/\.(css|js|svg|png|jpg|webp|woff2|mp4|webm)$/.test(filePath)) {
        res.set('Cache-Control', config.isProd ? 'public, max-age=604800' : 'no-cache');
      }
    },
  }));

  app.use((req, res) => {
    res.status(404).type('html').send(contentPage('404', {
      title: 'Страница не найдена — CODEFORGE',
      description: 'Запрошенная страница не найдена.',
      canonical: req.path,
      noindex: true,
    }));
  });

  /* ---------- Errors ---------- */
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      const messages = {
        LIMIT_FILE_SIZE: `Файл слишком большой. Максимум ${config.uploads.maxFileSize / 1024 / 1024} МБ.`,
        LIMIT_FILE_COUNT: `Можно прикрепить не более ${config.uploads.maxFiles} файлов.`,
        LIMIT_UNEXPECTED_FILE: `Можно прикрепить не более ${config.uploads.maxFiles} файлов.`,
      };
      err = new HttpError(400, messages[err.code] || 'Ошибка загрузки файлов', { fields: { files: messages[err.code] || 'Ошибка загрузки' } });
    } else if (err instanceof UploadError) {
      err = new HttpError(400, err.message, { fields: { files: err.message } });
    } else if (err.type === 'entity.parse.failed') {
      err = new HttpError(400, 'Некорректный JSON');
    }
    const status = err.status || 500;
    if (status >= 500) console.error('[error]', req.method, req.originalUrl, err);
    if (res.headersSent) return res.end();
    res.status(status).json({
      ok: false,
      error: err.expose ? err.message : 'Внутренняя ошибка сервера. Попробуйте позже.',
      ...(err.fields ? { fields: err.fields } : {}),
      ...(err.code && err.expose ? { code: err.code } : {}),
    });
  });

  return { app, store };
}

if (require.main === module) {
  createApp().then(({ app, store }) => {
    app.listen(config.port, () => {
      console.log(`CODEFORGE running on http://localhost:${config.port} (db: ${store.kind})`);
      if (!sec.adminConfigured()) console.warn('⚠  Admin password is not set. Run `npm run hash-password` and put ADMIN_PASSWORD_HASH into .env');
    });
  }).catch((err) => {
    console.error('Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { createApp };
