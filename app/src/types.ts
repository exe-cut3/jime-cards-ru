export type Kind = 'hero' | 'skill' | 'item' | 'terrain' | 'damage' | 'fear' | 'condition';

export type StatKey = 'might' | 'wisdom' | 'agility' | 'spirit' | 'wit';

export interface CardImage {
  front: string | null;
  back: string | null;
  front_ru?: string | null;
  back_ru?: string | null;
  shared_from?: string;
  alternates?: string[];
  alternates_ru?: string[];
}

export interface Card {
  id: string;
  kind: Kind;
  subtype?: string | null; // skill: Hero/Role/Basic/Title/Weakness; item: Weapon/Support/Trinket/Armor/Mount; condition: boon/bane
  owner?: string | null; // hero or role name for skills
  family?: string | null; // item upgrade line, e.g. "Battle Axe"
  name_en: string | null;
  name_ru: string | null;
  text_en: string | null;
  text_ru: string | null;
  cost?: number | null; // XP
  number?: number | null;
  icons?: Record<string, number> | null; // success / fate / fear
  traits?: string[] | null;
  keywords?: Record<string, number | string> | null;
  count?: number | null;
  rating?: string | null;
  tier?: string | null;
  test?: string[] | null;
  hands_or_tokens?: number | string | null;
  ranged?: boolean | null;
  expansion: string | string[] | null;
  page?: string | null;
  image: CardImage;
  // heroes
  race?: string | null;
  stats?: Record<StatKey, number> | null;
  inspiration?: number | null;
  fear?: number | null;
  damage?: number | null;
  suggested_role?: string | null;
  starting_gear?: string[] | null;
  background_en?: string | null;
  // damage / fear
  copies?: number;
  no_text?: boolean;
  // Russian edition (Hobby World)
  traits_ru?: string | null;
  background_ru?: string | null;
  suggested_ru?: string | null;
  race_ru?: string | null;
  translation?: { verified: boolean; proofread?: string | null; source: string };
  todo: string[];
}

export interface Glossary {
  name: string;
  text: string;
}

export interface Db {
  collections: Record<string, string>;
  keywords: Glossary[];
  modifiers: Glossary[];
  space_traits: { name: string; text: string; collections: string[] }[];
  cards: Card[];
}

export interface Filters {
  q: string;
  kind: Kind | '';
  sub: string[];
  owner: string[];
  exp: string[];
  cost: string[]; // '0' = no cost (starting card)
  icon: string[];
  trait: string[];
  tier: string[];
  test: string[];
  fav: boolean;
}

export const EMPTY_FILTERS: Filters = {
  q: '',
  kind: '',
  sub: [],
  owner: [],
  exp: [],
  cost: [],
  icon: [],
  trait: [],
  tier: [],
  test: [],
  fav: false,
};
