// Auth-store factory. Picks Supabase when env vars are present, otherwise
// falls back to data/auth.json for local development.
//
// Both implementations expose:
//   verifyPassword(plain)    -> Promise<boolean>
//   setPassword(plain)       -> Promise<void>
//   hasStoredPassword()      -> Promise<boolean>
//   passwordSource()         -> Promise<'stored'|'env'|'none'>

const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
module.exports = useSupabase ? require('./auth-store-supabase') : require('./auth-store-json');
