// Assistant Wallo « sur mon ordinateur » : un petit serveur local qui relaie les questions de l'app
// à Claude Code (ton abonnement), puis renvoie la réponse. Lancer : npm run assistant
// - N'écoute que sur cet ordinateur (127.0.0.1) ; seule l'app Wallo y a droit, avec le code affiché.
// - Claude Code tourne dans un dossier à part où l'app range toutes ses données (opérations, budgets…),
//   en lecture seule (outils Read / Grep / Glob) ; le dossier est effacé à l'arrêt.
// - Usage personnel : ton abonnement Claude sert à TES questions, pas à celles d'autres personnes.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.WALLO_PORT) || 8787;
const ORIGINS = new Set([
  'https://wallo-b13b0.web.app',
  'https://wallo-b13b0.firebaseapp.com',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...(process.env.WALLO_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
]);

// Code de connexion : créé une fois, gardé dans ~/.wallo-assistant.json
const FILE = path.join(os.homedir(), '.wallo-assistant.json');
let code;
try {
  code = JSON.parse(fs.readFileSync(FILE, 'utf8')).code;
} catch {
  /* première fois */
}
if (!code) {
  code = randomBytes(4).toString('hex').toUpperCase();
  fs.writeFileSync(FILE, JSON.stringify({ code }), { mode: 0o600 });
}

// Dossier vide où Claude Code travaille (aucun fichier de ton ordinateur à portée)
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'wallo-assistant-'));
// À l'arrêt (Ctrl + C) : les fichiers de données sont effacés de l'ordinateur
const cleanup = () => {
  try {
    fs.rmSync(WORK, { recursive: true, force: true });
  } catch {
    /* déjà effacé */
  }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => process.exit(0));

const RULES = `Tu es l'assistant de Wallo, une app de finances personnelles utilisée en RDC (dollars et francs congolais).
Réponds en français, en tutoyant, simplement, comme à quelqu'un qui n'est pas du métier.
Sois bref : 2 à 6 phrases, ou une courte liste avec des tirets. Pas de titres, pas de tableaux.
Appuie-toi uniquement sur les données ci-dessous. Si une information manque, dis-le simplement.
Écris toujours les montants avec leur devise. Donne des conseils concrets et bienveillants.`;

const FILES_NOTE = `Toutes mes données Wallo sont aussi dans ce dossier, en fichiers (lis-les avec tes outils quand la question le demande) :
- operations.csv : toutes les opérations (date;titre;categorie;categorie_principale;montant;devise;montant_devise_principale;portefeuille;type;avec;compte_dans_les_stats)
- totaux_par_mois.csv : dépenses et revenus par mois et par catégorie principale (en devise principale)
- portefeuilles.json, categories.json, budgets.json, a_venir.json (opérations qui reviennent), dettes.json, ristournes.json, reglages.json
Les montants négatifs sont des sorties. Les transferts et ajustements ne sont pas des dépenses (compte_dans_les_stats = non).`;

function buildPrompt({ question, context, history }, withFiles) {
  const past = (Array.isArray(history) ? history : [])
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Moi' : 'Wallo'} : ${String(m.text).slice(0, 2000)}`)
    .join('\n');
  return `${RULES}\n\n=== RÉSUMÉ ===\n${String(context).slice(0, 40000)}\n\n${withFiles ? `${FILES_NOTE}\n\n` : ''}${past ? `=== CONVERSATION ===\n${past}\n\n` : ''}=== MA QUESTION ===\n${String(question).slice(0, 2000)}`;
}

// Toutes les données envoyées par l'app -> fichiers lisibles dans le dossier de travail (remplacés à chaque question)
function writeData(data) {
  if (!data || typeof data !== 'object') return false;
  const json = (name, v) => fs.writeFileSync(path.join(WORK, name), JSON.stringify(v ?? [], null, 1));
  const settings = data.settings ?? {};
  const main = settings.mainCurrency ?? 'USD';
  const rate = (cur) => (cur === main ? 1 : Number(settings.rates?.[cur]) || 1);
  const cats = Array.isArray(data.categories) ? data.categories : [];
  const wallets = Array.isArray(data.wallets) ? data.wallets : [];
  const catName = (id) => cats.find((c) => c.id === id)?.name ?? '';
  const topName = (id) => {
    const c = cats.find((x) => x.id === id);
    return c?.parentId ? catName(c.parentId) : c?.name ?? '';
  };
  const cell = (v) => String(v ?? '').replace(/[;\n\r]/g, ' ');
  const counts = (t) => t.type !== 'transfer' && t.type !== 'adjustment' && !t.excludeFromReport;

  const txs = (Array.isArray(data.transactions) ? data.transactions : []).slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const rows = ['date;titre;categorie;categorie_principale;montant;devise;montant_devise_principale;portefeuille;type;avec;compte_dans_les_stats'];
  const months = new Map(); // « 2026-10;Alimentation » -> { out, inc }
  for (const t of txs) {
    const inMain = Math.round(Number(t.amount) * rate(t.currency) * 100) / 100;
    const top = topName(t.categoryId) || t.category;
    rows.push(
      [String(t.createdAt).slice(0, 16).replace('T', ' '), t.title, t.category, top, t.amount, t.currency, inMain, wallets.find((w) => w.id === t.walletId)?.name, t.type, t.withPerson, counts(t) ? 'oui' : 'non']
        .map(cell)
        .join(';')
    );
    if (!counts(t)) continue;
    const key = `${String(t.createdAt).slice(0, 7)};${cell(top)}`;
    const m = months.get(key) ?? { out: 0, inc: 0 };
    if (inMain < 0) m.out -= inMain;
    else m.inc += inMain;
    months.set(key, m);
  }
  fs.writeFileSync(path.join(WORK, 'operations.csv'), rows.join('\n'));
  fs.writeFileSync(
    path.join(WORK, 'totaux_par_mois.csv'),
    [`mois;categorie_principale;depenses_${main};revenus_${main}`, ...[...months].sort().map(([k, v]) => `${k};${Math.round(v.out)};${Math.round(v.inc)}`)].join('\n')
  );
  json('portefeuilles.json', wallets);
  json('categories.json', cats);
  json('budgets.json', data.budgets);
  json('a_venir.json', data.recurrings);
  json('dettes.json', data.debtShares);
  json('ristournes.json', data.ristournes);
  json('reglages.json', settings);
  return true;
}

// Une question à la fois (Claude Code n'aime pas tourner en double)
let queue = Promise.resolve();
const ask = (prompt) => {
  const run = queue.then(() => runClaude(prompt));
  queue = run.catch(() => {});
  return run;
};

function runClaude(prompt) {
  return new Promise((resolve, reject) => {
    // Lecture seule : Claude peut lire et chercher dans les fichiers du dossier, rien d'autre
    const child = spawn('claude', ['-p', '--output-format', 'json', '--allowedTools', 'Read', 'Grep', 'Glob'], { cwd: WORK, shell: process.platform === 'win32' });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Claude a mis trop de temps à répondre.'));
    }, 300_000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(new Error(e.code === 'ENOENT' ? 'Claude Code est introuvable sur cet ordinateur : installe-le, puis relance npm run assistant.' : e.message));
    });
    child.on('close', () => {
      clearTimeout(timer);
      try {
        const j = JSON.parse(out);
        if (j.is_error) return reject(new Error(String(j.result || 'Claude a renvoyé une erreur.')));
        return resolve(String(j.result ?? '').trim());
      } catch {
        if (out.trim()) return resolve(out.trim());
        reject(new Error(err.trim().split('\n').pop() || 'Pas de réponse de Claude.'));
      }
    });
    child.stdin.end(prompt);
  });
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (origin && ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'content-type, x-wallo-code');
    res.setHeader('Access-Control-Allow-Private-Network', 'true'); // Chrome : site en ligne -> cet ordinateur
  }
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  };
  if (req.method === 'OPTIONS') return res.writeHead(204).end();
  if (origin && !ORIGINS.has(origin)) return send(403, { error: 'Site non autorisé.' });
  if (String(req.headers['x-wallo-code'] ?? '').toUpperCase() !== code) return send(401, { error: 'Code incorrect.' });

  if (req.method === 'GET' && req.url === '/ping') return send(200, { ok: true });
  if (req.method === 'POST' && req.url === '/ask') {
    let body = '';
    req.on('data', (d) => {
      body += d;
      if (body.length > 50_000_000) req.destroy(); // tout l'historique : quelques Mo au plus
    });
    req.on('end', async () => {
      let data;
      try {
        data = JSON.parse(body);
      } catch {
        return send(400, { error: 'Requête illisible.' });
      }
      if (!data?.question) return send(400, { error: 'Question vide.' });
      const t = Date.now();
      console.log(`→ ${String(data.question).slice(0, 80)}`);
      try {
        const answer = await ask(buildPrompt(data, writeData(data.data)));
        console.log(`  ✓ répondu en ${Math.round((Date.now() - t) / 1000)} s`);
        send(200, { answer });
      } catch (e) {
        console.log(`  ✗ ${e.message}`);
        send(502, { error: e.message });
      }
    });
    return;
  }
  send(404, { error: 'Introuvable.' });
});

server.on('error', (e) => {
  console.error(e.code === 'EADDRINUSE' ? `Le port ${PORT} est déjà utilisé : l'assistant tourne peut-être déjà.` : e.message);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  Assistant Wallo prêt sur cet ordinateur.');
  console.log('');
  console.log(`  Code à coller dans l'app :  ${code}`);
  console.log('');
  console.log("  Laisse cette fenêtre ouverte. Ctrl + C pour arrêter.");
  console.log('');
});
