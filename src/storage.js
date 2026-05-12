// Storage factory. Picks the Supabase implementation when both env vars are
// present, otherwise falls back to the local JSON file (good for local dev).
//
// Both implementations expose the same async interface:
//   listDemos({ search }) -> Promise<Demo[]>
//   getById(id)           -> Promise<Demo|null>
//   getBySlug(slug)       -> Promise<Demo|null>
//   createDemo(input)     -> Promise<Demo>
//   updateDemo(id, input) -> Promise<Demo|null>
//   deleteDemo(id)        -> Promise<boolean>
//   duplicateDemo(id)     -> Promise<Demo|null>
//   setStatus(id, status) -> Promise<Demo|null>
//   emptyDemo()           -> Demo
// And constants TEMPLATES, STATUSES, SCRIPT_FIELDS.

const useSupabase = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const impl = useSupabase ? require('./storage-supabase') : require('./storage-json');

console.log(`[storage] using ${useSupabase ? 'Supabase' : 'local JSON'} backend.`);

module.exports = impl;
