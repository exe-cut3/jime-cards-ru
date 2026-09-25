// Deck planner: a "build" is one hero's skill deck (rules: reference guide §34.1, §52.3, §57, §76)
// plus experience per role, planned purchases and equipment. Builds live in localStorage and can
// be shared as a link (?view=deck&b=…).
import { OWNER_LABEL } from './i18n';
import type { Card } from './types';

export interface Build {
  id: string;
  name: string;
  hero: string | null; // hero card id ("hero-aragorn")
  role: string | null; // current role, EN key ("Burglar")
  xp: Record<string, number>; // experience earned per role (EN key), total for the campaign
  bought: string[]; // purchased role cards (ids), any role — they stay in the deck (§76.6)
  plan: string[]; // cards the player wants to buy next
  weakness: string[]; // weakness card ids drawn during the campaign
  titles: string[]; // title card ids gained during the campaign
  prepared: string[]; // prepared skill card ids, at most 4 (§57.4)
  gear: string[]; // equipped item ids
  notes: string;
  updated: number;
}

export const MAX_PREPARED = 4;

const BUILDS_KEY = 'jime.builds';
const CURRENT_KEY = 'jime.build';

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newBuild(name = 'Новый билд'): Build {
  return { id: uid(), name, hero: null, role: null, xp: {}, bought: [], plan: [], weakness: [], titles: [], prepared: [], gear: [], notes: '', updated: Date.now() };
}

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function normalise(raw: unknown): Build | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.id !== 'string' || !b.id) return null;
  const xp: Record<string, number> = {};
  if (b.xp && typeof b.xp === 'object') {
    for (const [k, v] of Object.entries(b.xp as Record<string, unknown>)) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) xp[k] = Math.floor(n);
    }
  }
  return {
    id: b.id,
    name: typeof b.name === 'string' && b.name.trim() ? b.name : 'Билд',
    hero: typeof b.hero === 'string' ? b.hero : null,
    role: typeof b.role === 'string' ? b.role : null,
    xp,
    bought: strList(b.bought),
    plan: strList(b.plan),
    weakness: strList(b.weakness),
    titles: strList(b.titles),
    prepared: strList(b.prepared).slice(0, MAX_PREPARED),
    gear: strList(b.gear),
    notes: typeof b.notes === 'string' ? b.notes : '',
    updated: typeof b.updated === 'number' ? b.updated : Date.now(),
  };
}

export function loadBuilds(): Build[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BUILDS_KEY) ?? '[]');
    if (!Array.isArray(raw)) return [];
    return raw.map(normalise).filter((b): b is Build => b !== null);
  } catch {
    return [];
  }
}

export function saveBuilds(list: Build[]): void {
  try {
    localStorage.setItem(BUILDS_KEY, JSON.stringify(list));
  } catch {
    /* private mode etc. */
  }
}

export function loadCurrentId(): string | null {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

export function saveCurrentId(id: string | null): void {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
  } catch {
    /* ignore */
  }
}

// ---- card lookups

export const ROLE_ORDER = ['Burglar', 'Captain', 'Guardian', 'Hunter', 'Musician', 'Pathfinder', 'Delver', 'Herbalist', 'Meddler', 'Smith', 'Traveller', 'Guide', 'Lorekeeper', 'Provisioner', 'Shieldmaiden', 'Soldier', 'Trickster', 'Beast-Friend'];

export function roleLabel(role: string): string {
  return OWNER_LABEL[role] ?? role;
}

/** Playable heroes: hero cards that own hero skills (The Great Bear is Beorn's alternate form). */
export function playableHeroes(cards: Card[]): Card[] {
  const owners = new Set(cards.filter((c) => c.kind === 'skill' && c.subtype === 'Hero').map((c) => c.owner));
  return cards.filter((c) => c.kind === 'hero' && owners.has(c.name_en));
}

export function allRoles(cards: Card[]): string[] {
  const set = new Set<string>();
  for (const c of cards) if (c.kind === 'skill' && c.subtype === 'Role' && c.owner) set.add(c.owner);
  return [...set].sort((a, b) => idx(ROLE_ORDER, a) - idx(ROLE_ORDER, b) || a.localeCompare(b));
}

function idx(list: string[], v: string): number {
  const i = list.indexOf(v);
  return i < 0 ? 999 : i;
}

const byNumber = (a: Card, b: Card) => (a.number ?? 0) - (b.number ?? 0);

export function basicCards(cards: Card[]): Card[] {
  return cards.filter((c) => c.kind === 'skill' && c.subtype === 'Basic').sort(byNumber);
}

export function heroSkills(hero: Card | null, cards: Card[]): Card[] {
  if (!hero) return [];
  return cards.filter((c) => c.kind === 'skill' && c.subtype === 'Hero' && c.owner === hero.name_en).sort(byNumber);
}

/** Role cards 1–3 that come free with the role (§76.2). Beast-Friend 3 is printed with a cost, so it is a purchase. */
export function roleStartCards(role: string | null, cards: Card[]): Card[] {
  if (!role) return [];
  return cards.filter((c) => c.kind === 'skill' && c.subtype === 'Role' && c.owner === role && c.cost == null && (c.number ?? 0) <= 3).sort(byNumber);
}

/** Role cards that are bought for experience (§52.3). */
export function roleShopCards(role: string, cards: Card[]): Card[] {
  return cards.filter((c) => c.kind === 'skill' && c.subtype === 'Role' && c.owner === role && c.cost != null).sort(byNumber);
}

/** The sheet spells Bilbo's suggested role "Burgler"; match loosely. */
export function matchRole(s: string | null | undefined, roles: string[]): string | null {
  if (!s) return null;
  const k = s.toLowerCase();
  return roles.find((r) => r.toLowerCase() === k) ?? roles.find((r) => r.slice(0, 5).toLowerCase() === k.slice(0, 5)) ?? null;
}

/** Starting gear names on the hero card → item ids (rank I; reprints resolved by the hero's expansion). */
export function startingGear(hero: Card | null, cards: Card[]): string[] {
  if (!hero?.starting_gear) return [];
  const heroExp = Array.isArray(hero.expansion) ? hero.expansion[0] : hero.expansion;
  const out: string[] = [];
  for (const name of hero.starting_gear) {
    const m = cards.filter((c) => c.kind === 'item' && c.name_en === name && (c.tier === 'I' || c.tier == null));
    if (!m.length) continue;
    const pick = m.find((c) => c.expansion === heroExp) ?? m[0];
    out.push(pick.id);
  }
  return out;
}

// ---- derived deck

export interface DeckGroups {
  basic: Card[];
  hero: Card[];
  role: Card[];
  bought: Card[];
  titles: Card[];
  weakness: Card[];
}

export function groupDeck(b: Build, cards: Card[], byId: Map<string, Card>): DeckGroups {
  const hero = b.hero ? byId.get(b.hero) ?? null : null;
  const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((c): c is Card => Boolean(c));
  return {
    basic: basicCards(cards),
    hero: heroSkills(hero, cards),
    role: roleStartCards(b.role, cards),
    bought: pick(b.bought).sort((x, y) => idx(ROLE_ORDER, x.owner ?? '') - idx(ROLE_ORDER, y.owner ?? '') || byNumber(x, y)),
    titles: pick(b.titles),
    weakness: pick(b.weakness),
  };
}

export function allDeckCards(g: DeckGroups): Card[] {
  return [...g.basic, ...g.hero, ...g.role, ...g.bought, ...g.titles, ...g.weakness];
}

// ---- experience (§76.7: experience belongs to the role it was earned with)

export interface RoleXp {
  role: string;
  earned: number;
  spent: number;
  left: number;
  planned: number; // cost of planned cards of this role
}

export function xpByRole(b: Build, byId: Map<string, Card>): RoleXp[] {
  const roles = new Set<string>(Object.keys(b.xp));
  if (b.role) roles.add(b.role);
  for (const id of [...b.bought, ...b.plan]) {
    const c = byId.get(id);
    if (c?.owner) roles.add(c.owner);
  }
  const rows: RoleXp[] = [];
  for (const role of roles) {
    const earned = b.xp[role] ?? 0;
    const spent = sumCost(b.bought, role, byId);
    const planned = sumCost(b.plan, role, byId);
    rows.push({ role, earned, spent, left: earned - spent, planned });
  }
  return rows.sort((x, y) => (x.role === b.role ? -1 : y.role === b.role ? 1 : 0) || idx(ROLE_ORDER, x.role) - idx(ROLE_ORDER, y.role));
}

function sumCost(ids: string[], role: string, byId: Map<string, Card>): number {
  let s = 0;
  for (const id of ids) {
    const c = byId.get(id);
    if (c?.owner === role) s += c.cost ?? 0;
  }
  return s;
}

// ---- deck statistics: tests draw as many cards as the stat value and count success icons

export interface DeckStats {
  total: number;
  inDeck: number; // cards not prepared (prepared cards leave the deck, §57.1)
  success: number;
  fate: number;
  successInDeck: number;
  fateInDeck: number;
  traits: [string, number][];
}

export function deckStats(all: Card[], prepared: Set<string>): DeckStats {
  const s: DeckStats = { total: all.length, inDeck: 0, success: 0, fate: 0, successInDeck: 0, fateInDeck: 0, traits: [] };
  const traits = new Map<string, number>();
  for (const c of all) {
    const su = c.icons?.success ?? 0;
    const fa = c.icons?.fate ?? 0;
    s.success += su;
    s.fate += fa;
    if (!prepared.has(c.id)) {
      s.inDeck++;
      s.successInDeck += su;
      s.fateInDeck += fa;
    }
    for (const t of c.traits ?? []) traits.set(t, (traits.get(t) ?? 0) + 1);
  }
  s.traits = [...traits.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return s;
}

export function expectedSuccesses(stat: number, s: DeckStats): number {
  return s.inDeck ? (stat * s.successInDeck) / s.inDeck : 0;
}

/**
 * Exact distribution of the number of success icons when n cards are drawn from the deck
 * without replacement (cards carry 0, 1 or 2 icons). dist[t] = probability of exactly t icons.
 */
export function successDistribution(deck: Card[], n: number): number[] {
  const D = deck.length;
  n = Math.min(Math.max(0, Math.floor(n)), D);
  if (n === 0 || D === 0) return [1];
  const maxT = deck.reduce((s, c) => s + (c.icons?.success ?? 0), 0);
  // ways[k][t] = number of k-card subsets with t icons in total
  const ways: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(maxT + 1).fill(0));
  ways[0][0] = 1;
  for (const c of deck) {
    const s = c.icons?.success ?? 0;
    for (let k = n; k >= 1; k--) for (let t = maxT; t >= s; t--) ways[k][t] += ways[k - 1][t - s];
  }
  const total = ways[n].reduce((a, b) => a + b, 0);
  return ways[n].map((w) => w / total);
}

export function chanceAtLeast(dist: number[], m: number): number {
  let p = 0;
  for (let t = m; t < dist.length; t++) p += dist[t];
  return p;
}

const TIER_ORDER = ['I', 'II', 'III', 'IV'];

export function tierIndex(c: Card): number {
  return TIER_ORDER.indexOf(c.tier ?? '');
}

/** Other cards of the same upgrade line (reprints collapsed by name), lowest rank first. */
export function familyOptions(item: Card, cards: Card[]): Card[] {
  if (!item.family) return [];
  const seen = new Set<string>([item.name_en ?? item.id]);
  const out: Card[] = [];
  for (const c of cards) {
    if (c.kind !== 'item' || c.family !== item.family || c.id === item.id) continue;
    const key = c.name_en ?? c.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out.sort((a, b) => tierIndex(a) - tierIndex(b) || (a.name_ru ?? a.name_en ?? '').localeCompare(b.name_ru ?? b.name_en ?? ''));
}

// ---- equipment limits (§37.4; mounts: Spreading War rules)

export interface GearCheck {
  armor: number;
  hands: number;
  trinkets: number;
  mounts: number;
  problems: string[];
}

export function handsOf(c: Card): number {
  if (c.subtype !== 'Weapon' && c.subtype !== 'Support') return 0;
  const n = Number(c.hands_or_tokens);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function checkGear(items: Card[]): GearCheck {
  const g: GearCheck = { armor: 0, hands: 0, trinkets: 0, mounts: 0, problems: [] };
  for (const c of items) {
    if (c.subtype === 'Armor') g.armor++;
    else if (c.subtype === 'Trinket') g.trinkets++;
    else if (c.subtype === 'Mount') g.mounts++;
    else g.hands += handsOf(c);
  }
  if (g.armor > 1) g.problems.push('Не более одной карты брони');
  if (g.hands > 2) g.problems.push(`Снаряжение занимает ${g.hands} руки из двух`);
  if (g.trinkets > 1) g.problems.push('Не более одной вещи');
  if (g.mounts > 1) g.problems.push('Не более одного верхового животного');
  return g;
}

// ---- build transitions

export function withHero(b: Build, heroId: string | null, cards: Card[], byId: Map<string, Card>, roles: string[]): Build {
  const hero = heroId ? byId.get(heroId) ?? null : null;
  const role = b.role ?? matchRole(hero?.suggested_role, roles);
  const next: Build = { ...b, hero: heroId, gear: startingGear(hero, cards), updated: Date.now() };
  return withRole(next, role, cards);
}

/** Changing role swaps the free cards 1–3 (§76.4); purchased cards stay. Role card 1 starts prepared (§57.3). */
export function withRole(b: Build, role: string | null, cards: Card[]): Build {
  const old = new Set(roleStartCards(b.role, cards).map((c) => c.id));
  const start = roleStartCards(role, cards);
  const prepared = b.prepared.filter((id) => !old.has(id));
  if (start.length && !prepared.includes(start[0].id)) prepared.unshift(start[0].id);
  return { ...b, role, prepared: prepared.slice(0, MAX_PREPARED), updated: Date.now() };
}

export function toggleIn(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

// ---- sharing: compact JSON → base64url in the query string

interface Wire {
  v: 1;
  n: string;
  h: string | null;
  r: string | null;
  x: Record<string, number>;
  b: string[];
  p: string[];
  w: string[];
  t: string[];
  q: string[];
  g: string[];
  o: string;
}

const strip = (ids: string[], prefix: string) => ids.map((id) => (id.startsWith(prefix) ? id.slice(prefix.length) : '~' + id));
const unstrip = (ids: unknown, prefix: string) => strList(ids).map((id) => (id.startsWith('~') ? id.slice(1) : prefix + id));

export function encodeBuild(b: Build): string {
  const w: Wire = {
    v: 1,
    n: b.name,
    h: b.hero ? b.hero.replace(/^hero-/, '') : null,
    r: b.role,
    x: b.xp,
    b: strip(b.bought, 'skill-'),
    p: strip(b.plan, 'skill-'),
    w: strip(b.weakness, 'skill-weakness-'),
    t: strip(b.titles, 'skill-title-'),
    q: strip(b.prepared, 'skill-'),
    g: strip(b.gear, 'item-'),
    o: b.notes,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(w));
  let bin = '';
  for (const x of bytes) bin += String.fromCharCode(x);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeBuild(s: string): Build | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    const w = JSON.parse(new TextDecoder().decode(bytes)) as Partial<Wire>;
    if (w.v !== 1) return null;
    return normalise({
      id: uid(),
      name: w.n,
      hero: typeof w.h === 'string' ? 'hero-' + w.h : null,
      role: w.r,
      xp: w.x,
      bought: unstrip(w.b, 'skill-'),
      plan: unstrip(w.p, 'skill-'),
      weakness: unstrip(w.w, 'skill-weakness-'),
      titles: unstrip(w.t, 'skill-title-'),
      prepared: unstrip(w.q, 'skill-'),
      gear: unstrip(w.g, 'item-'),
      notes: w.o,
    });
  } catch {
    return null;
  }
}

// ---- plain-text export for chats and notes

export function buildText(b: Build, g: DeckGroups, gear: Card[], xp: RoleXp[], plan: Card[], byId: Map<string, Card>): string {
  const hero = b.hero ? byId.get(b.hero) : null;
  const name = (c: Card) => c.name_ru ?? c.name_en ?? c.id;
  const num = (c: Card) => (c.number != null ? `${c.number}. ` : '');
  const all = allDeckCards(g);
  const lines: string[] = [];
  lines.push(`${b.name} — ${hero ? name(hero) : 'герой не выбран'}${b.role ? ', ' + roleLabel(b.role) : ''} · ${all.length} карт`);
  if (xp.length) lines.push('Опыт: ' + xp.map((r) => `${roleLabel(r.role)} ${r.earned} (потрачено ${r.spent}, осталось ${r.left})`).join('; '));
  lines.push('Базовые: ' + g.basic.map((c) => num(c) + name(c)).join(', '));
  if (hero && g.hero.length) lines.push(`${name(hero)}: ` + g.hero.map((c) => num(c) + name(c)).join(', '));
  if (b.role && g.role.length) lines.push(`${roleLabel(b.role)}: ` + g.role.map((c) => num(c) + name(c)).join(', '));
  if (g.bought.length) lines.push('Приобретённые: ' + g.bought.map((c) => `${roleLabel(c.owner ?? '')} ${c.number} «${name(c)}» (${c.cost})`).join(', '));
  if (g.titles.length) lines.push('Прозвища: ' + g.titles.map(name).join(', '));
  if (g.weakness.length) lines.push('Слабости: ' + g.weakness.map(name).join(', '));
  const prepared = b.prepared.map((id) => byId.get(id)).filter((c): c is Card => Boolean(c));
  if (prepared.length) lines.push('Подготовлены: ' + prepared.map(name).join(', '));
  if (gear.length) lines.push('Снаряжение: ' + gear.map((c) => `${name(c)}${c.tier ? ' (' + c.tier + ')' : ''}`).join(', '));
  if (plan.length) lines.push('План: ' + plan.map((c) => `${roleLabel(c.owner ?? '')} ${c.number} «${name(c)}» (${c.cost})`).join(', '));
  if (b.notes.trim()) lines.push('Заметки: ' + b.notes.trim());
  return lines.join('\n');
}
