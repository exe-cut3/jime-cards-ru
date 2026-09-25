// Compact inline glyphs for stats and card icons. Colours follow the game's stat palette.
import type { StatKey } from '../types';

const STAT_COLOR: Record<StatKey, string> = {
  might: 'var(--c-might)',
  wisdom: 'var(--c-wisdom)',
  agility: 'var(--c-agility)',
  spirit: 'var(--c-spirit)',
  wit: 'var(--c-wit)',
};

const STAT_PATH: Record<StatKey, string> = {
  // sword
  might: 'M4 20l3-3m0 0l9-9 3-3-2 5-7 7m-3 0l3 3m-3-3l-2 2m5-5l3-3',
  // tree
  wisdom: 'M12 3l5 6h-3l4 5h-4l3 4H7l3-4H6l4-5H7l5-6zm0 15v3',
  // spiral / gust
  agility: 'M4 8c4-4 12-4 14 1 2 4-2 8-6 6-3-1-2-5 1-5m-9 9c4-1 8 0 12 1',
  // drop / flame
  spirit: 'M12 3s6 6 6 11a6 6 0 01-12 0c0-5 6-11 6-11z',
  // four-point star
  wit: 'M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7z',
};

export function StatIcon({ stat, size = 16, title }: { stat: StatKey; size?: number; title?: string }) {
  return (
    <svg
      className="ico"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={STAT_COLOR[stat]}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-label={title ?? stat}
      role="img"
    >
      <title>{title ?? stat}</title>
      <path d={STAT_PATH[stat]} />
    </svg>
  );
}

const CARD_ICON: Record<string, { color: string; d: string; fill?: boolean }> = {
  // success: eight-point burst
  success: { color: 'var(--c-success)', d: 'M12 2l1.8 5.3L19 5l-2.3 5.2L22 12l-5.3 1.8L19 19l-5.2-2.3L12 22l-1.8-5.3L5 19l2.3-5.2L2 12l5.3-1.8L5 5l5.2 2.3z', fill: true },
  // fate: leaf (as printed on the cards)
  fate: { color: 'var(--c-fate)', d: 'M12 2c-5 4-8 8-8 13a8 8 0 0016 0c0-5-3-9-8-13zm0 5v14m0-9l-3 3m3-1l3 3', fill: false },
  // fear: skull-ish shield
  fear: { color: 'var(--c-fear)', d: 'M12 3c-4 0-7 3-7 7 0 3 2 5 3 6v4h8v-4c1-1 3-3 3-6 0-4-3-7-7-7zm-3 8a1.5 1.5 0 110-3 1.5 1.5 0 010 3zm6 0a1.5 1.5 0 110-3 1.5 1.5 0 010 3z' },
  // damage: hexagon
  damage: { color: 'var(--c-damage)', d: 'M12 2l8 5v10l-8 5-8-5V7l8-5z', fill: true },
  // inspiration: leaf
  inspiration: { color: 'var(--c-inspiration)', d: 'M20 4C10 4 4 10 4 20c10 0 16-6 16-16zM4 20L14 10' },
  // lore: compass rose
  lore: { color: 'var(--c-fate)', d: 'M12 2l2 8 8 2-8 2-2 8-2-8-8-2 8-2 2-8zm0 7a3 3 0 100 6 3 3 0 000-6z', fill: true },
  // trinket: pouch
  trinket: { color: 'var(--c-fate)', d: 'M8 3h8l-1 4c4 1 6 4 6 8a5 5 0 01-5 5H8a5 5 0 01-5-5c0-4 2-7 6-8L8 3z' },
  // armor: chestplate
  armor: { color: 'var(--c-fate)', d: 'M6 3h12l2 6-2 12H6L4 9l2-6zm6 5v10' },
  // hand / hands
  hand: { color: 'var(--c-fate)', d: 'M8 21V11a2 2 0 014 0v3m0-4V6a2 2 0 014 0v8m0-5a2 2 0 014 0v6a6 6 0 01-6 6H8' },
  hands: { color: 'var(--c-fate)', d: 'M3 20v-8a2 2 0 014 0v3m0-3V7a2 2 0 014 0v6m2 0V9a2 2 0 014 0v5m0-3a2 2 0 014 0v4a5 5 0 01-5 5H8' },
  // ranged: arrow
  ranged: { color: 'var(--c-fate)', d: 'M4 20L20 4m0 0h-7m7 0v7' },
  // mount: horse head
  mount: { color: 'var(--c-fate)', d: 'M5 21c0-6 2-10 6-13l2-4 3 2-1 3c3 1 5 4 5 8v4H5zm7-9a1 1 0 100 2 1 1 0 000-2z' },
  // action: arrow marker
  action: { color: 'var(--accent)', d: 'M3 12h14m0 0l-5-5m5 5l-5 5', fill: false },
  // stats (same glyphs as StatIcon)
  might: { color: 'var(--c-might)', d: 'M4 20l3-3m0 0l9-9 3-3-2 5-7 7m-3 0l3 3m-3-3l-2 2m5-5l3-3' },
  wisdom: { color: 'var(--c-wisdom)', d: 'M12 3l5 6h-3l4 5h-4l3 4H7l3-4H6l4-5H7l5-6zm0 15v3' },
  agility: { color: 'var(--c-agility)', d: 'M4 8c4-4 12-4 14 1 2 4-2 8-6 6-3-1-2-5 1-5m-9 9c4-1 8 0 12 1' },
  spirit: { color: 'var(--c-spirit)', d: 'M12 3s6 6 6 11a6 6 0 01-12 0c0-5 6-11 6-11z' },
  wit: { color: 'var(--c-wit)', d: 'M12 3l2 7 7 2-7 2-2 7-2-7-7-2 7-2 2-7z' },
};

export function CardIcon({ name, size = 14, title }: { name: string; size?: number; title?: string }) {
  const g = CARD_ICON[name];
  if (!g) return null;
  return (
    <svg
      className="ico"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={g.fill ? g.color : 'none'}
      stroke={g.color}
      strokeWidth={g.fill ? 0 : 2}
      strokeLinejoin="round"
      strokeLinecap="round"
      role="img"
      aria-label={title ?? name}
    >
      <title>{title ?? name}</title>
      <path d={g.d} />
    </svg>
  );
}

export function BookmarkIcon({ filled, size = 18 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 3h12v18l-6-4-6 4V3z" />
    </svg>
  );
}

export function CloseIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function LinkIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" />
    </svg>
  );
}

export function FilterIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}
