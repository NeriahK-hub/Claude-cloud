// Catégories par défaut de l'app.
// Une catégorie peut avoir un "parent" : ex. "Loyer" est rangé sous "Factures".

export type CategoryType = 'expense' | 'income' | 'debt';

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  icon: string; // nom d'une icône lucide (voir AppIcon)
  image?: string; // ou une image choisie par l'utilisateur (prend la place de l'icône)
  color: string; // couleur de l'icône et du rond clair derrière
  parentId?: string;
  direction?: 'in' | 'out'; // seulement pour Dette/Prêt : l'argent entre ou sort ?
  custom?: boolean; // créée par l'utilisateur
}

// Petit raccourci pour écrire la liste plus vite
const c = (
  id: string,
  name: string,
  type: CategoryType,
  icon: string,
  color: string,
  extra: Partial<Category> = {}
): Category => ({ id, name, type, icon, color, ...extra });

export const DEFAULT_CATEGORIES: Category[] = [
  // ---------- DÉPENSES ----------
  c('food', 'Alimentation', 'expense', 'Utensils', '#F97316'),
  c('food-market', 'Marché et courses', 'expense', 'ShoppingCart', '#F97316', { parentId: 'food' }),
  c('food-resto', 'Restaurant', 'expense', 'Utensils', '#F97316', { parentId: 'food' }),
  c('food-drinks', 'Boissons', 'expense', 'CupSoda', '#F97316', { parentId: 'food' }),

  c('transport', 'Transport', 'expense', 'Car', '#EAB308'),
  c('transport-taxi', 'Taxi et bus', 'expense', 'Bus', '#EAB308', { parentId: 'transport' }),
  c('transport-fuel', 'Carburant', 'expense', 'Fuel', '#EAB308', { parentId: 'transport' }),
  c('transport-repair', 'Entretien du véhicule', 'expense', 'Wrench', '#EAB308', { parentId: 'transport' }),

  c('bills', 'Factures', 'expense', 'Receipt', '#64748B'),
  c('bills-rent', 'Loyer', 'expense', 'House', '#64748B', { parentId: 'bills' }),
  c('bills-power', 'Électricité', 'expense', 'Zap', '#64748B', { parentId: 'bills' }),
  c('bills-water', 'Eau', 'expense', 'Droplet', '#64748B', { parentId: 'bills' }),
  c('bills-phone', 'Crédit et data', 'expense', 'Smartphone', '#64748B', { parentId: 'bills' }),
  c('bills-internet', 'Internet', 'expense', 'Wifi', '#64748B', { parentId: 'bills' }),
  c('bills-subs', 'Abonnements', 'expense', 'Tv', '#64748B', { parentId: 'bills' }),

  c('health', 'Santé', 'expense', 'HeartPulse', '#EF4444'),
  c('health-pharma', 'Pharmacie', 'expense', 'Pill', '#EF4444', { parentId: 'health' }),
  c('health-doctor', 'Consultation', 'expense', 'Stethoscope', '#EF4444', { parentId: 'health' }),

  c('education', 'Éducation', 'expense', 'GraduationCap', '#3B82F6'),
  c('education-fees', 'Frais académiques', 'expense', 'School', '#3B82F6', { parentId: 'education' }),
  c('education-books', 'Livres et fournitures', 'expense', 'BookOpen', '#3B82F6', { parentId: 'education' }),
  c('education-courses', 'Formations en ligne', 'expense', 'Laptop', '#3B82F6', { parentId: 'education' }),

  c('shopping', 'Shopping', 'expense', 'ShoppingBag', '#EC4899'),
  c('shopping-clothes', 'Vêtements', 'expense', 'Shirt', '#EC4899', { parentId: 'shopping' }),
  c('shopping-tech', 'Électronique', 'expense', 'Headphones', '#EC4899', { parentId: 'shopping' }),

  c('fun', 'Loisirs', 'expense', 'PartyPopper', '#8B5CF6'),
  c('fun-outings', 'Sorties', 'expense', 'Beer', '#8B5CF6', { parentId: 'fun' }),
  c('fun-gifts', 'Cadeaux offerts', 'expense', 'Gift', '#8B5CF6', { parentId: 'fun' }),

  c('family', 'Famille', 'expense', 'Users', '#14B8A6'),

  c('business', 'Business', 'expense', 'Briefcase', '#16382F'),
  c('business-stock', 'Achat de stock', 'expense', 'Package', '#16382F', { parentId: 'business' }),
  c('business-ads', 'Publicité', 'expense', 'Megaphone', '#16382F', { parentId: 'business' }),
  c('business-tools', 'Outils et logiciels', 'expense', 'Wrench', '#16382F', { parentId: 'business' }),

  c('ristourne-out', 'Ristourne (cotisation)', 'expense', 'Handshake', '#65A30D'),
  c('other-expense', 'Autres dépenses', 'expense', 'CircleHelp', '#94A3B8'),

  // ---------- REVENUS ----------
  c('salary', 'Salaire', 'income', 'Wallet', '#059669'),
  c('biz-income', 'Business', 'income', 'Briefcase', '#16382F'),
  c('biz-sales', 'Ventes', 'income', 'Tag', '#16382F', { parentId: 'biz-income' }),
  c('biz-services', 'Services', 'income', 'Laptop', '#16382F', { parentId: 'biz-income' }),
  c('freelance', 'Petits boulots', 'income', 'Car', '#0EA5E9'),
  c('gifts-in', 'Cadeaux reçus', 'income', 'Gift', '#8B5CF6'),
  c('ristourne-in', 'Ristourne (cagnotte reçue)', 'income', 'Handshake', '#65A30D'),
  c('other-income', 'Autres revenus', 'income', 'Sparkles', '#94A3B8'),

  // ---------- DETTE / PRÊT ----------
  c('loan-given', 'Prêt accordé', 'debt', 'HandCoins', '#F59E0B', { direction: 'out' }),
  c('debt-repay', 'Remboursement de dette', 'debt', 'ArrowUpFromLine', '#F59E0B', { direction: 'out' }),
  c('debt-taken', 'Dette contractée', 'debt', 'ArrowDownToLine', '#0EA5E9', { direction: 'in' }),
  c('loan-back', 'Prêt remboursé', 'debt', 'Banknote', '#0EA5E9', { direction: 'in' }),
];

// Les catégories qu'on peut choisir pour une dépense ou un revenu
export function categoriesFor(mode: 'expense' | 'income' | 'debt', all: Category[]): Category[] {
  if (mode === 'debt') return all.filter((cat) => cat.type === 'debt');
  const direction = mode === 'expense' ? 'out' : 'in';
  return all.filter((cat) => cat.type === mode || (cat.type === 'debt' && cat.direction === direction));
}
