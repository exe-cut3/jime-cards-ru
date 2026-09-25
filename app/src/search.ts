import MiniSearch from 'minisearch';
import type { Card } from './types';

interface Doc {
  id: string;
  name: string;
  name_ru: string;
  text: string;
  text_ru: string;
  owner: string;
  family: string;
  traits: string;
  keywords: string;
}

export function buildIndex(cards: Card[]): MiniSearch<Doc> {
  const ms = new MiniSearch<Doc>({
    fields: ['name', 'name_ru', 'text', 'text_ru', 'owner', 'family', 'traits', 'keywords'],
    storeFields: ['id'],
    searchOptions: {
      boost: { name: 4, name_ru: 4, owner: 2, family: 2 },
      prefix: true,
      fuzzy: (term) => (term.length > 4 ? 0.2 : false),
      combineWith: 'AND',
    },
  });
  ms.addAll(
    cards.map((c) => ({
      id: c.id,
      name: c.name_en ?? '',
      name_ru: c.name_ru ?? '',
      text: (c.text_en ?? '') + ' ' + (c.background_en ?? ''),
      text_ru: c.text_ru ?? '',
      owner: c.owner ?? '',
      family: c.family ?? '',
      traits: (c.traits ?? []).join(' '),
      keywords: Object.keys(c.keywords ?? {}).join(' '),
    })),
  );
  return ms;
}

/** Ids matching the query, best first; null when the query is empty. */
export function searchIds(ms: MiniSearch<Doc>, q: string): Set<string> | null {
  const query = q.trim();
  if (!query) return null;
  return new Set(ms.search(query).map((r) => r.id as string));
}
