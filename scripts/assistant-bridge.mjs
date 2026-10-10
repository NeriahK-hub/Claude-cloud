// Assistant Wallo « sur mon ordinateur » : un petit serveur local qui relaie les questions de l'app
// à Claude Code (ton abonnement), puis renvoie la réponse. Lancer : npm run assistant
// - N'écoute que sur cet ordinateur (127.0.0.1) ; seule l'app Wallo y a droit, avec le code affiché.
// - Claude Code tourne dans un dossier vide : il ne voit que le résumé envoyé par l'app.
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

const RULES = `Tu es l'assistant de Wallo, une app de finances personnelles utilisée en RDC (dollars et francs congolais).
Réponds en français, en tutoyant, simplement, comme à quelqu'un qui n'est pas du métier.
Sois bref : 2 à 6 phrases, ou une courte liste avec des tirets. Pas de titres, pas de tableaux.
Appuie-toi uniquement sur les données ci-dessous. Si une information manque, dis-le simplement.
Écris toujours les montants avec leur devise. Donne des conseils concrets et bienveillants.`;

function buildPrompt({ question, context, history }) {
  const past = (Array.isArray(history) ? history : [])
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Moi' : 'Wallo'} : ${String(m.text).slice(0, 2000)}`)
    .join('\n');
  return `${RULES}\n\n=== MES DONNÉES ===\n${String(context).slice(0, 40000)}\n\n${past ? `=== CONVERSATION ===\n${past}\n\n` : ''}=== MA QUESTION ===\n${String(question).slice(0, 2000)}`;
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
    const child = spawn('claude', ['-p', '--output-format', 'json'], { cwd: WORK, shell: process.platform === 'win32' });
    let out = '';
    let err = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('Claude a mis trop de temps à répondre.'));
    }, 180_000);
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
      if (body.length > 200_000) req.destroy();
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
        const answer = await ask(buildPrompt(data));
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
