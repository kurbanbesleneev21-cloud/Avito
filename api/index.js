'use strict';

// Vercel serverless entry: every non-static request is routed here (see vercel.json).
const { createApp } = require('../server/index');

const { app } = createApp();

module.exports = (req, res) => {
  // Vercel's Node helpers pre-define a lazy, read-only req.body; Express/multer need to own it.
  try { Object.defineProperty(req, 'body', { value: undefined, writable: true, configurable: true, enumerable: true }); } catch { /* not defined */ }
  return app(req, res);
};
