import React from 'react';
import { Check } from 'lucide-react';

// Petite coche citron dans le coin d'une tuile choisie (le parent doit être « relative »)
export const SelCheck: React.FC = () => (
  <span className="sel-check" aria-hidden>
    <Check className="w-2.5 h-2.5" strokeWidth={3.5} />
  </span>
);
