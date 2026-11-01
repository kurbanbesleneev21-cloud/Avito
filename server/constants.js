'use strict';

// Single source of truth for enumerations shared by validation, DB and admin UI.

const SERVICES = {
  website: 'Разработка сайта',
  android: 'Android-приложение',
  ios: 'iOS-приложение',
  webapp: 'Веб-приложение',
  ecommerce: 'Интернет-магазин',
  crm: 'CRM-система',
  other: 'Другое',
};

const BUDGETS = {
  'lt-500': 'До 500 €',
  '500-1000': '500–1 000 €',
  '1000-3000': '1 000–3 000 €',
  '3000-5000': '3 000–5 000 €',
  '5000-10000': '5 000–10 000 €',
  'gt-10000': 'Более 10 000 €',
  undecided: 'Пока не определился',
};

const DEADLINES = {
  asap: 'Как можно скорее',
  '1m': 'До 1 месяца',
  '1-3m': '1–3 месяца',
  '3-6m': '3–6 месяцев',
  flexible: 'Сроки гибкие',
};

const CONTACT_METHODS = {
  email: 'Электронная почта',
  phone: 'Телефонный звонок',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
};

const STATUSES = {
  new: 'Новая',
  review: 'На рассмотрении',
  in_progress: 'В работе',
  done: 'Завершена',
  cancelled: 'Отменена',
};

module.exports = { SERVICES, BUDGETS, DEADLINES, CONTACT_METHODS, STATUSES };
