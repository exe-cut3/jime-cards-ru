// Sidebar of the deck planner: saved builds, hero, role, experience per role, notes.
import { useMemo } from 'react';
import { displayName, expansions, primaryImage } from '../../data';
import { type Build, matchRole, roleLabel, withHero, withRole, xpByRole } from '../../deck';
import { EXPANSION_LABEL, STAT_KEYS, STAT_LABEL } from '../../i18n';
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
    const parts = [h ? displayName(h).main : null, b.role ? roleLabel(b.role) : null].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'герой не выбран';
  };

  return (
    <div className="filters deck-setup">
      <div className="filters-head">
        <h2>Билды</h2>
        <button className="linklike" onClick={onCreate}>
          + новый
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
          Дублировать
        </button>
        <button className="btn btn-sm" onClick={onDelete}>
          Удалить
        </button>
      </div>

      <Group label="Герой">
        <select value={build.hero ?? ''} onChange={(e) => onChange((b) => withHero(b, e.target.value || null, cards, byId, roles))} aria-label="Герой">
          <option value="">— выберите героя —</option>
          {heroGroups.map(([e, hs]) => (
            <optgroup key={e} label={EXPANSION_LABEL[e] ?? e}>
              {hs.map((h) => (
                <option key={h.id} value={h.id}>
                  {displayName(h).main}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        {hero && (
          <div className="hero-mini">
            {primaryImage(hero) && <img src={primaryImage(hero)!} alt="" />}
            <div className="hero-mini-stats">
              {STAT_KEYS.map((k) => (
                <span key={k} className="stat" title={STAT_LABEL[k]}>
                  <StatIcon stat={k} size={14} title={STAT_LABEL[k]} />
                  <span className="stat-n small">{hero.stats?.[k] ?? '—'}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </Group>

      <Group label="Роль">
        <select value={build.role ?? ''} onChange={(e) => onChange((b) => withRole(b, e.target.value || null, cards))} aria-label="Роль">
          <option value="">— выберите роль —</option>
          {roles.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r)}
              {r === suggested ? ' · рекомендуемая' : ''}
            </option>
          ))}
        </select>
        <p className="hint">Роль можно менять перед каждым приключением: карты роли 1–3 меняются, а купленные карты остаются в колоде (справочник, 76.4).</p>
      </Group>

      <Group label="Опыт по ролям">
        {xp.length === 0 && <p className="hint">Выберите роль или добавьте её ниже.</p>}
        {xp.map((r) => {
          const removable = r.role !== build.role && r.spent === 0 && r.planned === 0;
          return (
            <div key={r.role} className="xp-row">
              <label htmlFor={`xp-${r.role}`}>{roleLabel(r.role)}</label>
              <input id={`xp-${r.role}`} type="number" min={0} inputMode="numeric" value={r.earned} onChange={(e) => setXp(r.role, e.target.value)} />
              <span className="xp-sub">
                потрачено {r.spent} · осталось <b className={r.left < 0 ? 'neg' : ''}>{r.left}</b>
                {removable && (
                  <button className="linklike xp-drop" onClick={() => dropXpRole(r.role)} title="Убрать роль из списка">
                    убрать
                  </button>
                )}
              </span>
            </div>
          );
        })}
        {spareRoles.length > 0 && (
          <select value="" onChange={(e) => e.target.value && setXp(e.target.value, '0')} aria-label="Добавить роль">
            <option value="">+ добавить роль…</option>
            {spareRoles.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        )}
        <p className="hint">Опыт начисляется отдельно за каждую роль и тратится только на её карты (76.7). Впишите сюда ожидаемый опыт, чтобы прикинуть прокачку.</p>
      </Group>

      <Group label="Заметки">
        <textarea rows={3} value={build.notes} placeholder="Идея билда, что качать дальше…" onChange={(e) => onChange((b) => ({ ...b, notes: e.target.value, updated: Date.now() }))} />
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
