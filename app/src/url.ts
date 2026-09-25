// Filters live in the URL query string so a view can be shared as a link.
import { EMPTY_FILTERS, type Filters, type Kind } from './types';

const LIST_KEYS = ['sub', 'owner', 'exp', 'cost', 'icon', 'trait', 'tier', 'test'] as const;

export function readFilters(search = window.location.search): Filters {
  const p = new URLSearchParams(search);
  const f: Filters = { ...EMPTY_FILTERS, sub: [], owner: [], exp: [], cost: [], icon: [], trait: [], tier: [], test: [] };
  f.q = p.get('q') ?? '';
  f.kind = (p.get('kind') ?? '') as Kind | '';
  for (const k of LIST_KEYS) {
    const v = p.get(k);
    f[k] = v ? v.split(',').filter(Boolean) : [];
  }
  f.fav = p.get('fav') === '1';
  return f;
}

export function readCardId(search = window.location.search): string | null {
  return new URLSearchParams(search).get('card');
}

export function writeUrl(f: Filters, cardId: string | null, replace = false): void {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.kind) p.set('kind', f.kind);
  for (const k of LIST_KEYS) if (f[k].length) p.set(k, f[k].join(','));
  if (f.fav) p.set('fav', '1');
  if (cardId) p.set('card', cardId);
  const qs = p.toString();
  const url = `${window.location.pathname}${qs ? '?' + qs : ''}`;
  if (url === window.location.pathname + window.location.search) return;
  if (replace) window.history.replaceState(null, '', url);
  else window.history.pushState(null, '', url);
}

export function isEmptyFilters(f: Filters): boolean {
  return !f.q && !f.kind && !f.fav && LIST_KEYS.every((k) => f[k].length === 0);
}
