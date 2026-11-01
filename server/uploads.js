'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const config = require('./config');

// Allow-list: extension -> { mime, magic check }. SVG/HTML deliberately excluded (script injection).
const startsWith = (buf, bytes, offset = 0) => bytes.every((b, i) => buf[offset + i] === b);
const isZip = (b) => startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
const isTextLike = (b) => {
  const sample = b.subarray(0, 4096);
  return !sample.includes(0) && Buffer.from(sample).toString('utf8').indexOf('�') === -1;
};

const TYPES = {
  '.jpg':  { mime: 'image/jpeg', check: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  '.jpeg': { mime: 'image/jpeg', check: (b) => startsWith(b, [0xff, 0xd8, 0xff]) },
  '.png':  { mime: 'image/png', check: (b) => startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  '.gif':  { mime: 'image/gif', check: (b) => startsWith(b, [0x47, 0x49, 0x46, 0x38]) },
  '.webp': { mime: 'image/webp', check: (b) => startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8) },
  '.pdf':  { mime: 'application/pdf', check: (b) => startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) },
  '.docx': { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', check: isZip },
  '.xlsx': { mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', check: isZip },
  '.pptx': { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', check: isZip },
  '.txt':  { mime: 'text/plain', check: isTextLike },
};

const ALLOWED_EXTENSIONS = Object.keys(TYPES);

class UploadError extends Error {
  constructor(message) { super(message); this.status = 400; this.expose = true; }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: config.uploads.maxFiles,
    fileSize: config.uploads.maxFileSize,
    fields: 40,
    fieldSize: 16 * 1024,
    parts: 50,
  },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!TYPES[ext]) return cb(new UploadError(`Недопустимый тип файла: ${ext || 'без расширения'}`));
    cb(null, true);
  },
});

// Multer stores latin1-decoded names; recover UTF-8 and make them safe for display/headers.
function sanitizeOriginalName(name) {
  let decoded = name;
  try { decoded = Buffer.from(name, 'latin1').toString('utf8'); } catch { /* keep */ }
  const base = path.basename(decoded).replace(/[\u0000-\u001f\u007f"\\/<>:|?*]/g, '_').trim();
  return (base || 'file').slice(0, 150);
}

// Validate content signatures and persist under random names outside the web root.
async function persistFiles(files = []) {
  const prepared = [];
  for (const file of files) {
    const ext = path.extname(file.originalname).toLowerCase();
    const type = TYPES[ext];
    if (!type || !type.check(file.buffer)) {
      throw new UploadError(`Файл «${sanitizeOriginalName(file.originalname)}» повреждён или не соответствует своему расширению`);
    }
    prepared.push({
      storedName: `${crypto.randomUUID()}${ext}`,
      originalName: sanitizeOriginalName(file.originalname),
      mime: type.mime,
      size: file.size,
      buffer: file.buffer,
    });
  }
  const written = [];
  try {
    for (const f of prepared) {
      await fs.writeFile(path.join(config.uploadDir, f.storedName), f.buffer, { flag: 'wx', mode: 0o600 });
      written.push(f.storedName);
    }
  } catch (err) {
    await removeFiles(written);
    throw err;
  }
  return prepared.map(({ buffer, ...meta }) => meta);
}

async function removeFiles(storedNames) {
  await Promise.all(storedNames.map((n) => fs.unlink(path.join(config.uploadDir, n)).catch(() => {})));
}

function resolveStoredPath(storedName) {
  // storedName comes from DB, but still guard against traversal.
  if (!/^[0-9a-f-]{36}\.[a-z]{3,4}$/.test(storedName)) return null;
  return path.join(config.uploadDir, storedName);
}

module.exports = { upload, persistFiles, removeFiles, resolveStoredPath, UploadError, ALLOWED_EXTENSIONS };
