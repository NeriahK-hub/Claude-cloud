import { MerchantOffer, QuickContact, NotificationItem } from "../types";

export const INITIAL_MERCHANTS: MerchantOffer[] = [
  {
    id: 'm-1',
    title: 'Discount Up To 80%',
    subtitle: 'Festive Season Gift',
    discount: '80% OFF',
    merchantName: 'Festive Store',
    category: 'Shopping & Gifts',
    bannerGradient: 'from-[#E4EAF4] via-[#DCE5F2] to-[#E9EFF8]',
    accentColor: '#4F46E5',
    badge: 'Limited Offer',
    code: 'FESTIVE80',
    expiresIn: '3 days left'
  },
  {
    id: 'm-2',
    title: 'Cashback Up To 25%',
    subtitle: 'Only For Dining & Bistro',
    discount: '25% Back',
    merchantName: 'FoodPanda & UberEats',
    category: 'Food & Dining',
    bannerGradient: 'from-[#FDF2F4] via-[#FCE7EB] to-[#FCEEF2]',
    accentColor: '#E11D48',
    badge: 'Weekly Perk',
    code: 'TASTY25',
    expiresIn: '5 days left'
  },
  {
    id: 'm-3',
    title: 'Zero FX Fees Abroad',
    subtitle: 'Traveler Freedom Pass',
    discount: '0% Surcharge',
    merchantName: 'Global Airport Lounge',
    category: 'Travel & FX',
    bannerGradient: 'from-[#F0FDF4] via-[#DCFCE7] to-[#ECFDF5]',
    accentColor: '#16A34A',
    badge: 'Exclusive',
    code: 'FLYFREE',
    expiresIn: '12 days left'
  }
];

export const QUICK_CONTACTS: QuickContact[] = [
  {
    id: 'c-1',
    name: 'Mikel Borle',
    handle: '@mikel.borle',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    avatarBg: '#16382F',
    initials: 'MB',
    recentAmount: 350.00
  },
  {
    id: 'c-2',
    name: 'Ryan Scott',
    handle: '@ryan_scott',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    avatarBg: '#3B82F6',
    initials: 'RS',
    recentAmount: 124.00
  },
  {
    id: 'c-3',
    name: 'Emma Watson',
    handle: '@emma.w',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    avatarBg: '#EC4899',
    initials: 'EW',
    recentAmount: 50.00
  },
  {
    id: 'c-4',
    name: 'Alex Rivera',
    handle: '@arivera',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
    avatarBg: '#8B5CF6',
    initials: 'AR',
    recentAmount: 200.00
  },
  {
    id: 'c-5',
    name: 'Sarah Chen',
    handle: '@sarah_c',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150&auto=format&fit=crop&q=80',
    avatarBg: '#10B981',
    initials: 'SC',
    recentAmount: 75.00
  }
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Bienvenue',
    message: 'Bienvenue ! Ajoute ta première dépense avec le bouton +.',
    time: '10:30 AM',
    read: false,
    type: 'transaction'
  },
  {
    id: 'notif-2',
    title: 'Festive Season Perk',
    message: 'You have unlocked 80% discount at selected partner merchants!',
    time: '08:00 AM',
    read: false,
    type: 'promo'
  },
  {
    id: 'notif-3',
    title: 'Security Alert',
    message: 'New login verified from Safari on iPhone 16 Pro.',
    time: 'Yesterday',
    read: true,
    type: 'security'
  }
];
