// Main column of the deck planner: the skill deck, the camp shop, the upgrade plan, gear and statistics.
import { useState } from 'react';
import { displayName, primaryImage } from '../../data';
import {
  type Build,
  MAX_PREPARED,
  allDeckCards,
  buildText,
  checkGear,
  deckStats,
  encodeBuild,
  expectedSuccesses,
  groupDeck,
  handsOf,
  matchRole,
  roleLabel,
  roleShopCards,
  startingGear,
  toggleIn,
  withHero,
  xpByRole,
  type RoleXp,
} from '../../deck';
import { EXPANSION_SHORT, STAT_KEYS, STAT_LABEL, STAT_LABEL_EN, SUBTYPE_LABEL, TRAIT_LABEL } from '../../i18n';
import type { Card, StatKey } from '../../types';
import { CostChip, IconRow, OwnerBadge, TierChip, TypeBadge, typeClass } from '../Badges';
import { CardIcon, LinkIcon, StatIcon } from '../Icons';

interface Props {
  build: Build;
  cards: Card[];
  byId: Map<string, Card>;
  roles: string[];
  heroes: Card[];
  onChange: (fn: (b: Build) => Build) => void;
  onOpen: (id: string) => void;
}

const ITEM_SUBS = ['Weapon', 'Support', 'Trinket', 'Armor', 'Mount'];

export function DeckMain({ build, cards, byId, roles, heroes, onChange, onOpen }: Props) {
  const hero = build.hero ? byId.get(build.hero) ?? null : null;
  const groups = groupDeck(build, cards, byId);
  const all = allDeckCards(groups);
  const preparedSet = new Set(build.prepared);
  const stats = deckStats(all, preparedSet);
  const xp = xpByRole(build, byId);
  const xpOf = (role: string | null | undefined): RoleXp => xp.find((r) => r.role === role) ?? { role: role ?? '', earned: 0, spent: 0, left: 0, planned: 0 };
  const gear = build.gear.map((id) => byId.get(id)).filter((c): c is Card => Boolean(c));
  const gearCheck = checkGear(gear);
  const plan = build.plan.map((id) => byId.get(id)).filter((c): c is Card => Boolean(c));

  const [shopRole, setShopRole] = useState<string | null>(null);
  const activeShop = shopRole ?? build.role ?? roles[0] ?? null;
  const [copied, setCopied] = useState<'link' | 'text' | null>(null);

  const touch = (b: Build): Build => ({ ...b, updated: Date.now() });
  const set = (patch: Partial<Build>) => onChange((b) => touch({ ...b, ...patch }));
  const buy = (id: string) => onChange((b) => touch({ ...b, bought: b.bought.includes(id) ? b.bought : [...b.bought, id], plan: b.plan.filter((x) => x !== id) }));
  const sell = (id: string) => onChange((b) => touch({ ...b, bought: b.bought.filter((x) => x !== id), prepared: b.prepared.filter((x) => x !== id) }));
  const togglePlan = (id: string) => onChange((b) => touch({ ...b, plan: toggleIn(b.plan, id) }));
  const togglePrepared = (id: string) =>
    onChange((b) => {
      if (b.prepared.includes(id)) return touch({ ...b, prepared: b.prepared.filter((x) => x !== id) });
      if (b.prepared.length >= MAX_PREPARED) return b;
      return touch({ ...b, prepared: [...b.prepared, id] });
    });
  const canPrepare = build.prepared.length < MAX_PREPARED;

  function buyAffordable() {
    onChange((b) => {
      const left: Record<string, number> = {};
      for (const r of xpByRole(b, byId)) left[r.role] = r.left;
      const bought = [...b.bought];
      const rest: string[] = [];
      for (const id of b.plan) {
        const c = byId.get(id);
        const role = c?.owner ?? '';
        const cost = c?.cost ?? 0;
        if (c && (left[role] ?? 0) >= cost) {
          left[role] = (left[role] ?? 0) - cost;
          if (!bought.includes(id)) bought.push(id);
        } else rest.push(id);
      }
      return touch({ ...b, bought, plan: rest });
    });
  }

  async function copy(kind: 'link' | 'text') {
    const text =
      kind === 'link'
        ? `${window.location.origin}${window.location.pathname}?view=deck&b=${encodeBuild(build)}`
        : buildText(build, groups, gear, xp, plan, byId);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      window.prompt('Скопируйте вручную:', text);
    }
  }

  const titles = cards.filter((c) => c.kind === 'skill' && c.subtype === 'Title' && !build.titles.includes(c.id));
  const weaknesses = cards.filter((c) => c.kind === 'skill' && c.subtype === 'Weakness' && !build.weakness.includes(c.id));
  const shop = activeShop ? roleShopCards(activeShop, cards) : [];
  const shopXp = xpOf(activeShop);
  const affordable = (c: Card) => xpOf(c.owner).left >= (c.cost ?? 0);
  const planByRole = new Map<string, Card[]>();
  for (const c of plan) {
    const k = c.owner ?? '';
    if (!planByRole.has(k)) planByRole.set(k, []);
    planByRole.get(k)!.push(c);
  }
  const anyAffordable = plan.some(affordable);

  return (
    <div className="deck">
      <div className="deck-head">
        <input className="deck-name" value={build.name} onChange={(e) => set({ name: e.target.value })} aria-label="Название билда" />
        <div className="deck-actions">
          <button className="btn btn-sm" onClick={() => copy('link')}>
            <LinkIcon /> {copied === 'link' ? 'Скопировано' : 'Ссылка на билд'}
          </button>
          <button className="btn btn-sm" onClick={() => copy('text')}>
            {copied === 'text' ? 'Скопировано' : 'Скопировать текстом'}
          </button>
        </div>
      </div>
      <div className="deck-sum">
        <span>
          <b>{hero ? displayName(hero).main : 'герой не выбран'}</b>
          {build.role && <> · {roleLabel(build.role)}</>}
        </span>
        <span>
          <b>{all.length}</b> карт в колоде
        </span>
        <span>
          <CardIcon name="success" /> <b>{stats.success}</b>
        </span>
        <span>
          <CardIcon name="fate" /> <b>{stats.fate}</b>
        </span>
        {xp.map((r) => (
          <span key={r.role} title={`${roleLabel(r.role)}: получено ${r.earned}, потрачено ${r.spent}`}>
            опыт {roleLabel(r.role)} <b className={r.left < 0 ? 'neg' : ''}>{r.left}</b>
            <span className="dim"> / {r.earned}</span>
          </span>
        ))}
      </div>

      {!hero && (
        <section className="dsec">
          <h3>Выберите героя</h3>
          <div className="hero-pick">
            {heroes.map((h) => {
              const img = primaryImage(h);
              const sug = matchRole(h.suggested_role, roles);
              return (
                <button key={h.id} className="hero-card" onClick={() => onChange((b) => withHero(b, h.id, cards, byId, roles))}>
                  {img ? <img src={img} alt="" loading="lazy" /> : <span className="tile-noimg">нет скана</span>}
                  <span className="hero-card-name">{displayName(h).main}</span>
                  {sug && <span className="hero-card-sub">{roleLabel(sug)}</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="dsec">
        <h3>
          Колода навыков
          <span className="n">
            {all.length} карт · подготовлено {build.prepared.length}/{MAX_PREPARED}
          </span>
        </h3>
        <DeckGroup title="Базовые" cards={groups.basic} prepared={preparedSet} canPrepare={canPrepare} onPrepare={togglePrepared} onOpen={onOpen} />
        <DeckGroup
          title={hero ? `Навыки героя · ${displayName(hero).main}` : 'Навыки героя'}
          cards={groups.hero}
          empty="выберите героя"
          prepared={preparedSet}
          canPrepare={canPrepare}
          onPrepare={togglePrepared}
          onOpen={onOpen}
        />
        <DeckGroup
          title={build.role ? `Навыки роли · ${roleLabel(build.role)}` : 'Навыки роли'}
          cards={groups.role}
          empty="выберите роль"
          prepared={preparedSet}
          canPrepare={canPrepare}
          onPrepare={togglePrepared}
          onOpen={onOpen}
        />
        <DeckGroup
          title="Приобретённые"
          cards={groups.bought}
          empty="пока ничего — покупки ниже, в разделе «Приобретение навыков»"
          prepared={preparedSet}
          canPrepare={canPrepare}
          onPrepare={togglePrepared}
          onOpen={onOpen}
          action={(c) => ({ label: `Продать +${c.cost}`, onClick: () => sell(c.id) })}
        />
        <DeckGroup
          title="Прозвища"
          cards={groups.titles}
          empty="получаются по ходу кампании"
          prepared={preparedSet}
          canPrepare={canPrepare}
          onPrepare={togglePrepared}
          onOpen={onOpen}
          action={(c) => ({ label: 'Убрать', onClick: () => set({ titles: build.titles.filter((x) => x !== c.id), prepared: build.prepared.filter((x) => x !== c.id) }) })}
          extra={<AddSelect placeholder="+ добавить прозвище…" options={titles} onPick={(id) => set({ titles: [...build.titles, id] })} />}
        />
        <DeckGroup
          title="Слабости"
          cards={groups.weakness}
          empty="при сборке колоды герой берёт одну карту с верха колоды слабостей (34.1)"
          prepared={preparedSet}
          canPrepare={false}
          onOpen={onOpen}
          action={(c) => ({ label: 'Убрать', onClick: () => set({ weakness: build.weakness.filter((x) => x !== c.id) }) })}
          extra={<AddSelect placeholder="+ добавить слабость…" options={weaknesses} onPick={(id) => set({ weakness: [...build.weakness, id] })} />}
        />
      </section>

      <section className="dsec">
        <h3>
          Приобретение навыков <span className="n">экран лагеря между приключениями</span>
        </h3>
        <div className="chips roletabs">
          {roles.map((r) => {
            const x = xpOf(r);
            const active = r === build.role || x.earned > 0 || x.spent > 0;
            return (
              <button key={r} className={`chip chip-f ${r === activeShop ? 'is-on' : ''} ${active ? '' : 'is-dim'}`} onClick={() => setShopRole(r)} aria-pressed={r === activeShop}>
                {roleLabel(r)}
                {x.left > 0 && <span className="chip-xp">{x.left}</span>}
              </button>
            );
          })}
        </div>
        {activeShop && (
          <>
            <div className="shop-head">
              <label>
                Получено опыта · {roleLabel(activeShop)}
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={shopXp.earned}
                  onChange={(e) => {
                    const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                    onChange((b) => touch({ ...b, xp: { ...b.xp, [activeShop]: n } }));
                  }}
                />
              </label>
              <span>
                потрачено {shopXp.spent} · осталось <b className={shopXp.left < 0 ? 'neg' : ''}>{shopXp.left}</b>
              </span>
            </div>
            <div className="drows">
              {shop.map((c) => {
                const bought = build.bought.includes(c.id);
                const planned = build.plan.includes(c.id);
                const ok = affordable(c);
                const short = (c.cost ?? 0) - xpOf(c.owner).left;
                return (
                  <SkillRow key={c.id} card={c} onOpen={onOpen} status={bought ? 'bought' : planned ? 'plan' : null}>
                    {bought ? (
                      <button className="btn btn-sm" onClick={() => sell(c.id)}>
                        Продать +{c.cost}
                      </button>
                    ) : (
                      <>
                        <button className="btn btn-sm is-buy" disabled={!ok} title={ok ? '' : `не хватает ${short} опыта`} onClick={() => buy(c.id)}>
                          Купить
                        </button>
                        <button className={`btn btn-sm ${planned ? 'is-on' : ''}`} onClick={() => togglePlan(c.id)}>
                          {planned ? 'Из плана' : 'В план'}
                        </button>
                      </>
                    )}
                  </SkillRow>
                );
              })}
            </div>
          </>
        )}
        <p className="hint">
          Стоимость в левом нижнем углу карты — столько опыта нужно для покупки и столько же вернётся при продаже (52.4). Купленные карты остаются в колоде и после смены роли (76.6).
        </p>
      </section>

      {plan.length > 0 && (
        <section className="dsec">
          <h3>
            План прокачки
            <span className="n">
              {plan.length} карт · {plan.reduce((s, c) => s + (c.cost ?? 0), 0)} опыта
            </span>
          </h3>
          {[...planByRole.entries()].map(([role, list]) => {
            const x = xpOf(role);
            const deficit = x.planned - x.left;
            return (
              <div key={role} className="dgroup">
                <h4>
                  {roleLabel(role)}
                  <span className="dim">нужно {x.planned} · осталось {Math.max(x.left, 0)}</span>
                  {deficit > 0 ? <span className="neg">не хватает {deficit}</span> : <span className="pos">хватает на всё</span>}
                </h4>
                <div className="drows">
                  {list.map((c) => (
                    <SkillRow key={c.id} card={c} onOpen={onOpen} status="plan">
                      <button className="btn btn-sm is-buy" disabled={!affordable(c)} onClick={() => buy(c.id)}>
                        Купить
                      </button>
                      <button className="btn btn-sm" onClick={() => togglePlan(c.id)}>
                        Убрать
                      </button>
                    </SkillRow>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="row-actions">
            <button className="btn" disabled={!anyAffordable} onClick={buyAffordable}>
              Купить всё, на что хватает опыта
            </button>
          </div>
          <p className="hint">Чтобы смоделировать прокачку, впишите ожидаемый опыт роли — план покажет, чего не хватает. Опыт другой роли на эти карты потратить нельзя (76.7).</p>
        </section>
      )}

      <section className="dsec">
        <h3>
          Снаряжение <span className="n">{gear.length} карт</span>
        </h3>
        <div className="slots">
          <span className={gearCheck.armor > 1 ? 'neg' : ''}>
            <CardIcon name="armor" /> Броня {gearCheck.armor}/1
          </span>
          <span className={gearCheck.hands > 2 ? 'neg' : ''}>
            <CardIcon name="hands" /> Руки {gearCheck.hands}/2
          </span>
          <span className={gearCheck.trinkets > 1 ? 'neg' : ''}>
            <CardIcon name="trinket" /> Вещь {gearCheck.trinkets}/1
          </span>
          <span className={gearCheck.mounts > 1 ? 'neg' : ''}>
            <CardIcon name="mount" /> Верховое животное {gearCheck.mounts}/1
          </span>
        </div>
        {gearCheck.problems.map((p) => (
          <div key={p} className="problem">
            {p}
          </div>
        ))}
        <div className="drows">
          {gear.map((c, i) => (
            <ItemRow key={`${c.id}-${i}`} card={c} onOpen={onOpen} onRemove={() => set({ gear: build.gear.filter((_, j) => j !== i) })} />
          ))}
        </div>
        <div className="row-actions">
          <AddSelect
            placeholder="+ добавить снаряжение…"
            groups={ITEM_SUBS.map((s) => [SUBTYPE_LABEL[s] ?? s, cards.filter((c) => c.kind === 'item' && c.subtype === s).sort(itemOrder)] as [string, Card[]])}
            label={itemOptionLabel}
            onPick={(id) => set({ gear: [...build.gear, id] })}
          />
          {hero && (
            <button className="btn btn-sm" onClick={() => set({ gear: startingGear(hero, cards) })}>
              Стартовое снаряжение
            </button>
          )}
        </div>
        <p className="hint">
          Герой может быть экипирован не более чем одной бронёй, снаряжением не более чем на две руки и одной вещью (37.4); верховое животное — одно, после экипировки вещами («Ветер войны»). Всё стартовое снаряжение имеет ранг I,
          улучшения открываются по показателю сведений отряда.
        </p>
      </section>

      <section className="dsec">
        <h3>Статистика колоды</h3>
        <div className="deck-sum">
          <span>
            <b>{stats.inDeck}</b> карт в колоде{build.prepared.length > 0 && <span className="dim"> (+{build.prepared.length} подготовлено)</span>}
          </span>
          <span>
            <CardIcon name="success" /> <b>{stats.successInDeck}</b> успехов
          </span>
          <span>
            <CardIcon name="fate" /> <b>{stats.fateInDeck}</b> судьбы
          </span>
          <span>
            в среднем <b>{stats.inDeck ? (stats.successInDeck / stats.inDeck).toFixed(2) : '—'}</b> успеха на карту
          </span>
        </div>
        {hero && hero.stats && (
          <table className="stats-table">
            <thead>
              <tr>
                <th>Характеристика</th>
                <th>Значение</th>
                <th>Ожидаемо успехов за проверку</th>
              </tr>
            </thead>
            <tbody>
              {STAT_KEYS.map((k: StatKey) => (
                <tr key={k}>
                  <td>
                    <StatIcon stat={k} size={16} title={STAT_LABEL[k]} /> {STAT_LABEL[k]}
                  </td>
                  <td>{hero.stats![k]}</td>
                  <td>
                    <b>{expectedSuccesses(hero.stats![k], stats).toFixed(1)}</b>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {stats.traits.length > 0 && (
          <div className="chips">
            {stats.traits.map(([t, n]) => (
              <span key={t} className="chip">
                {TRAIT_LABEL[t] ?? t} <b>{n}</b>
              </span>
            ))}
          </div>
        )}
        <p className="hint">
          При проверке герой берёт с верха колоды столько карт, сколько у него значение характеристики, и считает символы успеха. Подготовленные карты лежат под планшетом и в колоде не участвуют; их символы игнорируются (57.6).
        </p>
      </section>
    </div>
  );
}

// ---- pieces

interface RowAction {
  label: string;
  onClick: () => void;
}

function DeckGroup({
  title,
  cards,
  empty,
  prepared,
  canPrepare,
  onPrepare,
  onOpen,
  action,
  extra,
}: {
  title: string;
  cards: Card[];
  empty?: string;
  prepared: Set<string>;
  canPrepare: boolean;
  onPrepare?: (id: string) => void;
  onOpen: (id: string) => void;
  action?: (c: Card) => RowAction;
  extra?: React.ReactNode;
}) {
  return (
    <div className="dgroup">
      <h4>
        {title} <span className="dim">{cards.length}</span>
      </h4>
      {cards.length === 0 && empty && <p className="hint">{empty}</p>}
      <div className="drows">
        {cards.map((c) => {
          const isPrep = prepared.has(c.id);
          const a = action?.(c);
          return (
            <SkillRow key={c.id} card={c} onOpen={onOpen} prepared={isPrep}>
              {onPrepare && (
                <button
                  className={`prep ${isPrep ? 'is-on' : ''}`}
                  disabled={!isPrep && !canPrepare}
                  title={isPrep ? 'Убрать из подготовленных' : canPrepare ? 'Подготовить (положить под планшет)' : `Не более ${MAX_PREPARED} подготовленных карт`}
                  onClick={() => onPrepare(c.id)}
                  aria-pressed={isPrep}
                >
                  {isPrep ? '✓ подготовлена' : 'подготовить'}
                </button>
              )}
              {a && (
                <button className="btn btn-sm" onClick={a.onClick}>
                  {a.label}
                </button>
              )}
            </SkillRow>
          );
        })}
      </div>
      {extra && <div className="row-actions">{extra}</div>}
    </div>
  );
}

function SkillRow({ card, onOpen, prepared, status, children }: { card: Card; onOpen: (id: string) => void; prepared?: boolean; status?: 'bought' | 'plan' | null; children?: React.ReactNode }) {
  const { main, sub } = displayName(card);
  return (
    <div className={`drow ${typeClass(card)} ${prepared ? 'is-prepared' : ''}`}>
      <span className="drow-n">{card.number ?? '·'}</span>
      <button className="drow-name linklike" onClick={() => onOpen(card.id)}>
        <b>{main}</b>
        {sub && <span className="drow-sub">{sub}</span>}
      </button>
      <span className="drow-meta">
        {status === 'bought' && <span className="st st-bought">в колоде</span>}
        {status === 'plan' && <span className="st st-plan">в плане</span>}
        <OwnerBadge c={card} />
        {card.traits_ru && <span className="drow-traits">{card.traits_ru}</span>}
        <IconRow c={card} />
        <CostChip c={card} />
      </span>
      <span className="drow-actions">{children}</span>
    </div>
  );
}

function ItemRow({ card, onOpen, onRemove }: { card: Card; onOpen: (id: string) => void; onRemove: () => void }) {
  const { main, sub } = displayName(card);
  const hands = handsOf(card);
  const test = card.test ?? [];
  return (
    <div className={`drow ${typeClass(card)}`}>
      <span className="drow-n">
        <TierChip c={card} />
      </span>
      <button className="drow-name linklike" onClick={() => onOpen(card.id)}>
        <b>{main}</b>
        {sub && <span className="drow-sub">{sub}</span>}
      </button>
      <span className="drow-meta">
        <TypeBadge c={card} />
        {hands > 0 && <CardIcon name={hands > 1 ? 'hands' : 'hand'} title={`${hands}-hand`} />}
        {card.ranged && <CardIcon name="ranged" title="дальняя атака" />}
        {test.map((t) => (
          <StatIcon key={t} stat={t.toLowerCase() as StatKey} size={15} title={STAT_LABEL_EN[t] ?? t} />
        ))}
        {card.number != null && (
          <span className="drow-lore" title="Показатель сведений">
            <CardIcon name="lore" /> {card.number}
          </span>
        )}
      </span>
      <span className="drow-actions">
        <button className="btn btn-sm" onClick={onRemove}>
          Снять
        </button>
      </span>
    </div>
  );
}

function AddSelect({
  placeholder,
  options,
  groups,
  label,
  onPick,
}: {
  placeholder: string;
  options?: Card[];
  groups?: [string, Card[]][];
  label?: (c: Card) => string;
  onPick: (id: string) => void;
}) {
  const lab = label ?? ((c: Card) => displayName(c).main);
  return (
    <select
      className="addselect"
      value=""
      onChange={(e) => {
        if (e.target.value) onPick(e.target.value);
      }}
      aria-label={placeholder}
    >
      <option value="">{placeholder}</option>
      {groups
        ? groups.map(([g, list]) => (
            <optgroup key={g} label={g}>
              {list.map((c) => (
                <option key={c.id} value={c.id}>
                  {lab(c)}
                </option>
              ))}
            </optgroup>
          ))
        : (options ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {lab(c)}
            </option>
          ))}
    </select>
  );
}

const TIERS = ['I', 'II', 'III', 'IV'];

function itemOrder(a: Card, b: Card): number {
  return (a.family ?? a.name_en ?? '').localeCompare(b.family ?? b.name_en ?? '') || TIERS.indexOf(a.tier ?? '') - TIERS.indexOf(b.tier ?? '') || (a.name_en ?? '').localeCompare(b.name_en ?? '');
}

function itemOptionLabel(c: Card): string {
  const { main, sub } = displayName(c);
  const parts = [main];
  if (c.tier) parts.push(c.tier);
  const hands = handsOf(c);
  if (hands) parts.push(`${hands} р.`);
  if (c.number != null) parts.push(`сведения ${c.number}`);
  const exp = Array.isArray(c.expansion) ? c.expansion[0] : c.expansion;
  if (exp) parts.push(EXPANSION_SHORT[exp] ?? exp);
  return parts.join(' · ') + (sub && sub !== main ? ` (${sub})` : '');
}
