import { useEffect, useState } from 'react';

// Comme useState, mais la valeur est gardée dans le navigateur (localStorage).
// Si la donnée est absente ou illisible, on repart de la valeur par défaut.
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

  return [value, setValue] as const;
}
