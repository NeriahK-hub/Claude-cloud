// Aperçu de Wallo Pro sur cet appareil : ouvrir l'app avec ?pro=apercu (et ?pro=non pour l'enlever).
// Lu tout de suite au démarrage (main.tsx) : l'adresse est nettoyée ensuite, avant que le Profil se charge.
try {
  const q = new URLSearchParams(window.location.search).get('pro');
  if (q === 'apercu') localStorage.setItem('ap.proPreview', '1');
  if (q === 'non') localStorage.removeItem('ap.proPreview');
} catch {
  // stockage bloqué : pas d'aperçu
}
