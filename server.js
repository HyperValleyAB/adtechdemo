require('dotenv').config();

const { createApp } = require('./src/app');

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

if (!process.env.ADMIN_PASSWORD && !process.env.SUPABASE_URL) {
  console.warn('[adtech-demo] ADMIN_PASSWORD is not set. The first login will be impossible until you set it or seed a hash in the auth store. See .env.example.');
}
if (IS_PROD && !process.env.SESSION_SECRET) {
  console.error('[adtech-demo] SESSION_SECRET is required in production. Refusing to start.');
  process.exit(1);
}
if (!IS_PROD && !process.env.SESSION_SECRET) {
  process.env.SESSION_SECRET = 'dev-only-change-me';
  console.warn('[adtech-demo] SESSION_SECRET is not set. Using an insecure dev default. Do not run this in production.');
}

const app = createApp();

app.listen(PORT, () => {
  console.log(`[adtech-demo] listening on http://localhost:${PORT}`);
});
