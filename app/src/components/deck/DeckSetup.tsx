// Sidebar of the deck planner: saved builds, hero, role, experience per role, notes.
import { useMemo } from 'react';
import { displayName, expansions, primaryImage } from '../../data';
import { type Build, matchRole, withHero, withRole, xpByRole } from '../../deck';
import { STAT_KEYS, useI18n } from '../../i18n';
import type { Card } from '../../types';
import { StatIcon } from '../Icons';

interface Props {
  build: Build;
  builds: Build[];
  heroes: Card[];
  roles: string[];
  cards: Card[];
  byId: Map<string, Card>;
  onChange: (fn: (b: Build) => Build) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

const EXP_ORDER = ['core', 'sp', 'sw', 'did', 'voe', 'sotw'];

export function DeckSetup({ build, builds, heroes, roles, cards, byId, onChange, onSelect, onCreate, onDuplicate, onDelete }: Props) {
  const { lang, t } = useI18n();
  const d = t.deck;
  const roleLabel = (r: string) => t.owner(r);
  const hero = build.hero ? byId.get(build.hero) ?? null : null;
  const suggested = matchRole(hero?.suggested_role, roles);
  const xp = useMemo(() => xpByRole(build, byId), [build, byId]);
  const spareRoles = roles.filter((r) => !xp.some((x) => x.role === r));

  const heroGroups = useMemo(() => {
    const m = new Map<string, Card[]>();
    for (const h of heroes) {
      const e = expansions(h)[0] ?? 'core';
      if (!m.has(e)) m.set(e, []);
      m.get(e)!.push(h);
    }
    return [...m.entries()].sort((a, b) => EXP_ORDER.indexOf(a[0]) - EXP_ORDER.indexOf(b[0]));
  }, [heroes]);

  function setXp(role: string, value: string) {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    onChange((b) => ({ ...b, xp: { ...b.xp, [role]: n }, updated: Date.now() }));
  }

  function dropXpRole(role: string) {
    onChange((b) => {
      const xp = { ...b.xp };
      delete xp[role];
      return { ...b, xp, updated: Date.now() };
    });
  }

  const subtitle = (b: Build) => {
    const h = b.hero ? byId.get(b.hero) : null;
    const parts = [h ? displayName(h, lang).main : null, b.role ? roleLabel(b.role) : null].filter(Boolean);
    return parts.length ? parts.join(' · ') : d.noHero;
  };

  return (
    <div className="filters deck-setup">
      <div className="filters-head">
        <h2>{d.builds}</h2>
        <button className="linklike" onClick={onCreate}>
          {d.newBuild}
        </button>
      </div>
      <div className="builds">
        {builds.map((b) => (
          <button key={b.id} className={`build-item ${b.id === build.id ? 'is-on' : ''}`} onClick={() => onSelect(b.id)} aria-current={b.id === build.id}>
            <span className="build-name">{b.name}</span>
            <span className="build-sub">{subtitle(b)}</span>
          </button>
        ))}
      </div>
      <div className="build-actions">
        <button className="btn btn-sm" onClick={onDuplicate}>
          {d.duplicate}
        </button>
        <button className="btn btn-sm" onClick={onDelete}>
          {d.remove}
        </button>
      </div>

      <Group label={t.hero}>
        <select value={build.hero ?? ''} onChange={(e) => onChange((b) => withHero(b, e.target.value || null, cards, byId, roles))} aria-label={t.hero}>
          <option value="">{d.chooseHero}</option>
          {heroGroups.map(([e, hs]) => (
            <optgroup key={e} label={t.exp[e] ?? e}>
              {hs.map((h) => (
                <option key={h.id} value={h.id}>
                  {displayName(h, lang).main}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {hero && (
          <div className="hero-mini">
            {primaryImage(hero, 'front', true, lang) && <img src={primaryImage(hero, 'front', true, lang)!} alt="" />}
            <div className="hero-mini-stats">
              {STAT_KEYS.map((k) => (
                <span key={k} className="stat" title={t.stat[k]}>
                  <StatIcon stat={k} size={14} title={t.stat[k]} />
                  <span className="stat-n small">{hero.stats?.[k] ?? '—'}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Group>

      <Group label={t.role}>
        <select value={build.role ?? ''} onChange={(e) => onChange((b) => withRole(b, e.target.value || null, cards))} aria-label={t.role}>
          <option value="">{d.chooseRole}</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
              {r === suggested ? d.suggestedMark : ''}
            </option>
          ))}
        </select>
        <p className="hint">{d.roleHint}</p>
      </Group>

      <Group label={d.xpByRole}>
        {xp.length === 0 && <p className="hint">{d.xpEmpty}</p>}
        {xp.map((r) => {
          const removable = r.role !== build.role && r.spent === 0 && r.planned === 0;
          return (
            <div key={r.role} className="xp-row">
              <label htmlFor={`xp-${r.role}`}>{roleLabel(r.role)}</label>
              <input id={`xp-${r.role}`} type="number" min={0} inputMode="numeric" value={r.earned} onChange={(e) => setXp(r.role, e.target.value)} />
              <span className="xp-sub">
                {d.spentLeft(r.spent)} <b className={r.left < 0 ? 'neg' : ''}>{r.left}</b>
                {removable && (
                  <button className="linklike xp-drop" onClick={() => dropXpRole(r.role)} title={d.dropRoleTitle}>
                    {d.dropRole}
                  </button>
                )}
              </span>
            </div>
          );
        })}
        {spareRoles.length > 0 && (
          <select value="" onChange={(e) => e.target.value && setXp(e.target.value, '0')} aria-label={d.addRole}>
            <option value="">{d.addRole}</option>
            {spareRoles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        )}
        <p className="hint">{d.xpHint}</p>
      </Group>

      <Group label={d.notes}>
        <textarea rows={3} value={build.notes} placeholder={d.notesPlaceholder} onChange={(e) => onChange((b) => ({ ...b, notes: e.target.value, updated: Date.now() }))} />
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
