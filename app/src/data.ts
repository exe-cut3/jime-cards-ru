import type { Card, Db, Filters, Kind } from './types';

export const BASE = import.meta.env.BASE_URL;

export async function loadDb(): Promise<Db> {
  const res = await fetch(`${BASE}data/cards.json`);
  if (!res.ok) throw new Error(`cards.json: HTTP ${res.status}`);
  return (await res.json()) as Db;
}

/** URL of a scan; `thumb` picks the 320 px grid version from /thumb (640 px for hero boards). */
export function imageUrl(path: string | null | undefined, ru = false, thumb = false): string | null {
  if (!path) return null;
  return `${BASE}${thumb ? 'thumb' : 'img'}/${ru ? 'ru/' : ''}${path.replace(/\.png$/i, '.webp')}`;
}

/** Preferred scan for a card: the Russian edition when it exists, else the English one. */
export function primaryImage(c: Card, side: 'front' | 'back' = 'front', thumb = false): string | null {
  const ru = side === 'front' ? c.image.front_ru : c.image.back_ru;
  if (ru) return imageUrl(ru, true, thumb);
  return imageUrl(side === 'front' ? c.image.front : c.image.back, false, thumb);
}

export function displayName(c: Card): { main: string; sub: string | null } {
  if (c.name_ru) return { main: c.name_ru, sub: c.name_en };
  return { main: c.name_en ?? '—', sub: null };
}

export function expansions(c: Card): string[] {
  if (!c.expansion) return [];
  return Array.isArray(c.expansion) ? c.expansion : [c.expansion];
}

export function costKey(c: Card): string {
  return c.cost == null ? '0' : String(c.cost);
}

/** Distinct values for the filter panel, computed once from the whole set. */
export interface Facets {
  heroes: string[];
  roles: string[];
  expansions: string[];
  costs: string[];
  traits: string[];
  tiers: string[];
  tests: string[];
}

export function buildFacets(cards: Card[]): Facets {
  const heroes = new Set<string>();
  const roles = new Set<string>();
  const exps = new Set<string>();
  const costs = new Set<number>();
  const traits = new Set<string>();
  const tiers = new Set<string>();
  const tests = new Set<string>();
  for (const c of cards) {
    if (c.kind === 'skill') {
      if (c.subtype === 'Hero' && c.owner) heroes.add(c.owner);
      if (c.subtype === 'Role' && c.owner) roles.add(c.owner);
      if (c.cost != null) costs.add(c.cost);
      for (const t of c.traits ?? []) traits.add(t);
    }
    if (c.kind === 'item') {
      if (c.tier) tiers.add(c.tier);
      for (const t of c.test ?? []) tests.add(t);
      for (const t of c.traits ?? []) traits.add(t);
    }
    for (const e of expansions(c)) exps.add(e);
  }
  const order = ['core', 'sp', 'sw', 'did', 'voe', 'sotw'];
  const statOrder = ['Might', 'Wisdom', 'Agility', 'Spirit', 'Wit'];
  return {
    heroes: [...heroes].sort(),
    roles: [...roles].sort(),
    expansions: [...exps].sort((a, b) => order.indexOf(a) - order.indexOf(b)),
    costs: ['0', ...[...costs].sort((a, b) => a - b).map(String)],
    traits: [...traits].sort(),
    tiers: [...tiers].sort((a, b) => a.length - b.length || a.localeCompare(b)),
    tests: [...tests].sort((a, b) => statOrder.indexOf(a) - statOrder.indexOf(b)),
  };
}

export function applyFilters(cards: Card[], f: Filters, searchHits: Set<string> | null, favs: Set<string>): Card[] {
  return cards.filter((c) => {
    if (searchHits && !searchHits.has(c.id)) return false;
    if (f.fav && !favs.has(c.id)) return false;
    if (f.kind && c.kind !== f.kind) return false;
    if (f.sub.length && !f.sub.includes(c.subtype ?? '')) return false;
    if (f.owner.length && !f.owner.includes(c.owner ?? '')) return false;
    if (f.exp.length && !expansions(c).some((e) => f.exp.includes(e))) return false;
    if (f.cost.length && !(c.kind === 'skill' && f.cost.includes(costKey(c)))) return false;
    if (f.icon.length && !f.icon.some((i) => (c.icons?.[i] ?? 0) > 0)) return false;
    if (f.trait.length && !(c.traits ?? []).some((t) => f.trait.includes(t))) return false;
    if (f.tier.length && !f.tier.includes(c.tier ?? '')) return false;
    if (f.test.length && !(c.test ?? []).some((t) => f.test.includes(t))) return false;
    return true;
  });
}

export function countByKind(cards: Card[]): Record<Kind, number> {
  const n: Record<Kind, number> = { hero: 0, skill: 0, item: 0, terrain: 0, damage: 0, fear: 0, condition: 0 };
  for (const c of cards) n[c.kind]++;
  return n;
}

// ---- bookmarks (localStorage)
const FAV_KEY = 'jime.favs';

export function loadFavs(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAV_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

export function saveFavs(favs: Set<string>): void {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...favs]));
  } catch {
    /* private mode etc. */
  }
}
