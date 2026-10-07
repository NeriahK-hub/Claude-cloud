import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, Landmark, Banknote, LocateFixed, Search, Navigation, Loader2, MapPin, Clock, ExternalLink } from 'lucide-react';
import { haptic } from '../lib/haptics';

// Banques et distributeurs (ATM) autour de moi, ou autour d'un quartier / d'une ville.
// Données OpenStreetMap (gratuites, sans clé) : Overpass pour les lieux, Nominatim pour trouver un quartier.
// La position n'est demandée qu'au toucher de « Autour de moi » et n'est pas gardée par Wallo.

type Kind = 'bank' | 'atm';
interface Place {
  id: string;
  kind: Kind;
  name: string;
  brand?: string;
  lat: number;
  lon: number;
  distance: number; // mètres
  address?: string;
  hours?: string;
  hasAtm?: boolean; // banque avec distributeur
}
type Filter = 'all' | Kind;

const OVERPASS = 'https://overpass-api.de/api/interpreter';

// Distance à vol d'oiseau (mètres)
function distance(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const km = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`);

async function fetchPlaces(at: { lat: number; lon: number }, radius: number): Promise<Place[]> {
  const around = `(around:${radius},${at.lat},${at.lon})`;
  const query = `[out:json][timeout:25];(nwr["amenity"~"^(bank|atm)$"]${around};nwr["atm"="yes"]${around};);out center tags 150;`;
  const res = await fetch(OVERPASS, { method: 'POST', body: new URLSearchParams({ data: query }) });
  if (!res.ok) throw new Error(res.status === 429 || res.status === 504 ? 'busy' : 'failed');
  const json = (await res.json()) as { elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[] };
  const out: Place[] = [];
  for (const e of json.elements) {
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat === undefined || lon === undefined) continue;
    const t = e.tags ?? {};
    const kind: Kind = t.amenity === 'atm' ? 'atm' : 'bank';
    const brand = t.brand || t.operator || undefined;
    const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    out.push({
      id: `${e.type}/${e.id}`,
      kind,
      name: t.name || brand || (kind === 'atm' ? 'Distributeur' : 'Banque'),
      brand: t.name && brand && brand !== t.name ? brand : undefined,
      lat,
      lon,
      distance: distance(at, { lat, lon }),
      address: street || t['addr:suburb'] || t['addr:city'] || undefined,
      hours: t.opening_hours === '24/7' ? 'Ouvert 24 h/24' : t.opening_hours,
      hasAtm: kind === 'bank' && t.atm === 'yes',
    });
  }
  return out.sort((a, b) => a.distance - b.distance);
}

// Quartier / ville -> coordonnées (priorité à la RDC)
async function geocode(text: string): Promise<{ lat: number; lon: number; label: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=fr&countrycodes=cd&q=${encodeURIComponent(text)}`;
  let res = await fetch(url);
  let list = res.ok ? await res.json() : [];
  if (!list.length) {
    res = await fetch(url.replace('&countrycodes=cd', '')); // pas en RDC : partout
    list = res.ok ? await res.json() : [];
  }
  const r = list[0];
  return r ? { lat: Number(r.lat), lon: Number(r.lon), label: String(r.display_name).split(',').slice(0, 2).join(',') } : null;
}

// Google Maps (appli si elle est installée, sinon le site) : recherche autour de la position.
// Sans coordonnées, Google Maps utilise sa propre position (GPS du téléphone) : « près de moi ».
type Pos = { lat: number; lon: number };
const mapsSearch = (query: string, at: Pos | null) =>
  at
    ? `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${at.lat},${at.lon},15z`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${query} près de moi`)}`;
// Itinéraire : départ = là où l'on se trouve (Google Maps le prend tout seul)
const mapsDirections = (p: Place) => `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}&travelmode=driving`;

// Recherches rapides dans Google Maps
const QUICK: { label: string; query: string }[] = [
  { label: 'Banques', query: 'banque' },
  { label: 'Distributeurs (ATM)', query: 'distributeur automatique ATM' },
  { label: 'Agents Mobile Money', query: 'agent mobile money M-Pesa Orange Money Airtel Money' },
  { label: 'Rawbank', query: 'Rawbank' },
  { label: 'Equity BCDC', query: 'Equity BCDC' },
  { label: 'TMB', query: 'Trust Merchant Bank' },
  { label: 'Ecobank', query: 'Ecobank' },
  { label: 'UBA', query: 'UBA banque' },
];

export const PlacesView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [where, setWhere] = useState(''); // « près de toi » ou le quartier trouvé
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'locating' | 'loading'>('idle');
  const [error, setError] = useState('');
  const [area, setArea] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [nameQuery, setNameQuery] = useState('');
  // Position déjà autorisée : on la prend tout de suite (sans rien demander) pour centrer Google Maps
  const [here, setHere] = useState<Pos | null>(null);
  useEffect(() => {
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        if (p.state === 'granted')
          navigator.geolocation.getCurrentPosition((pos) => setHere({ lat: pos.coords.latitude, lon: pos.coords.longitude }), () => {}, { maximumAge: 120000 });
      })
      .catch(() => {});
  }, []);
  const mapsAt = here ?? (where === 'Près de toi' ? center : null);

  // Cherche autour d'un point : 3 km, puis 10 km s'il y a trop peu de résultats
  const search = async (at: { lat: number; lon: number }, label: string) => {
    setStatus('loading');
    setError('');
    setCenter(at);
    try {
      let list = await fetchPlaces(at, 3000);
      if (list.length < 5) list = await fetchPlaces(at, 10000);
      setPlaces(list);
      setWhere(label);
      haptic('success');
    } catch (e) {
      setError(
        !navigator.onLine
          ? 'Pas de connexion internet. Réessaie quand tu es connecté.'
          : (e as Error).message === 'busy'
            ? 'Le service de cartes est très sollicité. Réessaie dans un instant.'
            : "La recherche n'a pas marché. Réessaie dans un instant."
      );
    } finally {
      setStatus('idle');
    }
  };

  const nearMe = () => {
    if (!('geolocation' in navigator)) return setError("Ce téléphone ne donne pas sa position. Tape plutôt un quartier ou une ville.");
    setStatus('locating');
    setError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const at = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setHere(at);
        search(at, 'Près de toi');
      },
      (err) => {
        setStatus('idle');
        setError(
          err.code === err.PERMISSION_DENIED
            ? "Wallo n'a pas accès à ta position. Autorise-la dans les réglages du téléphone, ou tape un quartier ou une ville."
            : "Position introuvable pour l'instant. Réessaie, ou tape un quartier ou une ville."
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const searchArea = async () => {
    const text = area.trim();
    if (!text) return;
    setStatus('loading');
    setError('');
    try {
      const found = await geocode(text);
      if (!found) {
        setStatus('idle');
        return setError(`Lieu « ${text} » introuvable. Essaie par exemple « Gombe, Kinshasa » ou « Lubumbashi ».`);
      }
      await search(found, found.label);
    } catch {
      setStatus('idle');
      setError('La recherche n\'a pas marché. Vérifie ta connexion et réessaie.');
    }
  };

  const shown = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    return (places ?? []).filter(
      (p) =>
        (filter === 'all' || p.kind === filter || (filter === 'atm' && p.hasAtm)) &&
        (!q || p.name.toLowerCase().includes(q) || (p.brand ?? '').toLowerCase().includes(q))
    );
  }, [places, filter, nameQuery]);

  const busy = status !== 'idle';
  const counts = { bank: places?.filter((p) => p.kind === 'bank').length ?? 0, atm: places?.filter((p) => p.kind === 'atm' || p.hasAtm).length ?? 0 };

  return (
    <div className="w-full px-5 pt-3 pb-28 animate-screen">
      <div className="page-head flex items-center gap-3 mb-4">
        <button onClick={onBack} aria-label="Retour" className="w-11 h-11 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">Banques et distributeurs</h1>
      </div>

      {/* Google Maps : l'appli cherche autour de toi */}
      <div className="bg-white rounded-3xl border border-slate-100 p-4 mb-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <MapPin className="w-4 h-4 text-emerald-600" /> Ouvrir dans Google Maps
        </div>
        <p className="text-xs text-slate-500 mt-0.5 mb-3">
          {here ? 'Autour de ta position actuelle.' : 'Google Maps cherche autour de toi (autorise la position dans Google Maps).'}
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <a
              key={q.label}
              href={mapsSearch(q.query, mapsAt)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800 inline-flex items-center gap-1.5"
            >
              {q.label} <ExternalLink className="w-3 h-3 text-slate-400" />
            </a>
          ))}
        </div>
      </div>

      <div className="text-xs font-semibold text-slate-500 mb-2 px-1">Ou voir la liste dans Wallo</div>
      {/* Où chercher */}
      <div className="bg-white rounded-3xl border border-slate-100 p-4 mb-3">
        <button
          onClick={nearMe}
          disabled={busy}
          className="w-full py-3 rounded-2xl bg-accent text-slate-900 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {status === 'locating' ? <Loader2 className="w-4 h-4 animate-spin" /> : <LocateFixed className="w-4 h-4" />}
          {status === 'locating' ? 'Recherche de ta position…' : 'Autour de moi'}
        </button>
        <div className="flex items-center gap-3 my-3 text-xs text-slate-400">
          <span className="flex-1 h-px bg-slate-200" /> ou <span className="flex-1 h-px bg-slate-200" />
        </div>
        <div className="flex gap-2">
          <input
            value={area}
            onChange={(e) => setArea(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchArea()}
            placeholder="Quartier ou ville (ex. Gombe, Kinshasa)"
            className="flex-1 min-w-0 px-4 py-2.5 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={searchArea}
            disabled={busy || !area.trim()}
            aria-label="Chercher"
            className="w-11 h-11 shrink-0 rounded-2xl bg-slate-900 text-white flex items-center justify-center cursor-pointer disabled:opacity-40"
          >
            {status === 'loading' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>

      {places && (
        <>
          <div className="flex items-center justify-between gap-2 mb-2 px-1">
            <span className="text-xs font-semibold text-slate-500 truncate">
              <MapPin className="w-3.5 h-3.5 inline -mt-0.5 mr-1" />
              {where} · {places.length} lieu{places.length > 1 ? 'x' : ''}
            </span>
          </div>
          <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar">
            {(
              [
                ['all', `Tout (${places.length})`],
                ['bank', `Banques (${counts.bank})`],
                ['atm', `Distributeurs (${counts.atm})`],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                aria-pressed={filter === id}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap cursor-pointer ${
                  filter === id ? 'bg-accent text-slate-900' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {places.length > 6 && (
            <input
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Filtrer par nom (ex. Rawbank, Equity, TMB)"
              className="w-full mb-3 px-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-accent"
            />
          )}

          {shown.length === 0 ? (
            <div className="py-10 text-center text-slate-400">
              <p className="text-sm font-medium">Aucun résultat ici</p>
              <p className="text-xs mt-1">Les lieux viennent d'OpenStreetMap : certains peuvent manquer.</p>
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-slate-100 p-2 divide-y divide-slate-100">
              {shown.map((p) => {
                const Icon = p.kind === 'atm' ? Banknote : Landmark;
                return (
                  <div key={p.id} className="flex items-center gap-3 p-2.5">
                    <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${p.kind === 'atm' ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}>
                      <Icon className="w-5 h-5" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">{p.name}</div>
                      <div className="text-xs text-slate-500 truncate">
                        {km(p.distance)} · {p.kind === 'atm' ? 'Distributeur' : p.hasAtm ? 'Banque · distributeur' : 'Banque'}
                        {p.brand && ` · ${p.brand}`}
                      </div>
                      {(p.address || p.hours) && (
                        <div className="text-xs text-slate-400 truncate">
                          {p.hours && <Clock className="w-3 h-3 inline -mt-0.5 mr-1" />}
                          {[p.hours, p.address].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <a
                      href={mapsDirections(p)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 h-9 px-3 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800 flex items-center gap-1.5"
                    >
                      <Navigation className="w-3.5 h-3.5" /> Itinéraire
                    </a>
                  </div>
                );
              })}
            </div>
          )}

          {center && (
            <a
              href={mapsSearch('banque ATM', center)}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-1.5 text-sm font-bold text-emerald-700"
            >
              Voir aussi sur Google Maps <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </>
      )}

      <p className="text-[12px] text-slate-400 text-center mt-5 leading-relaxed">
        Ta position sert seulement à cette recherche : elle est envoyée à OpenStreetMap et n'est pas gardée par Wallo.
        <br />
        Données © contributeurs OpenStreetMap.
      </p>
    </div>
  );
};
