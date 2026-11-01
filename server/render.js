'use strict';

// Server-side rendering for secondary pages (project case studies, legal pages, 404)
// so they are fully indexable and share one header/footer.

const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ARROW = '<svg class="btn__arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const LOGO = `<a class="logo" href="/" aria-label="CODEFORGE — на главную"><span class="logo__mark" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M11 9 4 16l7 7M21 9l7 7-7 7M18 6l-4 20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="logo__text">CODEFORGE</span></a>`;

function layout({ title, description, canonical, body, ogImage = '/assets/img/og-image.png', jsonLd, noindex = false }) {
  const url = `${config.siteUrl}${canonical}`;
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#050505">
  <meta name="color-scheme" content="dark">
  ${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${esc(url)}">`}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="CODEFORGE">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${esc(config.siteUrl + ogImage)}">
  <meta property="og:locale" content="ru_RU">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Manrope:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap">
  <link rel="stylesheet" href="/assets/css/main.css">
  ${jsonLd ? `<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</script>` : ''}
  <script src="/assets/js/main.js" defer></script>
</head>
<body>
  <a class="skip-link" href="#main">Перейти к содержимому</a>
  <canvas class="bg-particles" aria-hidden="true"></canvas>
  <div class="cursor" aria-hidden="true"><span class="cursor__dot"></span><span class="cursor__ring"></span></div>
  <header class="nav is-scrolled" id="nav">
    <div class="nav__inner container">
      ${LOGO}
      <nav class="nav__links" aria-label="Основная навигация">
        <a href="/">Главная</a><a href="/#services">Услуги</a><a href="/#projects">Проекты</a><a href="/#about">О нас</a><a href="#contacts">Контакты</a>
      </nav>
      <div class="nav__actions">
        <a class="btn btn--primary btn--sm nav__cta" href="/#order"><span>Оформить заказ</span>${ARROW}</a>
        <button class="burger" type="button" aria-expanded="false" aria-controls="mobile-menu" aria-label="Открыть меню"><span></span><span></span></button>
      </div>
    </div>
    <div class="mobile-menu" id="mobile-menu" hidden>
      <nav class="mobile-menu__links" aria-label="Мобильная навигация">
        <a href="/"><span>01</span>Главная</a><a href="/#services"><span>02</span>Услуги</a><a href="/#projects"><span>03</span>Проекты</a><a href="/#about"><span>04</span>О нас</a><a href="#contacts"><span>05</span>Контакты</a>
      </nav>
      <a class="btn btn--primary btn--block" href="/#order"><span>Оформить заказ</span>${ARROW}</a>
      <p class="mobile-menu__meta">hello@codeforge.dev · Ответим в течение 24 часов</p>
    </div>
  </header>
  <main id="main">
${body}
  </main>
  <footer class="footer" id="contacts">
    <div class="container footer__grid">
      <div class="footer__brand">${LOGO}<p>Студия цифровой разработки. Создаём сайты, мобильные приложения и программные решения, которые помогают бизнесу расти.</p></div>
      <nav class="footer__col" aria-label="Навигация в подвале"><h2 class="footer__title">Навигация</h2><a href="/">Главная</a><a href="/#services">Услуги</a><a href="/#projects">Проекты</a><a href="/#about">О нас</a><a href="/#faq">FAQ</a></nav>
      <div class="footer__col"><h2 class="footer__title">Услуги</h2><a href="/#services">Разработка сайтов</a><a href="/#services">Android-приложения</a><a href="/#services">iOS-приложения</a><a href="/#services">Веб-приложения</a><a href="/#services">Интернет-магазины</a><a href="/#services">CRM-системы</a></div>
      <div class="footer__col"><h2 class="footer__title">Контакты</h2><a href="mailto:hello@codeforge.dev">hello@codeforge.dev</a><a href="https://t.me/codeforge_studio" target="_blank" rel="noopener">Telegram: @codeforge_studio</a><p class="footer__muted">Пн–Пт, 9:00–19:00 (CET)<br>Работаем с клиентами по всему миру</p></div>
    </div>
    <div class="container footer__bottom">
      <p>© 2026 CODEFORGE. ALL RIGHTS RESERVED.</p>
      <nav aria-label="Правовая информация"><a href="/privacy">Политика конфиденциальности</a><a href="/terms">Пользовательское соглашение</a></nav>
    </div>
  </footer>
</body>
</html>`;
}

function projectCard(p) {
  return `<article class="project-card" data-reveal>
    <a class="project-card__media" href="/projects/${p.slug}" tabindex="-1" aria-hidden="true">
      <img src="${p.preview}" alt="" width="800" height="560" loading="lazy" decoding="async"><span class="badge">Демо-концепт</span>
    </a>
    <div class="project-card__body">
      <p class="project-card__type">${esc(p.type)}</p>
      <h3 class="project-card__title">${esc(p.title)}</h3>
      <p class="project-card__text">${esc(p.summary)}</p>
      <a class="link-arrow" href="/projects/${p.slug}">Подробнее <span class="sr-only">о проекте ${esc(p.title)}</span><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h11m-4-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
    </div>
  </article>`;
}

function renderProjectPage(p, all) {
  const others = all.filter((x) => x.slug !== p.slug).slice(0, 3);
  const body = `
    <section class="page-hero">
      <div class="container">
        <nav class="breadcrumbs" aria-label="Хлебные крошки"><a href="/">Главная</a><span aria-hidden="true">/</span><a href="/#projects">Проекты</a><span aria-hidden="true">/</span><span aria-current="page">${esc(p.title)}</span></nav>
        <p class="eyebrow" style="margin-top:28px"><span class="eyebrow__num">${esc(p.year)}</span>${esc(p.type)}</p>
        <h1 class="page-title">${esc(p.title)}</h1>
        <p class="page-lead">${esc(p.summary)}</p>
        <p class="demo-note"><span aria-hidden="true">ⓘ</span><span><b>Демонстрационный концепт.</b> Этот проект создан студией как пример подхода к дизайну и архитектуре. Он не является реальным заказом клиента, а названия и данные вымышлены.</span></p>
        <figure class="project-cover"><img src="${p.preview}" alt="Превью концепта ${esc(p.title)}" width="1600" height="1120" decoding="async"></figure>
        <div class="metrics">${p.metrics.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>
      </div>
    </section>
    <section class="container project-layout">
      <div class="prose">
        <h2>Задача</h2>
        <p>${esc(p.challenge)}</p>
        <h2>Решение</h2>
        <ul>${p.solution.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
        <h2>Хотите похожий продукт?</h2>
        <p>Расскажите о своей задаче — мы предложим архитектуру, сроки и смету под ваш бюджет.</p>
        <p style="margin-top:24px"><a class="btn btn--primary" href="/#order"><span>Обсудить проект</span>${ARROW}</a></p>
      </div>
      <aside class="aside-card" aria-label="Параметры проекта">
        <dl>
          <dt>Тип</dt><dd>${esc(p.type)}</dd>
        </dl>
        <dl>
          <dt>Статус</dt><dd>Демонстрационный концепт</dd>
        </dl>
        <dl>
          <dt>Технологии</dt><dd class="stack-tags">${p.stack.map((s) => `<span>${esc(s)}</span>`).join('')}</dd>
        </dl>
      </aside>
    </section>
    <section class="container more-projects" aria-labelledby="more-title">
      <h2 id="more-title">Другие концепты</h2>
      <div class="projects-grid">${others.map(projectCard).join('')}</div>
    </section>`;

  return layout({
    title: `${p.title} — ${p.type} | Демо-концепт CODEFORGE`,
    description: p.summary,
    canonical: `/projects/${p.slug}`,
    ogImage: '/assets/img/og-image.png',
    body,
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'CreativeWork',
      name: p.title,
      description: p.summary,
      genre: p.type,
      creator: { '@type': 'Organization', name: 'CODEFORGE' },
      keywords: p.stack.join(', '),
    },
  });
}

const CONTENT_DIR = path.join(__dirname, 'content');
const cache = new Map();
function contentPage(name, { title, description, canonical, noindex }) {
  if (!cache.has(name) || !config.isProd) {
    const html = fs.readFileSync(path.join(CONTENT_DIR, `${name}.html`), 'utf8');
    cache.set(name, layout({ title, description, canonical, noindex, body: html }));
  }
  return cache.get(name);
}

module.exports = { renderProjectPage, contentPage, layout };
