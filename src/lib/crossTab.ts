// Wallo ouvert dans plusieurs onglets : chaque onglet garde ses réglages en mémoire.
// Quand un autre onglet enregistre une clé, on la relit ici, sinon on réécrirait
// par-dessus avec une vieille version (icônes perdues, réglages qui reviennent…).
export function onOtherTabChange(key: string, reload: () => void) {
  if (typeof window === 'undefined') return;
  window.addEventListener('storage', (e) => {
    if (e.key === key && e.storageArea === localStorage) reload();
  });
}
