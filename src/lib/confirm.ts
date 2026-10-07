import { useSyncExternalStore } from 'react';

// Fenêtre de confirmation aux couleurs de Wallo (remplace confirm() du navigateur,
// qui affiche « wallo-b13b0.web.app indique… »). Affichée par <ConfirmHost /> dans App.
//   if (await askConfirm({ title: 'Retirer Kemy ?', confirmLabel: 'Retirer', danger: true })) …

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmLabel?: string; // « Supprimer », « Retirer »… (défaut : « Confirmer »)
  cancelLabel?: string;
  danger?: boolean; // bouton rouge : action qu'on ne peut pas annuler
}

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void };

let current: Pending | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function askConfirm(req: ConfirmRequest): Promise<boolean> {
  current?.resolve(false); // une seule à la fois
  return new Promise((resolve) => {
    current = { ...req, resolve };
    emit();
  });
}

export function answerConfirm(ok: boolean) {
  const c = current;
  current = null;
  emit();
  c?.resolve(ok);
}

export function useConfirmRequest(): Pending | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current
  );
}
