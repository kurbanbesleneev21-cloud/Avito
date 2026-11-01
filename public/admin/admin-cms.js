/* CODEFORGE admin — site content management (content, portfolio, media, settings) */
(() => {
  'use strict';

  const A = () => window.ADMIN;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  let content = null;   // working copy being edited
  let saved = '';       // JSON of the last saved state
  let defaults = null;
  const root = () => $('[data-cms]');

  /* ---------- Editor schema: what the admin can edit, section by section ---------- */
  const SECTIONS = [
    { id: 'hero', title: 'Главный экран', anchor: '#top', fields: [
      { key: 'hero.eyebrow', label: 'Надпись над заголовком' },
      { key: 'hero.line1', label: 'Заголовок — строка 1' },
      { key: 'hero.line2', label: 'Заголовок — строка 2' },
      { key: 'hero.line3', label: 'Заголовок — строка 3 (серая)' },
      { key: 'hero.subtitle', label: 'Подзаголовок', type: 'textarea' },
      { key: 'hero.primaryCta', label: 'Кнопка «заказать»' },
      { key: 'hero.secondaryCta', label: 'Вторая кнопка (пусто — скрыть)' },
      { key: 'hero.scrollHint', label: 'Надпись внизу экрана (пусто — скрыть)' },
      { group: 'Фоновое видео (необязательно)', hint: 'Если указать ссылку на видео, оно заменит анимированную сцену программиста. Видео больше 4 МБ загружайте на внешний хостинг (например, Supabase Storage или Cloudinary) и вставляйте ссылку.' },
      { key: 'hero.videoMp4', label: 'Видео MP4 (ссылка)', type: 'url' },
      { key: 'hero.videoWebm', label: 'Видео WebM (ссылка)', type: 'url' },
      { key: 'hero.videoMobile', label: 'Облегчённое видео для телефонов (MP4)', type: 'url' },
      { key: 'hero.videoPoster', label: 'Постер видео', type: 'image' },
    ] },
    { id: 'services', title: 'Услуги', anchor: '#services', toggle: 'services.enabled', fields: [
      { key: 'services.eyebrow', label: 'Метка раздела' },
      { key: 'services.title', label: 'Заголовок' },
      { key: 'services.subtitle', label: 'Подзаголовок', type: 'textarea' },
      { key: 'services.items', label: 'Карточки услуг', type: 'list', itemTitle: (it) => it.title, fields: [
        { key: 'icon', label: 'Иконка', type: 'select', options: () => A().meta().ICONS },
        { key: 'title', label: 'Название' },
        { key: 'text', label: 'Описание', type: 'textarea' },
        { key: 'tags', label: 'Теги (через запятую)', type: 'tags' },
        { key: 'button', label: 'Текст кнопки (пусто — без кнопки)' },
        { key: 'service', label: 'Какую услугу отмечать в форме заказа', type: 'select', options: () => A().meta().SERVICES },
      ] },
    ] },
    { id: 'about', title: 'О нас', anchor: '#about', toggle: 'about.enabled', fields: [
      { key: 'about.eyebrow', label: 'Метка раздела' },
      { key: 'about.title', label: 'Заголовок' },
      { key: 'about.text', label: 'Текст', type: 'textarea' },
      { key: 'about.bullets', label: 'Пункты списка (каждый с новой строки)', type: 'lines' },
      { key: 'about.stats', label: 'Счётчики', type: 'list', itemTitle: (it) => `${it.value}${it.suffix ? ' ' + it.suffix : ''} — ${it.label}`, fields: [
        { key: 'value', label: 'Число', type: 'number' },
        { key: 'suffix', label: 'Единица (ч, %, мес…)' },
        { key: 'label', label: 'Подпись' },
      ] },
    ] },
    { id: 'process', title: 'Как мы работаем', anchor: '#process', toggle: 'process.enabled', fields: [
      { key: 'process.eyebrow', label: 'Метка раздела' },
      { key: 'process.title', label: 'Заголовок' },
      { key: 'process.subtitle', label: 'Подзаголовок', type: 'textarea' },
      { key: 'process.steps', label: 'Этапы', type: 'list', itemTitle: (it) => it.title, fields: [
        { key: 'title', label: 'Название этапа' },
        { key: 'text', label: 'Описание', type: 'textarea' },
      ] },
    ] },
    { id: 'order', title: 'Форма заказа', anchor: '#order', fields: [
      { key: 'order.acceptingOrders', label: 'Принимать заявки', type: 'bool', hint: 'Если выключить, вместо формы будет показано сообщение ниже.' },
      { key: 'order.closedMessage', label: 'Сообщение, когда приём закрыт', type: 'textarea' },
      { key: 'order.eyebrow', label: 'Метка раздела' },
      { key: 'order.title', label: 'Заголовок' },
      { key: 'order.subtitle', label: 'Подзаголовок', type: 'textarea' },
    ] },
    { id: 'projects', title: 'Портфолио — тексты', anchor: '#projects', toggle: 'projects.enabled', fields: [
      { key: 'projects.eyebrow', label: 'Метка раздела' },
      { key: 'projects.title', label: 'Заголовок' },
      { key: 'projects.subtitle', label: 'Подзаголовок', type: 'textarea' },
      { group: 'Сами проекты', hint: 'Проекты добавляются и редактируются в разделе «Портфолио» в меню слева.' },
    ] },
    { id: 'advantages', title: 'Преимущества', anchor: '#advantages', toggle: 'advantages.enabled', fields: [
      { key: 'advantages.eyebrow', label: 'Метка раздела' },
      { key: 'advantages.title', label: 'Заголовок' },
      { key: 'advantages.items', label: 'Преимущества', type: 'list', itemTitle: (it) => it.title, fields: [
        { key: 'icon', label: 'Иконка', type: 'select', options: () => A().meta().ICONS },
        { key: 'title', label: 'Заголовок' },
        { key: 'text', label: 'Текст', type: 'textarea' },
      ] },
    ] },
    { id: 'faq', title: 'FAQ', anchor: '#faq', toggle: 'faq.enabled', fields: [
      { key: 'faq.eyebrow', label: 'Метка раздела' },
      { key: 'faq.title', label: 'Заголовок' },
      { key: 'faq.subtitle', label: 'Подзаголовок', type: 'textarea' },
      { key: 'faq.items', label: 'Вопросы и ответы', type: 'list', itemTitle: (it) => it.q, fields: [
        { key: 'q', label: 'Вопрос' },
        { key: 'a', label: 'Ответ', type: 'textarea' },
      ] },
    ] },
    { id: 'cta', title: 'Призыв к действию', anchor: '#order', toggle: 'cta.enabled', fields: [
      { key: 'cta.title', label: 'Заголовок', type: 'textarea' },
      { key: 'cta.text', label: 'Текст', type: 'textarea' },
      { key: 'cta.button', label: 'Текст кнопки' },
    ] },
    { id: 'contacts', title: 'Контакты и подвал', anchor: '#contacts', fields: [
      { key: 'brand.name', label: 'Название компании' },
      { key: 'brand.tagline', label: 'Описание компании в подвале', type: 'textarea' },
      { key: 'nav.ctaLabel', label: 'Кнопка в шапке' },
      { key: 'contacts.email', label: 'Электронная почта', type: 'email' },
      { key: 'contacts.phone', label: 'Телефон (необязательно)' },
      { key: 'contacts.telegram', label: 'Telegram (имя пользователя без @)' },
      { key: 'contacts.hours', label: 'Часы работы' },
      { key: 'contacts.note', label: 'Примечание под контактами' },
      { key: 'contacts.responseNote', label: 'Строка в мобильном меню (время ответа)' },
      { key: 'socials', label: 'Социальные сети', type: 'list', itemTitle: (it) => `${(A().meta().SOCIALS || {})[it.type] || it.type}: ${it.url}`, fields: [
        { key: 'type', label: 'Сеть', type: 'select', options: () => A().meta().SOCIALS },
        { key: 'url', label: 'Ссылка', type: 'url' },
      ] },
      { key: 'footer.copyright', label: 'Копирайт' },
    ] },
    { id: 'seo', title: 'SEO и соцсети', fields: [
      { key: 'seo.title', label: 'Meta Title главной страницы', hint: 'Оптимально 50–60 символов.', counter: 60 },
      { key: 'seo.description', label: 'Meta Description', type: 'textarea', hint: 'Оптимально 140–160 символов.', counter: 160 },
      { key: 'seo.ogTitle', label: 'Заголовок для превью в соцсетях (Open Graph)' },
      { key: 'seo.ogDescription', label: 'Описание для превью в соцсетях', type: 'textarea' },
      { key: 'seo.ogImage', label: 'Картинка превью (1200×630)', type: 'image' },
    ] },
    { id: 'notifications', title: 'Уведомления', fields: [
      { group: 'Куда присылать новые заявки', hint: 'Токен бота и почтовый сервер задаются в переменных окружения (TELEGRAM_BOT_TOKEN, SMTP_*) — здесь только адресаты.' },
      { key: 'notifications.telegramChatId', label: 'Telegram chat ID', hint: 'Напишите боту, затем откройте https://api.telegram.org/bot<TOKEN>/getUpdates и возьмите chat.id.' },
      { key: 'notifications.notifyEmail', label: 'E-mail для уведомлений', type: 'email' },
      { key: 'notifications.clientConfirmation', label: 'Отправлять клиенту письмо-подтверждение', type: 'bool' },
    ] },
  ];

  /* ---------- Path helpers ---------- */
  const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);
  const set = (obj, path, v) => { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], obj)[last] = v; };

  /* ---------- Load / save ---------- */
  async function load(force = false) {
    if (content && !force) return;
    const data = await A().api('/content');
    content = data.content;
    defaults = data.defaults;
    saved = JSON.stringify(content);
  }
  const isDirty = () => content !== null && JSON.stringify(content) !== saved;
  function markDirty() {
    const bar = $('[data-savebar]');
    if (bar) bar.hidden = !isDirty();
  }
  async function save() {
    const btn = $('[data-save]');
    btn && btn.classList.add('is-loading');
    try {
      const data = await A().api('/content', { method: 'PUT', body: { content } });
      content = data.content;
      saved = JSON.stringify(content);
      A().toast('Сохранено. На сайте изменения появятся в течение ~10 секунд');
      rerender();
    } catch (err) { A().fail(err); } finally { btn && btn.classList.remove('is-loading'); markDirty(); }
  }
  function discard() { if (content) content = JSON.parse(saved); }

  let currentHash = '';
  const rerender = () => render(currentHash, { keepScroll: true });

  /* ---------- Generic field renderer ---------- */
  let uid = 0;
  function fieldEl(field, obj, key) {
    const id = `f${++uid}`;
    const wrap = document.createElement('div');
    wrap.className = 'cms-field' + (field.type === 'bool' ? ' cms-field--bool' : '');
    const value = obj[key];
    const label = `<label class="field__label" for="${id}">${esc(field.label)}</label>`;
    const hint = field.hint ? `<p class="cms-hint">${esc(field.hint)}</p>` : '';
    const onChange = (v) => { obj[key] = v; markDirty(); };

    if (field.type === 'bool') {
      wrap.innerHTML = `<label class="switch"><input type="checkbox" id="${id}" ${value ? 'checked' : ''}><span class="switch__track" aria-hidden="true"></span><span>${esc(field.label)}</span></label>${hint}`;
      wrap.querySelector('input').addEventListener('change', (e) => onChange(e.target.checked));
      return wrap;
    }
    if (field.type === 'select') {
      const opts = field.options() || {};
      wrap.innerHTML = `${label}<select class="input select" id="${id}">${Object.entries(opts).map(([k, v]) => `<option value="${esc(k)}" ${k === value ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>${hint}`;
      wrap.querySelector('select').addEventListener('change', (e) => onChange(e.target.value));
      return wrap;
    }
    if (field.type === 'textarea' || field.type === 'lines') {
      const v = field.type === 'lines' ? (value || []).join('\n') : value;
      wrap.innerHTML = `${label}<textarea class="input input--area" id="${id}" rows="${field.type === 'lines' ? 4 : 3}">${esc(v)}</textarea>${hint}${field.counter ? `<span class="cms-counter" data-counter></span>` : ''}`;
      const ta = wrap.querySelector('textarea');
      const count = () => { const c = wrap.querySelector('[data-counter]'); if (c) { c.textContent = `${ta.value.length} / ${field.counter}`; c.classList.toggle('is-over', ta.value.length > field.counter); } };
      ta.addEventListener('input', () => { onChange(field.type === 'lines' ? ta.value.split('\n').map((s) => s.trim()).filter(Boolean) : ta.value); count(); });
      count();
      return wrap;
    }
    if (field.type === 'tags') {
      wrap.innerHTML = `${label}<input class="input" id="${id}" value="${esc((value || []).join(', '))}">${hint}`;
      wrap.querySelector('input').addEventListener('input', (e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean)));
      return wrap;
    }
    if (field.type === 'image') {
      wrap.innerHTML = `${label}<div class="cms-image">
          <div class="cms-image__preview">${value ? `<img src="${esc(value)}" alt="">` : '<span>нет</span>'}</div>
          <div class="cms-image__ctrl"><input class="input" id="${id}" value="${esc(value)}" placeholder="https://… или /assets/…">
          <div class="cms-image__btns"><button type="button" class="btn btn--ghost btn--sm" data-pick><span>Выбрать / загрузить</span></button>${value ? '<button type="button" class="btn btn--ghost btn--sm" data-clear><span>Убрать</span></button>' : ''}</div></div>
        </div>${hint}`;
      const input = wrap.querySelector('input');
      const update = (v) => { onChange(v); input.value = v; wrap.querySelector('.cms-image__preview').innerHTML = v ? `<img src="${esc(v)}" alt="">` : '<span>нет</span>'; };
      input.addEventListener('change', () => update(input.value.trim()));
      wrap.querySelector('[data-pick]').addEventListener('click', () => pickMedia(update));
      const clr = wrap.querySelector('[data-clear]');
      clr && clr.addEventListener('click', () => update(''));
      return wrap;
    }
    const type = field.type === 'number' ? 'number' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text';
    wrap.innerHTML = `${label}<input class="input" id="${id}" type="${type}" value="${esc(value)}">${hint}${field.counter ? `<span class="cms-counter" data-counter></span>` : ''}`;
    const inp = wrap.querySelector('input');
    const count = () => { const c = wrap.querySelector('[data-counter]'); if (c) { c.textContent = `${inp.value.length} / ${field.counter}`; c.classList.toggle('is-over', inp.value.length > field.counter); } };
    inp.addEventListener('input', () => { onChange(type === 'number' ? Number(inp.value) : inp.value); count(); });
    count();
    return wrap;
  }

  function emptyLike(tpl) {
    if (Array.isArray(tpl)) return [];
    if (tpl && typeof tpl === 'object') return Object.fromEntries(Object.entries(tpl).map(([k, v]) => [k, emptyLike(v)]));
    if (typeof tpl === 'boolean') return tpl;
    if (typeof tpl === 'number') return 0;
    return '';
  }

  function listEl(field, arr, defaultsArr) {
    const wrap = document.createElement('div');
    wrap.className = 'cms-list';
    const draw = () => {
      wrap.innerHTML = `<div class="cms-list__head"><span class="field__label">${esc(field.label)} <span class="cms-muted">(${arr.length})</span></span></div>`;
      arr.forEach((item, i) => {
        const card = document.createElement('details');
        card.className = 'cms-item';
        if (item.__open) card.open = true;
        card.innerHTML = `<summary><span class="cms-item__num">${i + 1}</span><span class="cms-item__title">${esc(field.itemTitle ? field.itemTitle(item) : `Элемент ${i + 1}`) || '<i>без названия</i>'}</span>
          <span class="cms-item__tools">
            <button type="button" data-up ${i === 0 ? 'disabled' : ''} aria-label="Выше">↑</button>
            <button type="button" data-down ${i === arr.length - 1 ? 'disabled' : ''} aria-label="Ниже">↓</button>
            <button type="button" data-del aria-label="Удалить">✕</button>
          </span></summary><div class="cms-item__body"></div>`;
        const body = card.querySelector('.cms-item__body');
        field.fields.forEach((f) => body.append(fieldEl(f, item, f.key)));
        card.addEventListener('toggle', () => { Object.defineProperty(item, '__open', { value: card.open, enumerable: false, configurable: true, writable: true }); });
        card.querySelector('[data-up]').addEventListener('click', (e) => { e.preventDefault(); [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; markDirty(); draw(); });
        card.querySelector('[data-down]').addEventListener('click', (e) => { e.preventDefault(); [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; markDirty(); draw(); });
        card.querySelector('[data-del]').addEventListener('click', (e) => { e.preventDefault(); if (confirm('Удалить этот элемент?')) { arr.splice(i, 1); markDirty(); draw(); } });
        body.addEventListener('input', () => { const t = card.querySelector('.cms-item__title'); if (field.itemTitle) t.textContent = field.itemTitle(item) || 'без названия'; });
        wrap.append(card);
      });
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'btn btn--ghost btn--sm cms-add';
      add.innerHTML = '<span>+ Добавить</span>';
      add.addEventListener('click', () => {
        const item = emptyLike((defaultsArr && defaultsArr[0]) || {});
        Object.defineProperty(item, '__open', { value: true, enumerable: false, configurable: true, writable: true });
        if ('icon' in item && !item.icon) item.icon = 'code';
        if ('service' in item && !item.service) item.service = 'other';
        if ('type' in item && !item.type && field.key === 'socials') item.type = 'telegram';
        arr.push(item); markDirty(); draw();
      });
      wrap.append(add);
    };
    draw();
    return wrap;
  }

  function renderFields(container, fields) {
    for (const f of fields) {
      if (f.group) {
        const g = document.createElement('div');
        g.className = 'cms-group';
        g.innerHTML = `<h3>${esc(f.group)}</h3>${f.hint ? `<p class="cms-hint">${esc(f.hint)}</p>` : ''}`;
        container.append(g);
        continue;
      }
      if (f.type === 'list') { container.append(listEl(f, get(content, f.key), get(defaults, f.key))); continue; }
      const ks = f.key.split('.');
      const last = ks.pop();
      container.append(fieldEl(f, ks.length ? get(content, ks.join('.')) : content, last));
    }
  }

  const saveBar = () => `
    <div class="cms-savebar" data-savebar hidden>
      <span>Есть несохранённые изменения</span>
      <button type="button" class="btn btn--ghost btn--sm" data-discard><span>Отменить</span></button>
      <button type="button" class="btn btn--primary btn--sm" data-save><span class="btn__label">Сохранить</span><span class="btn__spinner" aria-hidden="true"></span></button>
    </div>`;
  function bindSaveBar() {
    $('[data-save]').addEventListener('click', save);
    $('[data-discard]').addEventListener('click', () => { discard(); rerender(); markDirty(); });
    markDirty();
  }

  /* ---------- Pages ---------- */
  function contentPage(sectionId) {
    const sec = SECTIONS.find((s) => s.id === sectionId) || SECTIONS[0];
    const r = root();
    r.innerHTML = `
      <header class="ws-head"><div><p class="eyebrow">Контент сайта</p><h1 class="ws-title">${esc(sec.title)}</h1></div>
        <a class="btn btn--ghost btn--sm" href="/${sec.anchor || ''}" target="_blank" rel="noopener"><span>Открыть на сайте ↗</span></a></header>
      <div class="cms-layout">
        <nav class="cms-tabs" aria-label="Разделы сайта">${SECTIONS.map((s) => `<a href="#/content/${s.id}" class="${s.id === sec.id ? 'is-active' : ''}">${esc(s.title)}${s.toggle && !get(content, s.toggle) ? ' <span class="cms-off">скрыт</span>' : ''}</a>`).join('')}</nav>
        <div class="cms-panel panel-card" data-fields></div>
      </div>${saveBar()}`;
    const box = $('[data-fields]', r);
    if (sec.toggle) renderFields(box, [{ key: sec.toggle, label: 'Показывать этот раздел на сайте', type: 'bool' }]);
    renderFields(box, sec.fields);
    bindSaveBar();
  }

  const PROJECT_FIELDS = [
    { key: 'published', label: 'Опубликован на сайте', type: 'bool' },
    { key: 'isDemo', label: 'Пометка «Демо-концепт»', type: 'bool', hint: 'Включайте для примеров, которые не являются реальными заказами клиентов.' },
    { key: 'title', label: 'Название' },
    { key: 'slug', label: 'Адрес страницы (/projects/…)', hint: 'Латиница, цифры и дефисы. Если оставить пустым — создастся из названия.' },
    { key: 'type', label: 'Тип разработки' },
    { key: 'year', label: 'Год' },
    { key: 'summary', label: 'Краткое описание (в карточке)', type: 'textarea' },
    { key: 'preview', label: 'Изображение / превью', type: 'image' },
    { key: 'challenge', label: 'Задача', type: 'textarea' },
    { key: 'solution', label: 'Решение — пункты (каждый с новой строки)', type: 'lines' },
    { key: 'stack', label: 'Технологии (через запятую)', type: 'tags' },
  ];

  function projectsPage(editIndex) {
    const items = content.projects.items;
    const r = root();
    if (editIndex !== null && items[editIndex]) {
      const p = items[editIndex];
      r.innerHTML = `
        <a class="back-link" href="#/projects">← Все проекты</a>
        <header class="ws-head"><div><p class="eyebrow">Портфолио</p><h1 class="ws-title">${esc(p.title || 'Новый проект')}</h1></div>
          ${p.slug && saved.includes(`"slug":"${p.slug}"`) ? `<a class="btn btn--ghost btn--sm" href="/projects/${esc(p.slug)}" target="_blank" rel="noopener"><span>Страница проекта ↗</span></a>` : ''}</header>
        <div class="panel-card cms-panel" data-fields></div>${saveBar()}`;
      const box = $('[data-fields]', r);
      PROJECT_FIELDS.forEach((f) => box.append(fieldEl(f, p, f.key)));
      box.append(listEl({ key: 'metrics', label: 'Показатели (до 3 на странице)', itemTitle: (m) => `${m.value} — ${m.label}`, fields: [{ key: 'value', label: 'Значение' }, { key: 'label', label: 'Подпись' }] }, p.metrics, defaults.projects.items[0].metrics));
      bindSaveBar();
      return;
    }
    r.innerHTML = `
      <header class="ws-head"><div><p class="eyebrow">Портфолио</p><h1 class="ws-title">Проекты</h1></div>
        <button type="button" class="btn btn--primary btn--sm" data-add><span>+ Новый проект</span></button></header>
      <div class="cms-projects">${items.map((p, i) => `
        <article class="cms-project panel-card">
          <div class="cms-project__img">${p.preview ? `<img src="${esc(p.preview)}" alt="">` : ''}</div>
          <div class="cms-project__body">
            <p class="cms-muted">${esc(p.type)}${p.isDemo ? ' · демо' : ''}</p>
            <h3>${esc(p.title || 'Без названия')}</h3>
            <span class="status ${p.published ? 'status--in_progress' : 'status--off'}">${p.published ? 'Опубликован' : 'Скрыт'}</span>
          </div>
          <div class="cms-project__tools">
            <a class="btn btn--ghost btn--sm" href="#/projects/${i}"><span>Редактировать</span></a>
            <button type="button" data-move="${i}:-1" ${i === 0 ? 'disabled' : ''} aria-label="Выше">↑</button>
            <button type="button" data-move="${i}:1" ${i === items.length - 1 ? 'disabled' : ''} aria-label="Ниже">↓</button>
            <button type="button" data-del="${i}" aria-label="Удалить">✕</button>
          </div>
        </article>`).join('') || '<p class="empty">Проектов пока нет.</p>'}</div>${saveBar()}`;
    r.querySelector('[data-add]').addEventListener('click', () => {
      const p = emptyLike(defaults.projects.items[0]);
      Object.assign(p, { published: false, isDemo: false, year: String(new Date().getFullYear()), metrics: [] });
      items.unshift(p);
      markDirty();
      location.hash = '#/projects/0';
    });
    r.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => {
      const [i, d] = b.dataset.move.split(':').map(Number);
      [items[i], items[i + d]] = [items[i + d], items[i]];
      markDirty(); projectsPage(null);
    }));
    r.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () => {
      const i = Number(b.dataset.del);
      if (confirm(`Удалить проект «${items[i].title}»? Изменение применится после сохранения.`)) { items.splice(i, 1); markDirty(); projectsPage(null); }
    }));
    bindSaveBar();
  }

  /* ---------- Media ---------- */
  async function uploadImage(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/admin/media', { method: 'POST', body: fd, credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
    return data;
  }

  async function mediaGrid(container, { onPick } = {}) {
    container.innerHTML = '<p class="cms-muted">Загрузка…</p>';
    let items;
    try { items = (await A().api('/media')).items; } catch (err) { container.innerHTML = `<p class="empty">${esc(err.message)}</p>`; return; }
    const env = A().meta().environment || {};
    container.innerHTML = `
      <label class="cms-upload">
        <input type="file" accept=".jpg,.jpeg,.png,.webp,.gif" multiple>
        <span><b>Загрузить изображения</b> — JPG, PNG, WEBP, GIF до ${Math.round((env.maxUpload || 4194304) / 1048576)} МБ</span>
      </label>
      <div class="cms-media">${items.map((m) => `
        <figure class="cms-media__item" data-id="${m.id}">
          <img src="${esc(m.url)}" alt="" loading="lazy">
          <figcaption title="${esc(m.original_name)}">${esc(m.original_name)}</figcaption>
          <div class="cms-media__tools">
            ${onPick ? `<button type="button" class="btn btn--primary btn--sm" data-use="${esc(m.url)}"><span>Выбрать</span></button>` : `<button type="button" class="btn btn--ghost btn--sm" data-copy="${esc(m.url)}"><span>Копировать ссылку</span></button>`}
            ${onPick ? '' : `<button type="button" class="btn btn--ghost btn--sm" data-remove="${m.id}"><span>Удалить</span></button>`}
          </div>
        </figure>`).join('') || '<p class="empty">Пока нет загруженных изображений.</p>'}</div>`;
    container.querySelector('input[type=file]').addEventListener('change', async (e) => {
      const files = [...e.target.files];
      for (const f of files) {
        try { const m = await uploadImage(f); A().toast(`Загружено: ${f.name}`); if (onPick && files.length === 1) { onPick(m.url); return; } }
        catch (err) { A().fail(err); }
      }
      mediaGrid(container, { onPick });
    });
    container.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', () => onPick(b.dataset.use)));
    container.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(new URL(b.dataset.copy, location.origin).href); A().toast('Ссылка скопирована'); } catch { prompt('Ссылка:', b.dataset.copy); }
    }));
    container.querySelectorAll('[data-remove]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Удалить изображение? Если оно используется на сайте, там оно перестанет отображаться.')) return;
      try { await A().api(`/media/${b.dataset.remove}`, { method: 'DELETE' }); mediaGrid(container, { onPick }); } catch (err) { A().fail(err); }
    }));
  }

  function pickMedia(onPick) {
    const dlg = document.createElement('dialog');
    dlg.className = 'cms-dialog';
    dlg.innerHTML = '<div class="cms-dialog__head"><h2>Выберите изображение</h2><button type="button" class="btn btn--ghost btn--sm" data-close><span>Закрыть</span></button></div><div data-grid></div>';
    document.body.append(dlg);
    const close = () => { dlg.close(); dlg.remove(); };
    dlg.querySelector('[data-close]').addEventListener('click', close);
    dlg.addEventListener('cancel', () => setTimeout(() => dlg.remove(), 0));
    dlg.showModal();
    mediaGrid(dlg.querySelector('[data-grid]'), { onPick: (url) => { onPick(url); close(); } });
  }

  function mediaPage() {
    root().innerHTML = '<header class="ws-head"><div><p class="eyebrow">Файлы сайта</p><h1 class="ws-title">Медиафайлы</h1></div></header><div data-grid></div>';
    mediaGrid($('[data-grid]', root()));
  }

  /* ---------- Settings ---------- */
  async function settingsPage() {
    const env = A().meta().environment || {};
    const ok = (b, yes, no) => `<span class="status ${b ? 'status--in_progress' : 'status--off'}">${b ? yes : no}</span>`;
    root().innerHTML = `
      <header class="ws-head"><div><p class="eyebrow">Администрирование</p><h1 class="ws-title">Настройки</h1></div></header>
      <div class="detail-grid">
        <div>
          <section class="panel-card">
            <h2>Смена пароля администратора</h2>
            <form class="cms-form" data-password novalidate>
              <div class="cms-field"><label class="field__label" for="pw-cur">Текущий пароль</label><input class="input" id="pw-cur" type="password" autocomplete="current-password" required></div>
              <div class="cms-field"><label class="field__label" for="pw-new">Новый пароль (от 10 символов)</label><input class="input" id="pw-new" type="password" autocomplete="new-password" minlength="10" required></div>
              <div class="cms-field"><label class="field__label" for="pw-rep">Повторите новый пароль</label><input class="input" id="pw-rep" type="password" autocomplete="new-password" required></div>
              <p class="field__error" data-pw-error role="alert"></p>
              <button class="btn btn--primary btn--sm" type="submit"><span>Сменить пароль</span></button>
              <p class="cms-hint">После смены все остальные сеансы входа будут завершены.</p>
            </form>
          </section>
          <section class="panel-card">
            <h2>История версий контента</h2>
            <p class="cms-hint">Каждое сохранение создаёт версию. Хранятся последние 30.</p>
            <ul class="cms-versions" data-versions><li class="cms-muted">Загрузка…</li></ul>
          </section>
        </div>
        <div>
          <section class="panel-card">
            <h2>Состояние сервера</h2>
            <dl class="kv">
              <dt>База данных</dt><dd>${ok(env.db === 'postgres', 'PostgreSQL / Supabase', env.db === 'sqlite' ? 'SQLite (локально)' : 'не подключена')}</dd>
              <dt>Хранилище файлов</dt><dd>${ok(env.storage === 'supabase', 'Supabase Storage', 'локальный диск')}</dd>
              <dt>Telegram-бот</dt><dd>${ok(env.telegramBot, 'настроен', 'не настроен')}</dd>
              <dt>Почта (SMTP)</dt><dd>${ok(env.smtp, 'настроена', 'не настроена')}</dd>
            </dl>
            ${env.vercel && env.storage !== 'supabase' ? '<p class="cms-hint cms-warn">На Vercel без Supabase Storage загруженные файлы пропадают. Задайте SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY.</p>' : ''}
          </section>
          <section class="panel-card">
            <h2>Сброс контента</h2>
            <p class="cms-hint">Вернуть все тексты, услуги, проекты и контакты к исходному варианту. Текущая версия останется в истории.</p>
            <button type="button" class="btn btn--ghost btn--sm" data-reset><span>Сбросить к исходному</span></button>
          </section>
        </div>
      </div>`;
    const form = $('[data-password]');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('[data-pw-error]');
      err.textContent = '';
      const cur = $('#pw-cur').value, nw = $('#pw-new').value, rep = $('#pw-rep').value;
      if (nw.length < 10) { err.textContent = 'Новый пароль должен быть не короче 10 символов'; return; }
      if (nw !== rep) { err.textContent = 'Пароли не совпадают'; return; }
      try { await A().api('/password', { method: 'POST', body: { current: cur, next: nw } }); form.reset(); A().toast('Пароль изменён'); }
      catch (e2) { err.textContent = e2.message; }
    });
    $('[data-reset]').addEventListener('click', async () => {
      if (!confirm('Сбросить весь контент сайта к исходному варианту?')) return;
      try { const d = await A().api('/content/reset', { method: 'POST' }); content = d.content; saved = JSON.stringify(content); A().toast('Контент сброшен'); settingsPage(); }
      catch (e) { A().fail(e); }
    });
    try {
      const { items } = await A().api('/content/versions');
      const list = $('[data-versions]');
      list.innerHTML = items.map((v, i) => `<li><span>${esc(A().fmtDate(v.created_at))}${i === 0 ? ' <b>(текущая)</b>' : ''}</span>${i === 0 ? '' : `<button type="button" class="btn btn--ghost btn--sm" data-restore="${v.id}"><span>Восстановить</span></button>`}</li>`).join('') || '<li class="cms-muted">Сохранений пока не было — сайт показывает исходный контент.</li>';
      list.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('Восстановить эту версию? Текущая останется в истории.')) return;
        try { const d = await A().api(`/content/versions/${b.dataset.restore}/restore`, { method: 'POST' }); content = d.content; saved = JSON.stringify(content); A().toast('Версия восстановлена'); settingsPage(); }
        catch (e) { A().fail(e); }
      }));
    } catch (e) { A().fail(e); }
  }

  /* ---------- Router entry ---------- */
  async function render(hash, { keepScroll = false } = {}) {
    currentHash = hash;
    const y = scrollY;
    try { await load(); } catch (err) { root().innerHTML = `<p class="empty">${esc(err.message)}</p>`; return; }
    let m;
    if ((m = hash.match(/^#\/content\/?([\w-]*)/))) contentPage(m[1] || 'hero');
    else if ((m = hash.match(/^#\/projects\/(\d+)/))) projectsPage(Number(m[1]));
    else if (hash.startsWith('#/projects')) projectsPage(null);
    else if (hash.startsWith('#/media')) mediaPage();
    else if (hash.startsWith('#/settings')) settingsPage();
    if (keepScroll) scrollTo(0, y);
  }

  // Moving between content tabs / project editor keeps unsaved edits in memory.
  window.CMS = {
    render,
    hasUnsaved: () => isDirty(),
    isDirty: () => {
      // edits are shared across CMS pages; only warn when leaving the CMS entirely
      const h = location.hash;
      return /^#\/(content|projects)/.test(h) ? false : isDirty();
    },
    discard: () => { if (!/^#\/(content|projects)/.test(location.hash)) discard(); },
  };
})();
