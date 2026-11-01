'use strict';

// Line icons (48×48, stroke = currentColor). Selectable in the admin panel.
const ICONS = {
  monitor: { label: 'Монитор', svg: '<rect x="5" y="8" width="38" height="26" rx="3"/><path d="M17 42h14M24 34v8"/><path class="ic-anim" d="M12 16h10M12 21h16M12 26h7"/>' },
  android: { label: 'Android', svg: '<rect x="13" y="4" width="22" height="40" rx="4"/><path d="M21 39h6"/><path class="ic-anim" d="M18 18a6 6 0 0 1 12 0v6H18z"/><path d="M19 13l-2-3M29 13l2-3"/>' },
  apple: { label: 'iPhone', svg: '<rect x="13" y="4" width="22" height="40" rx="6"/><path d="M21 8h6"/><path class="ic-anim" d="M27.5 20.5c-1.3-1.6-3.6-1.3-4.3-.7-.8-.6-3-.9-4.3.7-1.5 1.9-.6 5.6 1.2 7.4.8.8 1.6.9 2.4.4.5-.3 1-.3 1.4 0 .8.5 1.6.4 2.4-.4 1.2-1.2 2-3.2 1.9-4.7"/><path d="M24 19.5c0-1.2.8-2.4 2-2.8"/>' },
  browser: { label: 'Окно браузера', svg: '<rect x="4" y="8" width="40" height="32" rx="3"/><path d="M4 15h40"/><circle cx="9" cy="11.5" r=".8"/><circle cx="12.5" cy="11.5" r=".8"/><path class="ic-anim" d="M10 22h12v12H10zM26 22h12M26 28h12M26 34h8"/>' },
  cart: { label: 'Корзина', svg: '<path d="M4 8h6l5 22h22l4-15H13"/><circle cx="18" cy="38" r="3"/><circle cx="34" cy="38" r="3"/><path class="ic-anim" d="M21 20h12M23 25h8"/>' },
  code: { label: 'Код', svg: '<path d="M16 14 6 24l10 10M32 14l10 10-10 10"/><path class="ic-anim" d="M27 9 21 39"/>' },
  crm: { label: 'CRM / таблица', svg: '<rect x="6" y="6" width="36" height="36" rx="4"/><path d="M6 16h36M16 16v26"/><path class="ic-anim" d="M22 24h14M22 30h10M22 36h12"/>' },
  person: { label: 'Человек', svg: '<circle cx="24" cy="17" r="7"/><path d="M10 40c1.5-8 7-12 14-12s12.5 4 14 12"/><path class="ic-anim" d="M36 10l2 2 4-4"/>' },
  chip: { label: 'Процессор', svg: '<rect x="12" y="12" width="24" height="24" rx="3"/><rect class="ic-anim" x="19" y="19" width="10" height="10" rx="1"/><path d="M18 6v6M24 6v6M30 6v6M18 36v6M24 36v6M30 36v6M6 18h6M6 24h6M6 30h6M36 18h6M36 24h6M36 30h6"/>' },
  pen: { label: 'Перо / дизайн', svg: '<path d="M8 34 30 12l6 6-22 22H8z"/><path class="ic-anim" d="M30 12l6-6 6 6-6 6"/><path d="M6 42h36"/>' },
  support: { label: 'Поддержка', svg: '<path d="M8 26a16 16 0 0 1 32 0"/><rect x="5" y="26" width="8" height="12" rx="3"/><rect x="35" y="26" width="8" height="12" rx="3"/><path class="ic-anim" d="M39 38c0 4-6 5-11 5"/>' },
  rocket: { label: 'Ракета', svg: '<path d="M24 4c8 6 10 16 6 26H18C14 20 16 10 24 4z"/><circle cx="24" cy="17" r="3"/><path d="M18 30l-6 6 2 6 6-4M30 30l6 6-2 6-6-4"/><path class="ic-anim" d="M22 36v8M26 36v6"/>' },
  shield: { label: 'Щит', svg: '<path d="M24 4 8 10v12c0 10 7 17 16 22 9-5 16-12 16-22V10z"/><path class="ic-anim" d="M17 24l5 5 9-10"/>' },
  chart: { label: 'График', svg: '<path d="M6 6v36h36"/><path class="ic-anim" d="M12 32l9-10 7 6 12-14"/>' },
};

const icon = (key, cls = '') => {
  const i = ICONS[key] || ICONS.code;
  return `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 48 48" aria-hidden="true">${i.svg}</svg>`;
};

module.exports = { ICONS, icon };
