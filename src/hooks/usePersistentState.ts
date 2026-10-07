import { useEffect, useState } from 'react';

// Comme useState, mais la valeur est gardée dans le navigateur (localStorage).
// Si la donnée est absente ou illisible, on repart de la valeur par défaut.
// Les autres onglets de l'app suivent les changements (événement « storage »).
export function usePersistentState<T>(key: string, defaultValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? defaultValue : (JSON.parse(raw) as T);
    } catch {
      return defaultValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // stockage plein ou bloqué : l'app continue de marcher, sans sauvegarde
    }
  }, [key, value]);

  // Wallo ouvert dans un autre onglet : on reprend ce qu'il vient d'enregistrer. Sinon chaque onglet
  // garde sa propre version, écrase celle de l'autre, et la synchro croit à des ajouts ou suppressions.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.storageArea !== localStorage) return;
      try {
        setValue(e.newValue === null ? defaultValue : (JSON.parse(e.newValue) as T));
      } catch {
        // valeur illisible : on garde la nôtre
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return [value, setValue] as const;
}
