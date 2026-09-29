import { lazy } from 'react';

// Écrans secondaires chargés seulement quand on les ouvre : l'app démarre plus vite
// (l'accueil, les portefeuilles et la barre du bas restent dans le chargement initial).
export const TransactionHistoryView = lazy(() => import('./TransactionHistoryView').then((m) => ({ default: m.TransactionHistoryView })));
export const StatisticView = lazy(() => import('./StatisticView').then((m) => ({ default: m.StatisticView })));
export const SettingsView = lazy(() => import('./SettingsView').then((m) => ({ default: m.SettingsView })));
export const ProfileView = lazy(() => import('./ProfileView').then((m) => ({ default: m.ProfileView })));
export const RistourneView = lazy(() => import('./RistourneView').then((m) => ({ default: m.RistourneView })));
export const CategoriesView = lazy(() => import('./CategoriesView').then((m) => ({ default: m.CategoriesView })));
export const BudgetsView = lazy(() => import('./BudgetsView').then((m) => ({ default: m.BudgetsView })));
export const DebtsView = lazy(() => import('./DebtsView').then((m) => ({ default: m.DebtsView })));
