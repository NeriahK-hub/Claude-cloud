import React from 'react';

// Montants lisibles : le nombre en grand, la devise en petit dessous (jamais coupés)

// « 50 889 CDF » -> « 50 889 » en grand, « CDF » en petit ; police plus petite si le nombre est long
export function splitMoney(t: string): [string, string] {
  const s = t.trim();
  const after = s.match(/^(.*\d)[\s\u00a0\u202f]*([^\d\s\u00a0\u202f].*)$/);
  if (after) return [after[1], after[2]];
  const before = s.match(/^([^\d\s\u00a0\u202f-]+)[\s\u00a0\u202f]*(.*\d)$/);
  if (before) return [before[2], before[1]];
  return [s, ''];
}
export const Amount: React.FC<{ text: string; tone?: string; size?: 'md' | 'lg'; prefix?: string }> = ({ text, tone, size = 'md', prefix }) => {
  const [num, unit] = splitMoney(text);
  const len = (prefix ?? '').length + num.length;
  const cls = size === 'lg' ? (len > 11 ? 'text-[16px]' : len > 8 ? 'text-[19px]' : 'text-[22px]') : len > 10 ? 'text-[13px]' : len > 7 ? 'text-[15px]' : 'text-[17px]';
  return (
    <span className="block min-w-0" style={tone ? { color: tone } : undefined}>
      <span className={`block font-bold tabular-nums leading-tight whitespace-nowrap ${cls} ${tone ? '' : 'text-slate-900'}`}>
        {prefix && <span className="opacity-60 font-semibold mr-0.5">{prefix}</span>}
        {num}
      </span>
      {unit && <span className="block text-[11px] font-semibold opacity-60 leading-tight">{unit}</span>}
    </span>
  );
};

