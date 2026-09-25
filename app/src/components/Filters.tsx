import type { Facets } from '../data';
import { EXPANSION_LABEL, ICON_LABEL, KIND_LABEL, KIND_ORDER, OWNER_LABEL, STAT_LABEL_EN, SUBTYPE_LABEL, TRAIT_LABEL, UI } from '../i18n';
import type { Filters as F, Kind } from '../types';
import { CardIcon } from './Icons';

interface Props {
  f: F;
  facets: Facets;
  counts: Record<Kind, number>;
  onChange: (next: F) => void;
  onReset: () => void;
  dirty: boolean;
}

const SKILL_SUBS = ['Hero', 'Role', 'Basic', 'Title', 'Weakness'];
const ITEM_SUBS = ['Weapon', 'Support', 'Trinket', 'Armor', 'Mount'];
const COND_SUBS = ['boon', 'bane'];

function toggle(list: string[], v: string): string[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function FiltersPanel({ f, facets, counts, onChange, onReset, dirty }: Props) {
  const set = (patch: Partial<F>) => onChange({ ...f, ...patch });

  function setKind(k: Kind | '') {
    // subtype / owner / cost only make sense within one section
    set({ kind: k, sub: [], owner: [], cost: [], icon: [], tier: [], test: [] });
  }

  const subs = f.kind === 'skill' ? SKILL_SUBS : f.kind === 'item' ? ITEM_SUBS : f.kind === 'condition' ? COND_SUBS : [];
  const showOwners = f.kind === 'skill' && (f.sub.length === 0 || f.sub.includes('Hero') || f.sub.includes('Role'));
  const showHeroes = showOwners && (f.sub.length === 0 || f.sub.includes('Hero'));
  const showRoles = showOwners && (f.sub.length === 0 || f.sub.includes('Role'));

  return (
    <div className="filters">
      <div className="filters-head">
        <h2>{UI.filters}</h2>
        {dirty && (
          <button className="linklike" onClick={onReset}>
            {UI.reset}
          </button>
        )}
      </div>

      <Group label={UI.section}>
        <div className="kindlist">
          <button className={`kind ${f.kind === '' ? 'is-on' : ''}`} onClick={() => setKind('')}>
            {UI.all}
          </button>
          {KIND_ORDER.map((k) => (
            <button key={k} className={`kind t-${k} ${f.kind === k ? 'is-on' : ''}`} onClick={() => setKind(k)}>
              <span>{KIND_LABEL[k]}</span>
              <span className="kind-n">{counts[k]}</span>
            </button>
          ))}
        </div>
      </Group>

      {subs.length > 0 && (
        <Group label={f.kind === 'skill' ? UI.skillType : f.kind === 'item' ? UI.itemType : 'Тип'}>
          <Chips values={subs} selected={f.sub} label={(v) => SUBTYPE_LABEL[v] ?? v} onToggle={(v) => set({ sub: toggle(f.sub, v) })} />
        </Group>
      )}

      {showHeroes && (
        <Group label={UI.hero}>
          <Chips values={facets.heroes} selected={f.owner} label={(v) => OWNER_LABEL[v] ?? v} onToggle={(v) => set({ owner: toggle(f.owner, v) })} />
        </Group>
      )}
      {showRoles && (
        <Group label={UI.role}>
          <Chips values={facets.roles} selected={f.owner} label={(v) => OWNER_LABEL[v] ?? v} onToggle={(v) => set({ owner: toggle(f.owner, v) })} />
        </Group>
      )}

      {f.kind === 'skill' && (
        <>
          <Group label={UI.cost}>
            <Chips values={facets.costs} selected={f.cost} label={(v) => (v === '0' ? UI.starting : v)} onToggle={(v) => set({ cost: toggle(f.cost, v) })} />
          </Group>
          <Group label={UI.icons}>
            <Chips
              values={['success', 'fate', 'fear']}
              selected={f.icon}
              label={(v) => (
                <>
                  <CardIcon name={v} /> {ICON_LABEL[v]}
                </>
              )}
              onToggle={(v) => set({ icon: toggle(f.icon, v) })}
            />
          </Group>
        </>
      )}

      {f.kind === 'item' && (
        <>
          <Group label={UI.tier}>
            <Chips values={facets.tiers} selected={f.tier} onToggle={(v) => set({ tier: toggle(f.tier, v) })} />
          </Group>
          <Group label={UI.test}>
            <Chips values={facets.tests} selected={f.test} label={(v) => STAT_LABEL_EN[v] ?? v} onToggle={(v) => set({ test: toggle(f.test, v) })} />
          </Group>
        </>
      )}

      {(f.kind === 'skill' || f.kind === 'item') && (
        <Group label={UI.traits}>
          <Chips values={facets.traits} selected={f.trait} label={(v) => TRAIT_LABEL[v] ?? v} onToggle={(v) => set({ trait: toggle(f.trait, v) })} />
        </Group>
      )}

      <Group label={UI.expansion}>
        <Chips values={facets.expansions} selected={f.exp} label={(v) => EXPANSION_LABEL[v] ?? v} onToggle={(v) => set({ exp: toggle(f.exp, v) })} />
      </Group>
    </div>
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="fgroup">
      <h3>{label}</h3>
      {children}
    </section>
  );
}

function Chips({
  values,
  selected,
  label,
  onToggle,
}: {
  values: string[];
  selected: string[];
  label?: (v: string) => React.ReactNode;
  onToggle: (v: string) => void;
}) {
  return (
    <div className="chips">
      {values.map((v) => (
        <button key={v} className={`chip chip-f ${selected.includes(v) ? 'is-on' : ''}`} onClick={() => onToggle(v)} aria-pressed={selected.includes(v)}>
          {label ? label(v) : v}
        </button>
      ))}
    </div>
  );
}
