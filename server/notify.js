'use strict';

const config = require('./config');
const { SERVICES, BUDGETS, DEADLINES, CONTACT_METHODS } = require('./constants');

const escHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function summary(order) {
  return {
    services: order.services.map((s) => SERVICES[s]).join(', '),
    budget: BUDGETS[order.budget],
    deadline: DEADLINES[order.deadline],
    contact: CONTACT_METHODS[order.contact_method],
  };
}

async function sendTelegram(order, filesCount, ctx) {
  const token = config.telegram.token;
  const chatId = ctx.settings.telegramChatId || config.telegram.chatId;
  if (!token || !chatId) return { skipped: true };
  const s = summary(order);
  const lines = [
    `<b>🆕 Новая заявка ${escHtml(order.number)}</b>`,
    '',
    `<b>Проект:</b> ${escHtml(order.project_name)}`,
    `<b>Услуги:</b> ${escHtml(s.services)}`,
    `<b>Бюджет:</b> ${escHtml(s.budget)}`,
    `<b>Сроки:</b> ${escHtml(s.deadline)}`,
    '',
    `<b>Клиент:</b> ${escHtml(order.name)}`,
    `<b>Email:</b> ${escHtml(order.email)}`,
    `<b>Телефон:</b> ${escHtml(order.phone)}`,
    order.telegram ? `<b>Telegram:</b> @${escHtml(order.telegram)}` : null,
    `<b>Связь:</b> ${escHtml(s.contact)}`,
    filesCount ? `<b>Файлов:</b> ${filesCount}` : null,
    '',
    escHtml(cut(order.description, 700)),
    '',
    `<a href="${escHtml(ctx.origin)}/admin/#/orders/${order.id}">Открыть в админ-панели</a>`,
  ].filter((l) => l !== null);

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Telegram API ${res.status}: ${await res.text()}`);
  return { sent: true };
}

let transporter;
function getTransport() {
  if (!config.smtp.host || !config.smtp.from) return null;
  if (!transporter) {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      connectionTimeout: 8_000,
      greetingTimeout: 8_000,
      socketTimeout: 10_000,
    });
  }
  return transporter;
}

function row(label, value) {
  return `<tr><td style="padding:6px 16px 6px 0;color:#8a8a8a;vertical-align:top;white-space:nowrap">${escHtml(label)}</td><td style="padding:6px 0;color:#111">${escHtml(value)}</td></tr>`;
}

async function sendEmails(order, filesCount, ctx) {
  const notifyTo = ctx.settings.notifyEmail || config.smtp.notifyTo;
  const transport = getTransport();
  if (!transport) return { skipped: true };
  const s = summary(order);
  const jobs = [];

  if (notifyTo) {
    jobs.push(
      transport.sendMail({
        from: config.smtp.from,
        to: notifyTo,
        replyTo: order.email,
        subject: `Новая заявка ${order.number}: ${order.project_name}`,
        text: [
          `Заявка ${order.number}`, `Проект: ${order.project_name}`, `Услуги: ${s.services}`, `Бюджет: ${s.budget}`,
          `Сроки: ${s.deadline}`, `Клиент: ${order.name}`, `Email: ${order.email}`, `Телефон: ${order.phone}`,
          `Telegram: ${order.telegram ? '@' + order.telegram : '—'}`, `Связь: ${s.contact}`, `Файлов: ${filesCount}`,
          '', order.description, '', `${ctx.origin}/admin/#/orders/${order.id}`,
        ].join('\n'),
        html: `<div style="font-family:Arial,sans-serif;font-size:14px">
          <h2 style="margin:0 0 12px">Новая заявка ${escHtml(order.number)}</h2>
          <table>${row('Проект', order.project_name)}${row('Услуги', s.services)}${row('Бюджет', s.budget)}${row('Сроки', s.deadline)}
          ${row('Клиент', order.name)}${row('Email', order.email)}${row('Телефон', order.phone)}
          ${row('Telegram', order.telegram ? '@' + order.telegram : '—')}${row('Связь', s.contact)}${row('Файлов', String(filesCount))}</table>
          <p style="white-space:pre-wrap">${escHtml(order.description)}</p>
          <p><a href="${escHtml(ctx.origin)}/admin/#/orders/${order.id}">Открыть в админ-панели</a></p></div>`,
      })
    );
  }

  if (config.smtp.sendClientConfirmation && ctx.settings.clientConfirmation) {
    jobs.push(
      transport.sendMail({
        from: config.smtp.from,
        to: order.email,
        subject: `CODEFORGE — заявка ${order.number} получена`,
        text: `Здравствуйте, ${order.name}!\n\nМы получили вашу заявку ${order.number} («${order.project_name}»).\nМенеджер свяжется с вами в течение одного рабочего дня удобным для вас способом: ${s.contact.toLowerCase()}.\n\nКоманда CODEFORGE`,
        html: `<div style="font-family:Arial,sans-serif;font-size:15px;color:#111;line-height:1.6">
          <p>Здравствуйте, ${escHtml(order.name)}!</p>
          <p>Мы получили вашу заявку <b>${escHtml(order.number)}</b> («${escHtml(order.project_name)}»).</p>
          <p>Менеджер свяжется с вами в течение одного рабочего дня удобным для вас способом: ${escHtml(s.contact.toLowerCase())}.</p>
          <p>Команда CODEFORGE</p></div>`,
      })
    );
  }

  await Promise.all(jobs);
  return { sent: jobs.length };
}

// Notification failures are logged but never fail the client's submission.
async function notifyNewOrder(order, filesCount, { origin, settings }, log = console) {
  const ctx = { origin, settings: settings || {} };
  const [tg, mail] = await Promise.allSettled([sendTelegram(order, filesCount, ctx), sendEmails(order, filesCount, ctx)]);
  if (tg.status === 'rejected') log.error(`[notify] telegram failed for ${order.number}:`, tg.reason.message);
  if (mail.status === 'rejected') log.error(`[notify] email failed for ${order.number}:`, mail.reason.message);
}

module.exports = { notifyNewOrder };
