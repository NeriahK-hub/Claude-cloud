import React from 'react';
import { useCustomIcons } from '../lib/customIcons';
import {
  Utensils, ShoppingCart, Bus, Fuel, Receipt, House, Zap, Droplet, Smartphone, Wifi, Tv, Pill,
  Stethoscope, GraduationCap, BookOpen, ShoppingBag, Shirt, PartyPopper, Gift, Users, Briefcase,
  Package, Megaphone, Wrench, Handshake, Wallet, Banknote, HandCoins, ArrowUpFromLine,
  ArrowDownToLine, CircleHelp, CupSoda, Car, HeartPulse, School, Laptop, Headphones, Beer, Tag,
  Sparkles, CircleCheck, Landmark, CreditCard, PiggyBank, Coins, Store, PawPrint, Church,
  Scissors, Dumbbell, Plane, Gamepad2, Baby, Heart, Coffee, Music, Target, ArrowLeftRight, SlidersHorizontal,
  Layers, LucideIcon,
} from 'lucide-react';

// Table de correspondance explicite : nom (texte sauvegardé) -> icône lucide
export const ICONS: Record<string, LucideIcon> = {
  Utensils, ShoppingCart, Bus, Fuel, Receipt, House, Zap, Droplet, Smartphone, Wifi, Tv, Pill,
  Stethoscope, GraduationCap, BookOpen, ShoppingBag, Shirt, PartyPopper, Gift, Users, Briefcase,
  Package, Megaphone, Wrench, Handshake, Wallet, Banknote, HandCoins, ArrowUpFromLine,
  ArrowDownToLine, CircleHelp, CupSoda, Car, HeartPulse, School, Laptop, Headphones, Beer, Tag,
  Sparkles, CircleCheck, Landmark, CreditCard, PiggyBank, Coins, Store, PawPrint, Church,
  Scissors, Dumbbell, Plane, Gamepad2, Baby, Heart, Coffee, Music, Target, ArrowLeftRight, SlidersHorizontal,
};

// Icônes proposées dans les grilles de choix
export const CATEGORY_ICON_CHOICES = [
  'Utensils', 'ShoppingCart', 'Bus', 'Car', 'Fuel', 'House', 'Zap', 'Smartphone', 'Pill', 'GraduationCap',
  'Shirt', 'Gift', 'Briefcase', 'Package', 'PawPrint', 'Church', 'Scissors', 'Dumbbell', 'Plane', 'Gamepad2',
  'Baby', 'Heart', 'Coffee', 'Music', 'Wallet', 'Handshake',
];
export const WALLET_ICON_CHOICES = [
  'Wallet', 'Banknote', 'Smartphone', 'Landmark', 'CreditCard', 'PiggyBank', 'Coins', 'HandCoins',
  'Briefcase', 'Store', 'Users', 'Heart', 'Target',
];

export const AppIcon: React.FC<{ name: string; className?: string; style?: React.CSSProperties }> = ({
  name,
  className = 'w-5 h-5',
  style,
}) => {
  const custom = useCustomIcons().find((i) => i.id === name);
  if (custom) {
    // Icône SVG de l'utilisateur : image (couleurs d'origine) ou masque coloré
    // Les logos en couleur (Orange Money, Airtel…) ont leur propre fond et des marges :
    // on les affiche un peu plus grands que les icônes au trait pour qu'ils restent lisibles
    if (custom.keepColors)
      return <img src={custom.dataUrl} alt="" className={`${className} object-contain`} style={{ ...style, scale: '1.45' }} />;
    const mask = `url("${custom.dataUrl}") center / contain no-repeat`;
    return (
      <span
        aria-hidden
        className={`${className} inline-block`}
        style={{ ...style, backgroundColor: style?.color ?? 'currentColor', mask, WebkitMask: mask }}
      />
    );
  }
  const Icon = ICONS[name] ?? CircleHelp; // icône de secours
  return <Icon className={className} style={style} aria-hidden />;
};

const BOX = { xs: 'w-6 h-6', sm: 'w-9 h-9', md: 'w-11 h-11', lg: 'w-14 h-14' } as const;
const GLYPH = { xs: 'w-3.5 h-3.5', sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-6 h-6' } as const;

// Rond de la couleur (très claire) avec l'icône en couleur, ou l'image choisie
export const IconBadge: React.FC<{
  icon: string;
  image?: string;
  color: string;
  size?: keyof typeof BOX;
}> = ({ icon, image, color, size = 'md' }) =>
  image ? (
    <img src={image} alt="" className={`${BOX[size]} rounded-full object-cover shrink-0`} />
  ) : (
    <div
      className={`${BOX[size]} rounded-full flex items-center justify-center shrink-0 tint`}
      style={{ backgroundColor: color + '22', '--tint': color } as React.CSSProperties}
    >
      <AppIcon name={icon} className={GLYPH[size]} />
    </div>
  );

// Petite pastille du sélecteur de portefeuille : l'icône du portefeuille choisi,
// ou le logo de l'app (citron) pour « Tous les portefeuilles »
export const WalletChipIcon: React.FC<{ wallet: { icon: string; image?: string; color: string } | null }> = ({ wallet }) =>
  wallet ? (
    <IconBadge icon={wallet.icon} image={wallet.image} color={wallet.color} size="xs" />
  ) : (
    <span className="w-6 h-6 shrink-0 rounded-full bg-[#D8FB52] flex items-center justify-center">
      <Layers className="w-3.5 h-3.5 text-slate-900" />
    </span>
  );
