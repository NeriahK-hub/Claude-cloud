// Edge Function Supabase : envoie les notifications en attente (table push_queue) aux téléphones abonnés.
// Appelée chaque minute par pg_cron (voir supabase/push_cron.sql), avec l'en-tête x-push-secret.
//
// Secrets (supabase secrets set …) — jamais dans le code ni dans .env :
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY : générées avec « npx web-push generate-vapid-keys »
//   VAPID_SUBJECT : mailto:ton.adresse@exemple.com (contact pour Apple / Google)
//   PUSH_SECRET : mot de passe partagé avec pg_cron (une longue chaîne au hasard)
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

interface QueueRow {
  id: number;
  user_id: string;
  title: string;
  body: string;
  tag: string | null;
  url: string;
}
interface Subscription {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

const env = (k: string) => Deno.env.get(k) ?? '';

Deno.serve(async (req) => {
  const secret = env('PUSH_SECRET');
  if (!secret || req.headers.get('x-push-secret') !== secret) {
    return new Response('Non autorisé', { status: 401 });
  }
  webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:contact@wallo.app', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'));
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });

  // Test (diagnostic) : { "test": true } envoie une notification à chaque appareil et renvoie la réponse
  // du service push (Apple, Google…) pour chacun
  const input = await req.json().catch(() => ({}));
  if (input?.test) {
    const { data: all } = await sb.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth');
    const results = [];
    for (const s of (all ?? []) as Subscription[]) {
      const host = new URL(s.endpoint).host;
      try {
        const r = await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({ title: 'Test Wallo', body: 'Si tu lis ceci, les notifications push marchent 🎉', tag: 'test', url: '/' }),
          { TTL: 60 * 60 },
        );
        results.push({ host, status: r.statusCode });
      } catch (e) {
        const err = e as { statusCode?: number; body?: string; message?: string };
        results.push({ host, status: err.statusCode ?? null, error: err.body || err.message });
      }
    }
    return Response.json({ results });
  }

  const { data: rows, error } = await sb.rpc('claim_push_queue', { p_limit: 500 });
  if (error) return new Response(error.message, { status: 500 });
  const queue = (rows ?? []) as QueueRow[];
  if (queue.length === 0) return Response.json({ sent: 0 });

  // Plusieurs notifications d'un même sujet pour une personne (ex. 5 opérations dans « Maison ») :
  // une seule, la plus récente, avec le nombre
  const groups = new Map<string, QueueRow[]>();
  for (const row of queue) {
    const key = `${row.user_id}|${row.tag ?? row.id}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const users = [...new Set(queue.map((r) => r.user_id))];
  const { data: subs } = await sb.from('push_subscriptions').select('id, user_id, endpoint, p256dh, auth').in('user_id', users);
  const byUser = new Map<string, Subscription[]>();
  for (const s of (subs ?? []) as Subscription[]) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  let sent = 0;
  const gone: string[] = [];
  await Promise.all(
    [...groups.values()].map(async (list) => {
      const last = list[list.length - 1];
      const more = list.length - 1;
      const payload = JSON.stringify({
        title: last.title,
        body: more > 0 ? `${last.body} (et ${more} autre${more > 1 ? 's' : ''})` : last.body,
        tag: last.tag ?? undefined,
        url: last.url || '/',
      });
      for (const s of byUser.get(last.user_id) ?? []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
          sent++;
        } catch (e) {
          const err = e as { statusCode?: number; body?: string; message?: string };
          const code = err.statusCode;
          console.error('push refusé', new URL(s.endpoint).host, code, err.body || err.message); // visible dans Edge Functions › Logs
          if (code === 404 || code === 410) gone.push(s.id); // appareil désabonné ou app supprimée
        }
      }
    }),
  );
  if (gone.length) await sb.from('push_subscriptions').delete().in('id', gone);

  return Response.json({ sent, removed: gone.length });
});
