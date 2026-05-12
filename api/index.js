// Vercel serverless entry point. Vercel wraps this file as a serverless
// function and routes everything to it (see vercel.json).
//
// We export the bare Express app — Vercel's Node runtime accepts a
// (req, res) handler, which Express apps are.

const { createApp } = require('../src/app');

if (!process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET env var is required.');
}

module.exports = createApp();
