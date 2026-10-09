import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LayoutDashboard, Users, Megaphone, Shapes, ToggleRight, LogOut, ShieldAlert, RectangleHorizontal, ArrowRightLeft, MessageSquareHeart, BarChart3, LifeBuoy, Sparkles } from 'lucide-react';
import { api, configured, errorText, sb } from './api';
import { Button, ErrorLine, inputCls, Loading } from './ui';
import { Dashboard } from './pages/Dashboard';
import { UsersPage } from './pages/Users';
import { AnnouncementsPage } from './pages/Announcements';
import { IconsPage } from './pages/Icons';
import { FeaturesPage } from './pages/Features';
import { AdsPage } from './pages/Ads';
import { RatesPage } from './pages/Rates';
import { FeedbackPage } from './pages/Feedback';
import { UsagePage } from './pages/Usage';
import { HelpPage } from './pages/Help';
import { ProPage } from './pages/Pro';

type Tab = 'dashboard' | 'usage' | 'users' | 'feedback' | 'announcements' | 'help' | 'rates' | 'ads' | 'icons' | 'pro' | 'features';

const TABS: { id: Tab; label: string; Icon: typeof Users }[] = [
  { id: 'dashboard', label: 'Tableau de bord', Icon: LayoutDashboard },
  { id: 'usage', label: 'Usage', Icon: BarChart3 },
  { id: 'users', label: 'Comptes', Icon: Users },
  { id: 'feedback', label: 'Avis', Icon: MessageSquareHeart },
  { id: 'announcements', label: 'Annonces', Icon: Megaphone },
  { id: 'help', label: 'Aide', Icon: LifeBuoy },
  { id: 'rates', label: 'Taux du jour', Icon: ArrowRightLeft },
  { id: 'ads', label: 'Publicités', Icon: RectangleHorizontal },
  { id: 'icons', label: 'Icônes', Icon: Shapes },
  { id: 'pro', label: 'Wallo Pro', Icon: Sparkles },
  { id: 'features', label: 'Fonctionnalités', Icon: ToggleRight },
];

export const AdminApp: React.FC = () => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>(() => (TABS.find((t) => `#${t.id}` === location.hash)?.id ?? 'dashboard'));

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  // Connecté : est-ce bien un administrateur ?
  useEffect(() => {
    if (!session) return setAdmin(null);
    api.isAdmin().then(setAdmin).catch((e) => {
      setError(errorText(e));
      setAdmin(false);
    });
  }, [session?.user.id]);

  useEffect(() => {
    history.replaceState(null, '', `#${tab}`);
  }, [tab]);

  if (!configured) return <Centered><p className="text-[15px]">Clés Supabase absentes : ajoute-les dans le fichier .env (comme pour Wallo).</p></Centered>;
  if (session === undefined) return <Centered><Loading /></Centered>;
  if (!session) return <Login />;
  if (admin === null) return <Centered><Loading /></Centered>;
  if (!admin)
    return (
      <Centered>
        <ShieldAlert className="w-8 h-8 text-amber-500 mx-auto mb-3" />
        <h1 className="text-[20px] font-semibold text-center">Accès réservé</h1>
        <p className="text-[15px] text-slate-500 text-center mt-1">
          {session.user.email} n'est pas administrateur de Wallo.
        </p>
        <ErrorLine text={error} />
        <Button className="w-full mt-5" onClick={() => sb.auth.signOut()}>
          Changer de compte
        </Button>
      </Centered>
    );

  return (
    <div className="min-h-dvh md:flex">
      {/* Menu : colonne à gauche sur ordinateur, barre en haut sur téléphone */}
      <aside className="md:w-60 md:shrink-0 md:h-dvh md:sticky md:top-0 border-b md:border-b-0 md:border-r border-slate-200/70 dark:border-white/5 bg-white dark:bg-[#11151b] p-3 md:p-4 flex md:flex-col gap-3">
        <div className="hidden md:flex items-center gap-2.5 px-2 mb-4">
          <img src="/wallo.svg" alt="" className="w-8 h-8" />
          <div>
            <div className="text-[15px] font-semibold leading-tight">Wallo</div>
            <div className="text-[12px] text-slate-500">Administration</div>
          </div>
        </div>
        <nav className="flex md:flex-col gap-1 overflow-x-auto flex-1">
          {TABS.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-xl text-[14px] font-medium cursor-pointer transition ${
                tab === id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
        <div className="hidden md:block px-2 text-[12px] text-slate-500 truncate">{session.user.email}</div>
        <button
          onClick={() => sb.auth.signOut()}
          aria-label="Se déconnecter"
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-[14px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden md:inline">Se déconnecter</span>
        </button>
      </aside>

      <main className="flex-1 min-w-0 p-4 md:p-8 max-w-5xl">
        <h1 className="text-[28px] font-bold tracking-tight mb-5">{TABS.find((t) => t.id === tab)?.label}</h1>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'usage' && <UsagePage />}
        {tab === 'help' && <HelpPage />}
        {tab === 'users' && <UsersPage me={session.user.id} />}
        {tab === 'feedback' && <FeedbackPage />}
        {tab === 'announcements' && <AnnouncementsPage />}
        {tab === 'rates' && <RatesPage />}
        {tab === 'ads' && <AdsPage />}
        {tab === 'icons' && <IconsPage />}
        {tab === 'pro' && <ProPage />}
        {tab === 'features' && <FeaturesPage />}
      </main>
    </div>
  );
};

const Centered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-dvh flex items-center justify-center p-4">
    <div className="w-full max-w-sm bg-white dark:bg-[#151a21] rounded-3xl border border-slate-200/70 dark:border-white/5 p-6">{children}</div>
  </div>
);

// Connexion par code reçu par e-mail (seulement des comptes qui existent déjà)
const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await sb.auth.signInWithOtp({ email: email.trim(), options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/` } });
    setBusy(false);
    if (err) setError(loginError(err.message));
    else setStep('code');
  };
  // Google : aucun e-mail envoyé (pas de limite d'envoi). Seul un compte admin passe ensuite.
  const google = async () => {
    setError('');
    const { error: err } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/` } });
    if (err) setError(loginError(err.message));
  };
  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error: err } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' });
    setBusy(false);
    if (err) setError('Code incorrect ou expiré.');
  };

  return (
    <Centered>
      <img src="/wallo.svg" alt="" className="w-12 h-12 mx-auto mb-3" />
      <h1 className="text-[22px] font-bold text-center tracking-tight">Wallo Admin</h1>
      <p className="text-[14px] text-slate-500 text-center mt-1 mb-5">
        {step === 'email'
          ? 'Connecte-toi avec ton compte Wallo administrateur.'
          : `E-mail envoyé à ${email.trim()}. Ouvre son lien « Sign in » dans ce navigateur, ou tape le code s'il y en a un.`}
      </p>
      {step === 'email' && (
        <>
          <Button onClick={google} className="w-full py-2.5 mb-3">
            <GoogleLogo /> Continuer avec Google
          </Button>
          <div className="flex items-center gap-3 mb-3 text-[12px] text-slate-400">
            <span className="flex-1 h-px bg-slate-200 dark:bg-white/10" /> ou par e-mail <span className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
          </div>
        </>
      )}
      {step === 'email' ? (
        <form onSubmit={send} className="space-y-3">
          <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse e-mail" className={inputCls} />
          <Button kind="primary" type="submit" busy={busy} className="w-full py-2.5">
            Recevoir un code
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="space-y-3">
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="Code à 6 chiffres"
            className={`${inputCls} text-center tracking-[0.3em] tabular-nums`}
          />
          <Button kind="primary" type="submit" busy={busy} className="w-full py-2.5">
            Se connecter
          </Button>
          <button type="button" onClick={() => setStep('email')} className="w-full text-[13px] text-slate-500 cursor-pointer">
            Changer d'adresse
          </button>
        </form>
      )}
      <ErrorLine text={error} />
    </Centered>
  );
};

function loginError(m: string): string {
  if (/rate limit|too many/i.test(m)) return "Trop d'e-mails envoyés pour l'instant (limite de Supabase). Réessaie dans une heure, ou continue avec Google.";
  if (/not found|signups not allowed/i.test(m)) return 'Aucun compte Wallo avec cette adresse.';
  if (/provider is not enabled|unsupported provider/i.test(m)) return "La connexion Google n'est pas activée dans Supabase.";
  return errorText(m);
}

const GoogleLogo = () => (
  <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden>
    <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.2.8 3.9 1.5l2.7-2.6C16.9 3.1 14.7 2 12 2 6.5 2 2 6.5 2 12s4.5 10 10 10c5.8 0 9.6-4.1 9.6-9.8 0-.7-.1-1.2-.2-1.7H12z" />
    <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.2-.2-1.7H12v3.9h5.5c-.3 1.4-1.1 2.5-2.3 3.3l3.6 2.8c2.1-2 3.3-4.9 3.3-8.3z" />
    <path fill="#FBBC05" d="M6.1 14.3c-.2-.7-.4-1.4-.4-2.3s.1-1.6.4-2.3L2.4 6.9C1.5 8.4 1 10.2 1 12s.5 3.6 1.4 5.1l3.7-2.8z" />
    <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.8-2.5l-3.6-2.8c-.9.6-2.1 1.1-3.2 1.1-2.5 0-4.6-1.7-5.4-4l-3.7 2.8C4.6 19.8 8 22 12 22z" />
  </svg>
);
