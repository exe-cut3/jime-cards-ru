import { expansions } from '../data';
import { type Dict, useI18n } from '../i18n';
import type { Card } from '../types';
import { CardIcon } from './Icons';

/** CSS class carrying the colour of a card's type. */
export function typeClass(c: Card): string {
  if (c.kind === 'skill') return `t-skill-${(c.subtype ?? 'x').toLowerCase()}`;
  if (c.kind === 'item') return `t-item-${(c.subtype ?? 'x').toLowerCase()}`;
  if (c.kind === 'condition') return `t-${c.subtype ?? 'condition'}`;
  return `t-${c.kind}`;
}

export function typeLabel(c: Card, t: Dict): string {
  if (t.kindOne[c.kind]) return t.kindOne[c.kind];
  return t.subtype[c.subtype ?? ''] ?? c.subtype ?? c.kind;
}

export function TypeBadge({ c }: { c: Card }) {
  const { t } = useI18n();
  return <span className={`badge badge-type ${typeClass(c)}`}>{typeLabel(c, t)}</span>;
}

export function OwnerBadge({ c }: { c: Card }) {
  const { t } = useI18n();
  if (!c.owner || c.kind !== 'skill' || !['Hero', 'Role'].includes(c.subtype ?? '')) return null;
  return (
    <span className={`badge badge-owner ${c.subtype === 'Hero' ? 'is-hero' : 'is-role'}`} title={c.owner}>
      {t.owner(c.owner)}
    </span>
  );
}

export function ExpansionBadge({ c, long = false }: { c: Card; long?: boolean }) {
  const { t } = useI18n();
  const ex = expansions(c);
  if (!ex.length) return null;
  return (
    <>
      {ex.map((e) => (
        <span key={e} className={`badge badge-exp exp-${e}`} title={t.exp[e] ?? e}>
          {long ? (t.exp[e] ?? e) : (t.expShort[e] ?? e)}
        </span>
      ))}
    </>
  );
}

export function CostChip({ c }: { c: Card }) {
  const { t } = useI18n();
  if (c.kind !== 'skill' || c.subtype === 'Hero' || c.subtype === 'Basic' || c.subtype === 'Title' || c.subtype === 'Weakness') return null;
  return c.cost == null ? (
    <span className="chip chip-cost is-start" title={t.startingCard}>
      ★
    </span>
  ) : (
    <span className="chip chip-cost" title={t.costTitle}>
      {c.cost}
    </span>
  );
}

export function IconRow({ c }: { c: Card }) {
  const { t } = useI18n();
  const icons = c.icons ?? {};
  const entries = Object.entries(icons).filter(([k, v]) => k !== 'unparsed' && v > 0);
  if (!entries.length) return null;
  return (
    <span className="iconrow">
      {entries.map(([k, v]) => (
        <span key={k} className="iconrow-item" title={`${v} ${t.icon[k] ?? k}`}>
          {v > 1 && <span className="iconrow-n">{v}</span>}
          <CardIcon name={k} />
        </span>
      ))}
    </span>
  );
}

export function TierChip({ c }: { c: Card }) {
  const { t } = useI18n();
  if (c.kind !== 'item' || !c.tier) return null;
  return (
    <span className="chip chip-tier" title={t.tierTitle}>
      {c.tier}
    </span>
  );
}
