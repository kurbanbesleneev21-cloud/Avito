'use strict';

const dns = require('node:dns').promises;
const { z } = require('zod');
const { SERVICES, BUDGETS, DEADLINES, CONTACT_METHODS, STATUSES } = require('./constants');

const keys = (o) => Object.keys(o);

// Strip control characters (keep \n and \t), trim.
const clean = (s) => String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
const plural = (n, one, few, many) => {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
};
const chars = (n) => `${n} ${plural(n, 'символ', 'символа', 'символов')}`;

const text = (min, max, label) =>
  z.preprocess(
    (v) => (v == null ? '' : clean(v)),
    min > 0
      ? z.string().min(min, `${label}: минимум ${chars(min)}`).max(max, `${label}: максимум ${chars(max)}`)
      : z.string().max(max, `${label}: максимум ${chars(max)}`)
  );

const orderSchema = z
  .object({
    services: z.preprocess(
      (v) => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(',') : []),
      z
        .array(z.enum(keys(SERVICES)))
        .min(1, 'Выберите хотя бы одну услугу')
        .max(keys(SERVICES).length)
        .transform((a) => [...new Set(a)])
    ),
    project_name: text(2, 120, 'Название проекта'),
    description: text(20, 3000, 'Описание идеи'),
    features: text(0, 3000, 'Функции'),
    references_text: text(0, 1500, 'Примеры'),
    deadline: z.enum(keys(DEADLINES), { error: 'Выберите желаемые сроки' }),
    budget: z.enum(keys(BUDGETS), { error: 'Выберите бюджет' }),
    name: text(2, 80, 'Имя'),
    email: z.preprocess(
      (v) => (v == null ? '' : clean(v).toLowerCase()),
      z.string().max(254).email('Введите корректный адрес электронной почты')
    ),
    phone: z.preprocess(
      (v) => (v == null ? '' : clean(v)),
      z
        .string()
        .regex(/^\+?[0-9\s\-()]{7,20}$/, 'Введите корректный номер телефона')
        .refine((s) => s.replace(/\D/g, '').length >= 7, 'Введите корректный номер телефона')
    ),
    telegram: z.preprocess(
      (v) => (v == null ? '' : clean(v).replace(/^https?:\/\/t\.me\//i, '').replace(/^@?/, '')),
      z.union([z.literal(''), z.string().regex(/^[A-Za-z0-9_]{5,32}$/, 'Telegram: 5–32 символа, латиница, цифры и _')])
    ),
    contact_method: z.enum(keys(CONTACT_METHODS), { error: 'Выберите способ связи' }),
    consent: z.preprocess((v) => v === true || v === 'true' || v === 'on', z.literal(true, { error: 'Необходимо согласие на обработку данных' })),
  })
  .superRefine((data, ctx) => {
    if (data.contact_method === 'telegram' && !data.telegram) {
      ctx.addIssue({ code: 'custom', path: ['telegram'], message: 'Укажите Telegram или выберите другой способ связи' });
    }
  });

const adminUpdateSchema = z
  .object({
    status: z.enum(keys(STATUSES)).optional(),
    admin_note: z.string().max(5000).optional(),
  })
  .refine((d) => d.status !== undefined || d.admin_note !== undefined, 'Nothing to update');

const listQuerySchema = z.object({
  q: z.string().max(100).optional().transform((s) => (s ? s.trim() : undefined)),
  status: z.enum(keys(STATUSES)).optional().catch(undefined),
  service: z.enum(keys(SERVICES)).optional().catch(undefined),
  budget: z.enum(keys(BUDGETS)).optional().catch(undefined),
  sort: z.enum(['newest', 'oldest']).optional().catch('newest'),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
  per_page: z.coerce.number().int().min(1).max(100).catch(20),
});

function formatZodError(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path[0] ?? '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

// Checks that the e-mail domain can receive mail (MX, or A/AAAA fallback per RFC 5321).
// Only definitive "does not exist" answers reject; network trouble never blocks a client.
async function emailDomainAccepts(email) {
  const domain = email.split('@')[1];
  if (!domain) return false;
  const definitive = new Set(['ENOTFOUND', 'ENODATA', 'NXDOMAIN']);
  const withTimeout = (p) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('timeout'), { code: 'ETIMEOUT' })), 3000))]);
  try {
    const mx = await withTimeout(dns.resolveMx(domain));
    if (mx.length && !(mx.length === 1 && mx[0].exchange === '')) return true; // null MX (RFC 7505) = no mail
    if (mx.length) return false;
  } catch (err) {
    if (!definitive.has(err.code)) return true;
  }
  try {
    const a = await withTimeout(dns.resolve(domain));
    return a.length > 0;
  } catch (err) {
    return !definitive.has(err.code);
  }
}

module.exports = { orderSchema, adminUpdateSchema, listQuerySchema, formatZodError, emailDomainAccepts };
