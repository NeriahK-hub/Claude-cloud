import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search, Plus, Trash2, X, Layers } from 'lucide-react';
import { Category, CategoryType } from '../data/categories';
import { IconBadge, CATEGORY_ICON_CHOICES } from './AppIcon';
import { IconPicker, COLOR_CHOICES } from './IconPicker';
import { SelCheck } from './SelCheck';

interface CategoriesViewProps {
  categories: Category[];
  onBack: () => void;
  onAdd: (cat: Omit<Category, 'id'>) => void;
  onDelete: (id: string) => void;
  onUpdate: (id: string, changes: Omit<Category, 'id'>) => void;
}

const TABS: { id: CategoryType; label: string }[] = [
  { id: 'expense', label: 'Dépense' },
  { id: 'income', label: 'Revenu' },
  { id: 'debt', label: 'Dette / Prêt' },
];

// Rond coloré avec l'icône dedans, ou l'image choisie
export const CategoryIcon: React.FC<{ cat: Category; size?: 'sm' | 'md' | 'lg' }> = ({ cat, size = 'md' }) => (
  <IconBadge icon={cat.icon} image={cat.image} color={cat.color} size={size} />
);

export const CategoriesView: React.FC<CategoriesViewProps> = ({ categories, onBack, onAdd, onDelete, onUpdate }) => {
  const [tab, setTab] = useState<CategoryType>('expense');
  const [query, setQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);

  const ofType = categories.filter((c) => c.type === tab);
  const parents = ofType.filter((c) => !c.parentId);
  const childrenOf = (id: string) => ofType.filter((c) => c.parentId === id);

  // Pendant une recherche, on affiche une liste simple
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ofType.filter((c) => c.name.toLowerCase().includes(q)) : null;
  }, [query, ofType]);

  const Row: React.FC<{ cat: Category; child?: boolean }> = ({ cat, child }) => (
    <button
      onClick={() => setEditing(cat)}
      className={`w-full text-left flex items-center gap-3 py-3 hover:bg-slate-50 cursor-pointer ${child ? 'pl-12 pr-4 relative' : 'px-4'}`}
    >
      {/* Petit trait qui relie l'enfant à son parent */}
      {child && <span className="absolute left-[34px] top-0 bottom-1/2 w-3 border-l-2 border-b-2 border-slate-200 rounded-bl-lg" />}
      <CategoryIcon cat={cat} size={child ? 'sm' : 'md'} />
      <div className="flex-1 min-w-0">
        <div className={`${child ? 'text-sm' : 'text-[15px] font-semibold'} text-slate-900 truncate`}>{cat.name}</div>
        {cat.type === 'debt' && (
          <div className="text-xs text-slate-400">{cat.direction === 'in' ? "L'argent entre" : "L'argent sort"}</div>
        )}
      </div>
      <ChevronRight className="w-4 h-4 text-slate-400" />
    </button>
  );

  return (
    <div className="px-5 pt-4 pb-8 animate-screen">
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} aria-label="Retour" className="w-11 h-11 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-xl font-bold text-slate-900">Catégories</h1>
        <button
          onClick={() => setShowSearch((s) => !s)}
          aria-label="Rechercher"
          className={`w-11 h-11 rounded-full border flex items-center justify-center cursor-pointer ${showSearch ? 'bg-[#D8FB52] border-lime-300' : 'bg-white border-slate-100'}`}
        >
          <Search className="w-4 h-4" />
        </button>
      </div>

      {showSearch && (
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher une catégorie"
          className="w-full mb-4 px-4 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm outline-none focus:ring-2 focus:ring-[#D8FB52]"
        />
      )}

      {/* Onglets */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-200/60 mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`py-2 rounded-xl text-sm font-semibold transition cursor-pointer ${tab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <button
        onClick={() => setShowNew(true)}
        className="w-full mb-4 py-3.5 rounded-3xl bg-white border border-slate-100 text-emerald-700 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-50"
      >
        <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center">
          <Plus className="w-4 h-4" />
        </span>
        Nouvelle catégorie
      </button>

      {/* Liste */}
      {searchResults ? (
        <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-100">
          {searchResults.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-400">Aucune catégorie trouvée</p>
          ) : (
            searchResults.map((cat) => <Row key={cat.id} cat={cat} />)
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {parents.map((p) => (
            <div key={p.id} className="bg-white rounded-3xl border border-slate-100 overflow-hidden">
              <Row cat={p} />
              {childrenOf(p.id).map((child) => (
                <Row key={child.id} cat={child} child />
              ))}
            </div>
          ))}
        </div>
      )}

      {(showNew || editing) && (
        <CategorySheet
          category={editing}
          type={editing?.type ?? tab}
          parents={(editing ? categories.filter((c) => c.type === editing.type && !c.parentId) : parents).filter((p) => p.id !== editing?.id)}
          childCount={editing ? categories.filter((c) => c.parentId === editing.id).length : 0}
          onClose={() => {
            setShowNew(false);
            setEditing(null);
          }}
          onSave={(cat) => {
            if (editing) {
              onUpdate(editing.id, cat);
              // Une catégorie principale rangée dans une autre : ses sous-catégories la suivent
              // (deux niveaux seulement) et prennent la couleur de leur nouveau parent
              if (cat.parentId) {
                for (const { id, ...child } of categories.filter((c) => c.parentId === editing.id)) {
                  onUpdate(id, { ...child, parentId: cat.parentId, color: cat.color });
                }
              }
            } else onAdd(cat);
            setShowNew(false);
            setEditing(null);
          }}
          onDelete={
            editing
              ? () => {
                  onDelete(editing.id);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
};

// ---------- Fenêtre "Nouvelle catégorie" / "Modifier la catégorie" ----------
const COLORS = COLOR_CHOICES;

const CategorySheet: React.FC<{
  category: Category | null; // null = nouvelle
  type: CategoryType;
  parents: Category[];
  childCount: number;
  onClose: () => void;
  onSave: (cat: Omit<Category, 'id'>) => void;
  onDelete?: () => void;
}> = ({ category, type, parents, childCount, onClose, onSave, onDelete }) => {
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? CATEGORY_ICON_CHOICES[0]);
  const [color, setColor] = useState(category?.color ?? COLORS[0]);
  const [parentId, setParentId] = useState(category?.parentId ?? '');
  const [direction, setDirection] = useState<'in' | 'out'>(category?.direction ?? 'out');
  const [image, setImage] = useState<string | undefined>(category?.image);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const parent = parents.find((p) => p.id === parentId);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="w-full sm:max-w-[420px] max-h-[90dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] p-5 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold">{category ? 'Modifier la catégorie' : 'Nouvelle catégorie'}</h2>
          <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <IconBadge icon={icon} image={image} color={parent?.color ?? color} size="lg" />
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom (ex. Coiffeur)"
            className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-[#D8FB52]"
          />
        </div>

        <IconPicker
          choices={CATEGORY_ICON_CHOICES}
          icon={icon}
          image={image}
          color={parent?.color ?? color}
          onIcon={setIcon}
          onImage={setImage}
        />

        {!parent && (
          <>
            <label className="text-xs font-semibold text-slate-500">Couleur</label>
            <div className="flex gap-2 mt-1 mb-4">
              {COLORS.map((col) => (
                <button
                  key={col}
                  onClick={() => setColor(col)}
                  aria-label={`Couleur ${col}`}
                  className={`w-7 h-7 rounded-full cursor-pointer ${color === col ? 'ring-2 ring-offset-2 ring-[var(--sel-ring)]' : ''}`}
                  style={{ backgroundColor: col }}
                />
              ))}
            </div>
          </>
        )}

        {type === 'debt' ? (
          <>
            <label className="text-xs font-semibold text-slate-500">L'argent…</label>
            <div className="grid grid-cols-2 gap-2 mt-1 mb-4">
              {(['out', 'in'] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDirection(d)}
                  className={`py-2.5 rounded-2xl text-sm font-semibold cursor-pointer ${direction === d ? 'bg-[#D8FB52]' : 'bg-slate-100 text-slate-600'}`}
                >
                  {d === 'out' ? 'sort' : 'entre'}
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <label className="text-xs font-semibold text-slate-500">Ranger dans</label>
            <div className="grid grid-cols-3 gap-2 mt-1 mb-2">
              {[null, ...parents].map((p) => {
                const on = (p?.id ?? '') === parentId;
                return (
                  <button
                    key={p?.id ?? 'none'}
                    onClick={() => setParentId(p?.id ?? '')}
                    aria-pressed={on}
                    className={`relative flex flex-col items-center gap-1.5 px-1.5 py-2.5 rounded-2xl cursor-pointer transition ${on ? 'is-selected' : 'bg-slate-100 hover:bg-slate-200'}`}
                  >
                    {p ? (
                      <IconBadge icon={p.icon} image={p.image} color={p.color} size="sm" />
                    ) : (
                      <span className="w-9 h-9 rounded-full bg-white flex items-center justify-center text-slate-400">
                        <Layers className="w-4 h-4" />
                      </span>
                    )}
                    <span className="text-[11px] font-semibold text-slate-700 leading-tight text-center line-clamp-2">
                      {p ? p.name : 'Aucune (principale)'}
                    </span>
                    {on && <SelCheck />}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-400 mb-4">
              {parent
                ? childCount > 0
                  ? `Ses ${childCount} sous-catégorie${childCount > 1 ? 's' : ''} seront aussi rangées dans « ${parent.name} ».`
                  : `Deviendra une sous-catégorie de « ${parent.name} ».`
                : childCount > 0
                  ? `Catégorie principale avec ${childCount} sous-catégorie${childCount > 1 ? 's' : ''}.`
                  : 'Catégorie principale, sans parent.'}
            </p>
          </>
        )}

        <button
          disabled={!name.trim()}
          onClick={() =>
            onSave({
              name: name.trim(),
              type,
              icon,
              image,
              color: parent?.color ?? color,
              parentId: parent?.id,
              direction: type === 'debt' ? direction : undefined,
              custom: category ? category.custom : true,
            })
          }
          className="w-full py-3.5 rounded-2xl bg-[#D8FB52] disabled:opacity-40 font-bold text-sm cursor-pointer"
        >
          {category ? 'Enregistrer' : 'Créer la catégorie'}
        </button>

        {onDelete &&
          (confirmDelete ? (
            <div className="mt-3 p-3 rounded-2xl bg-red-50">
              <p className="text-sm text-slate-700 mb-2">
                Supprimer « {category?.name} »{childCount > 0 ? ` et ses ${childCount} sous-catégorie${childCount > 1 ? 's' : ''}` : ''} ? Tes transactions
                passées gardent leur catégorie.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold cursor-pointer">
                  Annuler
                </button>
                <button onClick={onDelete} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold cursor-pointer">
                  Supprimer
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full mt-2 py-3 rounded-2xl text-red-600 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" /> Supprimer la catégorie
            </button>
          ))}
      </div>
    </div>
  );
};
