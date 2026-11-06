// Recherches récentes de l'écran Transactions : gardées sur cet appareil seulement (10 au plus)
const KEY = 'ap.searchHistory';
const MAX = 10;

export function readSearches(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* stockage indisponible */
  }
}

// La plus récente en haut ; la même recherche (majuscules comprises) n'apparaît qu'une fois
export function saveSearch(q: string): string[] {
  const t = q.trim();
  if (t.length < 2) return readSearches();
  const list = [t, ...readSearches().filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX);
  write(list);
  return list;
}

export function removeSearch(q: string): string[] {
  const list = readSearches().filter((x) => x !== q);
  write(list);
  return list;
}

export function clearSearches(): string[] {
  write([]);
  return [];
}
