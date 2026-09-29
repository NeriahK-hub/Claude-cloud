// Adresse et clé publique (« anon ») du projet Supabase.
// La clé anon est faite pour être dans l'app : ce sont les règles d'accès de la base qui protègent
// les données. Ne jamais mettre ici la clé « service_role » / « secret ».
// On peut aussi les fournir par variables d'environnement (fichier .env.local) :
//   VITE_SUPABASE_URL=https://xxxx.supabase.co
//   VITE_SUPABASE_ANON_KEY=eyJ…
export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const cloudConfigured = !!(SUPABASE_URL && SUPABASE_ANON_KEY);
