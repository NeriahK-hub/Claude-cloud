import React, { useRef, useState } from 'react';
import { haptic } from '../lib/haptics';

interface SortableListProps<T> {
  items: T[];
  getId: (item: T) => string;
  renderItem: (item: T, ctx: { index: number; dragging: boolean; move: (delta: -1 | 1) => void }) => React.ReactNode;
  onChange: (ids: string[]) => void;
}

interface DragState {
  from: number;
  to: number;
  startY: number;
  dy: number;
  rects: DOMRect[];
  gap: number;
}

// Liste qu'on réordonne en faisant glisser une ligne (doigt ou souris).
// Les autres lignes s'écartent pendant le glissement ; l'ordre est enregistré au lâcher.
export function SortableList<T>({ items, getId, renderItem, onChange }: SortableListProps<T>) {
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<DragState | null>(null);

  const commit = (from: number, to: number) => {
    if (from === to) return;
    const ids = items.map(getId);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    onChange(ids);
  };

  const onPointerDown = (e: React.PointerEvent, index: number) => {
    // Les boutons de la ligne (flèches) gardent leur clic normal
    if ((e.target as HTMLElement).closest('button') || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const rects = rows.current.slice(0, items.length).map((el) => el!.getBoundingClientRect());
    const gap = rects.length > 1 ? rects[1].top - rects[0].bottom : 0;
    e.currentTarget.setPointerCapture(e.pointerId);
    haptic();
    setDrag({ from: index, to: index, startY: e.clientY, dy: 0, rects, gap });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const dy = e.clientY - drag.startY;
    const r = drag.rects[drag.from];
    const center = r.top + r.height / 2 + dy;
    // Nouvelle place : on dépasse le milieu d'une autre ligne
    let to = drag.from;
    drag.rects.forEach((o, i) => {
      const mid = o.top + o.height / 2;
      if (i > drag.from && center > mid) to = i;
      if (i < drag.from && center < mid) to = Math.min(to, i);
    });
    if (to !== drag.to) haptic();
    setDrag({ ...drag, dy, to });
  };

  const onPointerUp = () => {
    if (!drag) return;
    commit(drag.from, drag.to);
    setDrag(null);
  };

  const offset = (i: number) => {
    if (!drag) return 0;
    if (i === drag.from) return drag.dy;
    const shift = drag.rects[drag.from].height + drag.gap;
    if (drag.from < drag.to && i > drag.from && i <= drag.to) return -shift;
    if (drag.to < drag.from && i >= drag.to && i < drag.from) return shift;
    return 0;
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const dragging = drag?.from === i;
        return (
          <div
            key={getId(item)}
            ref={(el) => {
              rows.current[i] = el;
            }}
            onPointerDown={(e) => onPointerDown(e, i)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            className={`relative select-none touch-none ${dragging ? 'z-10 cursor-grabbing' : 'cursor-grab'} ${
              drag && !dragging ? 'transition-transform duration-150' : ''
            }`}
            style={{ transform: `translateY(${offset(i)}px)` }}
          >
            {renderItem(item, {
              index: i,
              dragging,
              move: (delta) => {
                const to = i + delta;
                if (to >= 0 && to < items.length) {
                  haptic();
                  commit(i, to);
                }
              },
            })}
          </div>
        );
      })}
    </div>
  );
}
