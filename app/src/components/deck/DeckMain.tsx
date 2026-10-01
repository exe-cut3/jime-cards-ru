// Main column of the deck planner: the skill deck, the camp shop, the upgrade plan, gear and statistics.
import { useState } from 'react';
import { displayName, primaryImage, traitLine } from '../../data';
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
  roleShopCards,
  startingGear,
  toggleIn,
  withHero,
  xpByRole,
  chanceAtLeast,
  familyOptions,
  successDistribution,
  tierIndex,
  type RoleXp,
} from '../../deck';
import { CardText } from '../CardText';
import { type Dict, type Lang, STAT_KEYS, useI18n } from '../../i18n';
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
  const { lang, t } = useI18n();
  const d = t.deck;
  const roleLabel = (r: string) => t.owner(r);
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
  const [upgradeAt, setUpgradeAt] = useState<number | null>(null);
  const deckCards = all.filter((c) => !preparedSet.has(c.id));
  const withSuccess = deckCards.filter((c) => (c.icons?.success ?? 0) > 0).length;

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
        : buildText(build, groups, gear, xp, plan, byId, lang);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      window.prompt(d.copyManually, text);
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
        <input className="deck-name" value={build.name} onChange={(e) => set({ name: e.target.value })} aria-label={d.buildName} />
        <div className="deck-actions">
          <button className="btn btn-sm" onClick={() => copy('link')}>
            <LinkIcon /> {copied === 'link' ? t.copied : d.linkToBuild}
          </button>
          <button className="btn btn-sm" onClick={() => copy('text')}>
            {copied === 'text' ? t.copied : d.copyAsText}
          </button>
        </div>
      </div>
      <div className="deck-sum">
        <span>
          <b>{hero ? displayName(hero, lang).main : d.noHero}</b>
          {build.role && <> · {roleLabel(build.role)}</>}
        </span>
        <span>
          <b>{all.length}</b> {d.cardsInDeck(all.length)}
        </span>
        <span>
          <CardIcon name="success" /> <b>{stats.success}</b>
        </span>
        <span>
          <CardIcon name="fate" /> <b>{stats.fate}</b>
        </span>
        {xp.map((r) => (
          <span key={r.role} title={d.xpTitle(roleLabel(r.role), r.earned, r.spent)}>
            {d.xpRole(roleLabel(r.role))} <b className={r.left < 0 ? 'neg' : ''}>{r.left}</b>
            <span className="dim"> / {r.earned}</span>
          </span>
        ))}
      </div>

      {!hero && (
        <section className="dsec">
          <h3>{d.pickHero}</h3>
          <div className="hero-pick">
            {heroes.map((h) => {
              const img = primaryImage(h, 'front', true, lang);
              const sug = matchRole(h.suggested_role, roles);
              return (
                <button key={h.id} className="hero-card" onClick={() => onChange((b) => withHero(b, h.id, cards, byId, roles))}>
                  {img ? <img src={img} alt="" loading="lazy" /> : <span className="tile-noimg">{t.noScan}</span>}
                  <span className="hero-card-name">{displayName(h, lang).main}</span>
                  {sug && <span className="hero-card-sub">{roleLabel(sug)}</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      <section className="dsec">
        <h3>
          {d.skillDeck}
          <span className="n">{d.deckCount(all.length, build.prepared.length, MAX_PREPARED)}</span>
        </h3>
        <DeckGroup title={d.basic} cards={groups.basic} prepared={preparedSet} canPrepare={canPrepare} onPrepare={togglePrepared} onOpen={onOpen} />
        <DeckGroup
          title={hero ? `${d.heroSkills} · ${displayName(hero, lang).main}` : d.heroSkills}
          cards={groups.hero}
          empty={d.pickHeroEmpty}
          prepared={preparedSet}
          canPrepare={canPrepare}
          onPrepare={togglePrepared}
          onOpen={onOpen}
        />
        <DeckGroup
          title={build.role ? `${d.roleSkills} · ${roleLabel(build.role)}` : d.roleSkills}
          cards={groups.role}
          empty={d.pickRoleEmpty}
          prepared={preparedSet}
          canPrepare={canPrepare}
          onPrepare={togglePrepared}
          onOpen={onOpen}
        />
        <DeckGroup
          title={d.bought}
          cards={groups.bought}
          empty={d.boughtEmpty}
          prepared={preparedSet}
          canPrepare={canPrepare}
          onPrepare={togglePrepared}
          onOpen={onOpen}
          action={(c) => ({ label: d.sell(c.cost), onClick: () => sell(c.id) })}
        />
        <DeckGroup
          title={d.titles}
          cards={groups.titles}
          empty={d.titlesEmpty}
          prepared={preparedSet}
          canPrepare={canPrepare}
          onPrepare={togglePrepared}
          onOpen={onOpen}
          action={(c) => ({ label: d.removeCard, onClick: () => set({ titles: build.titles.filter((x) => x !== c.id), prepared: build.prepared.filter((x) => x !== c.id) }) })}
          extra={<AddSelect placeholder={d.addTitle} options={titles} onPick={(id) => set({ titles: [...build.titles, id] })} />}
        />
        <DeckGroup
          title={d.weaknesses}
          cards={groups.weakness}
          empty={d.weaknessesEmpty}
          prepared={preparedSet}
          canPrepare={false}
          onOpen={onOpen}
          action={(c) => ({ label: d.removeCard, onClick: () => set({ weakness: build.weakness.filter((x) => x !== c.id) }) })}
          extra={<AddSelect placeholder={d.addWeakness} options={weaknesses} onPick={(id) => set({ weakness: [...build.weakness, id] })} />}
        />
      </section>

      <section className="dsec">
        <h3>
          {d.shop} <span className="n">{d.shopSub}</span>
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
                {d.xpEarned(roleLabel(activeShop))}
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
                {d.spentLeft(shopXp.spent)} <b className={shopXp.left < 0 ? 'neg' : ''}>{shopXp.left}</b>
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
                        {d.sell(c.cost)}
                      </button>
                    ) : (
                      <>
                        <button className="btn btn-sm is-buy" disabled={!ok} title={ok ? '' : d.short(short)} onClick={() => buy(c.id)}>
                          {d.buy}
                        </button>
                        <button className={`btn btn-sm ${planned ? 'is-on' : ''}`} onClick={() => togglePlan(c.id)}>
                          {planned ? d.fromPlan : d.toPlan}
                        </button>
                      </>
                    )}
                  </SkillRow>
                );
              })}
            </div>
          </>
        )}
        <p className="hint">{d.shopHint}</p>
      </section>

      {plan.length > 0 && (
        <section className="dsec">
          <h3>
            {d.plan}
            <span className="n">{d.planCount(plan.length, plan.reduce((s, c) => s + (c.cost ?? 0), 0))}</span>
          </h3>
          {[...planByRole.entries()].map(([role, list]) => {
            const x = xpOf(role);
            const deficit = x.planned - x.left;
            return (
              <div key={role} className="dgroup">
                <h4>
                  {roleLabel(role)}
                  <span className="dim">{d.planNeed(x.planned, Math.max(x.left, 0))}</span>
                  {deficit > 0 ? <span className="neg">{d.planShort(deficit)}</span> : <span className="pos">{d.planEnough}</span>}
                </h4>
                <div className="drows">
                  {list.map((c) => (
                    <SkillRow key={c.id} card={c} onOpen={onOpen} status="plan">
                      <button className="btn btn-sm is-buy" disabled={!affordable(c)} onClick={() => buy(c.id)}>
                        {d.buy}
                      </button>
                      <button className="btn btn-sm" onClick={() => togglePlan(c.id)}>
                        {d.removeCard}
                      </button>
                    </SkillRow>
                  ))}
                </div>
              </div>
            );
          })}
          <div className="row-actions">
            <button className="btn" disabled={!anyAffordable} onClick={buyAffordable}>
              {d.buyAffordable}
            </button>
          </div>
          <p className="hint">{d.planHint}</p>
        </section>
      )}

      <section className="dsec">
        <h3>
          {d.gear} <span className="n">{d.gearCount(gear.length)}</span>
        </h3>
        <div className="slots">
          <span className={gearCheck.armor > 1 ? 'neg' : ''}>
            <CardIcon name="armor" /> {d.slotArmor} {gearCheck.armor}/1
          </span>
          <span className={gearCheck.hands > 2 ? 'neg' : ''}>
            <CardIcon name="hands" /> {d.slotHands} {gearCheck.hands}/2
          </span>
          <span className={gearCheck.trinkets > 1 ? 'neg' : ''}>
            <CardIcon name="trinket" /> {d.slotTrinket} {gearCheck.trinkets}/1
          </span>
          <span className={gearCheck.mounts > 1 ? 'neg' : ''}>
            <CardIcon name="mount" /> {d.slotMount} {gearCheck.mounts}/1
          </span>
        </div>
        {gearCheck.problems.map((p) => (
          <div key={p} className="problem">
            {d.problem[p](gearCheck.hands)}
          </div>
        ))}
        <div className="drows">
          {gear.map((c, i) => {
            const options = familyOptions(c, cards);
            const better = options.filter((o) => tierIndex(o) > tierIndex(c)).length;
            const open = upgradeAt === i;
            return (
              <div key={`${c.id}-${i}`} className="gear-item">
                <ItemRow card={c} onOpen={onOpen}>
                  {options.length > 0 && (
                    <button className={`btn btn-sm ${open ? 'is-on' : ''}`} onClick={() => setUpgradeAt(open ? null : i)} aria-expanded={open}>
                      {d.upgrade}
                      {better > 0 && ` · ${better}`}
                    </button>
                  )}
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setUpgradeAt(null);
                      set({ gear: build.gear.filter((_, j) => j !== i) });
                    }}
                  >
                    {d.unequip}
                  </button>
                </ItemRow>
                {open && (
                  <UpgradeList
                    current={c}
                    options={options}
                    onOpen={onOpen}
                    onPick={(id) => {
                      setUpgradeAt(null);
                      set({ gear: build.gear.map((g, j) => (j === i ? id : g)) });
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="row-actions">
          <AddSelect
            placeholder={d.addGear}
            groups={ITEM_SUBS.map((s) => [t.subtype[s] ?? s, cards.filter((c) => c.kind === 'item' && c.subtype === s).sort(itemOrder)] as [string, Card[]])}
            label={(c) => itemOptionLabel(c, lang, t)}
            onPick={(id) => set({ gear: [...build.gear, id] })}
          />
          {hero && (
            <button className="btn btn-sm" onClick={() => set({ gear: startingGear(hero, cards) })}>
              {d.startingGear}
            </button>
          )}
        </div>
        <p className="hint">{d.gearHint}</p>
      </section>

      <section className="dsec">
        <h3>{d.stats}</h3>
        <div className="deck-sum">
          <span>
            <b>{stats.inDeck}</b> {d.inDeckN(stats.inDeck)}
            {build.prepared.length > 0 && <span className="dim">{d.plusPrepared(build.prepared.length)}</span>}
          </span>
          <span>
            <CardIcon name="success" /> <b>{stats.successInDeck}</b> {d.successes}
          </span>
          <span>
            <CardIcon name="fate" /> <b>{stats.fateInDeck}</b> {d.fates}
          </span>
          <span>
            {d.withSuccess} <b>{withSuccess}</b> {d.of} {stats.inDeck} ({stats.inDeck ? pct(withSuccess / stats.inDeck) : '—'})
          </span>
        </div>
        {hero && hero.stats && (
          <div className="stats-wrap">
            <table className="stats-table">
              <thead>
                <tr>
                  <th>{d.thStat}</th>
                  <th title={d.thCardsTitle}>{d.thCards}</th>
                  <th>{d.thAtLeast1}</th>
                  <th>{d.thAtLeast2}</th>
                  <th>{d.thExpected}</th>
                </tr>
              </thead>
              <tbody>
                {STAT_KEYS.map((k: StatKey) => {
                  const n = hero.stats![k];
                  const dist = successDistribution(deckCards, n);
                  const p1 = chanceAtLeast(dist, 1);
                  const p2 = chanceAtLeast(dist, 2);
                  return (
                    <tr key={k}>
                      <td>
                        <StatIcon stat={k} size={16} title={t.stat[k]} /> {t.stat[k]}
                      </td>
                      <td>{n}</td>
                      <td>
                        <b>{pct(p1)}</b>
                        <Bar p={p1} />
                      </td>
                      <td>
                        <b>{pct(p2)}</b>
                        <Bar p={p2} />
                      </td>
                      <td>{expectedSuccesses(n, stats).toFixed(1)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {stats.traits.length > 0 && (
          <div className="chips">
            {stats.traits.map(([tr, n]) => (
              <span key={tr} className="chip">
                {t.trait[tr] ?? tr} <b>{n}</b>
              </span>
            ))}
          </div>
        )}
        <p className="hint">{d.statsHint}</p>
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
  const { t } = useI18n();
  const d = t.deck;
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
                  title={isPrep ? d.unprepareTitle : canPrepare ? d.prepareTitle : d.maxPrepared(MAX_PREPARED)}
                  onClick={() => onPrepare(c.id)}
                  aria-pressed={isPrep}
                >
                  {isPrep ? d.prepared : d.prepare}
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
  const { lang, t } = useI18n();
  const { main } = displayName(card, lang);
  const traits = traitLine(card, lang, t);
  return (
    <div className={`drow ${typeClass(card)} ${prepared ? 'is-prepared' : ''}`}>
      <span className="drow-n">{card.number ?? '·'}</span>
      <button className="drow-name linklike" onClick={() => onOpen(card.id)}>
        <b>{main}</b>
      </button>
      <span className="drow-meta">
        {status === 'bought' && <span className="st st-bought">{t.deck.statusBought}</span>}
        {status === 'plan' && <span className="st st-plan">{t.deck.statusPlan}</span>}
        <OwnerBadge c={card} />
        {traits && <span className="drow-traits">{traits}</span>}
        <IconRow c={card} />
        <CostChip c={card} />
      </span>
      <span className="drow-actions">{children}</span>
    </div>
  );
}

function ItemRow({ card, onOpen, text, children }: { card: Card; onOpen: (id: string) => void; text?: boolean; children?: React.ReactNode }) {
  const { lang, t } = useI18n();
  const { main } = displayName(card, lang);
  const traits = traitLine(card, lang, t);
  const body = lang === 'en' ? card.text_en : card.text_ru ?? card.text_en;
  const stat = (x: string) => t.stat[x.toLowerCase() as StatKey] ?? x;
  const hands = handsOf(card);
  const test = card.test ?? [];
  return (
    <div className={`drow ${typeClass(card)} ${text ? 'has-text' : ''}`}>
      <span className="drow-n">
        <TierChip c={card} />
      </span>
      <button className="drow-name linklike" onClick={() => onOpen(card.id)}>
        <b>{main}</b>
      </button>
      <span className="drow-meta">
        <TypeBadge c={card} />
        {hands > 0 && <CardIcon name={hands > 1 ? 'hands' : 'hand'} title={t.hands(hands)} />}
        {card.ranged && <CardIcon name="ranged" title={t.ranged} />}
        {test.map((x) => (
          <StatIcon key={x} stat={x.toLowerCase() as StatKey} size={15} title={stat(x)} />
        ))}
        {card.number != null && (
          <span className="drow-lore" title={t.lore}>
            <CardIcon name="lore" /> {card.number}
          </span>
        )}
      </span>
      <span className="drow-actions">{children}</span>
      {text && body && (
        <div className="drow-text">
          {traits && <div className="drow-traits">{traits}</div>}
          <CardText text={body} className="small" />
        </div>
      )}
    </div>
  );
}

/** Other cards of an item's upgrade line, with the lore thresholds the app uses to offer them. */
function UpgradeList({ current, options, onOpen, onPick }: { current: Card; options: Card[]; onOpen: (id: string) => void; onPick: (id: string) => void }) {
  const { lang, t } = useI18n();
  const d = t.deck;
  const base = current.tier === 'I' ? current : options.find((o) => o.tier === 'I') ?? current;
  const lore = TIERS.map((t) => {
    const o = [current, ...options].find((x) => x.tier === t && x.number != null);
    return o ? `${t} — ${o.number}` : null;
  }).filter(Boolean);
  return (
    <div className="upgrade">
      <div className="upgrade-head">
        {d.line(displayName(base, lang).main)}
        {lore.length > 0 && <> · {d.loreLine(lore.join(', '))}</>}
      </div>
      <div className="drows">
        {options.map((o) => {
          const diff = tierIndex(o) - tierIndex(current);
          return (
            <ItemRow key={o.id} card={o} onOpen={onOpen} text>
              <button className={`btn btn-sm ${diff > 0 ? 'is-buy' : ''}`} onClick={() => onPick(o.id)}>
                {diff > 0 ? d.doUpgrade : diff === 0 ? d.replace : d.revert}
              </button>
            </ItemRow>
          );
        })}
      </div>
    </div>
  );
}

function Bar({ p }: { p: number }) {
  return (
    <span className="pbar" aria-hidden="true">
      <i style={{ width: `${Math.round(p * 100)}%` }} />
    </span>
  );
}

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
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
  const { lang } = useI18n();
  const lab = label ?? ((c: Card) => displayName(c, lang).main);
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

function itemOptionLabel(c: Card, lang: Lang, t: Dict): string {
  const { main, sub } = displayName(c, lang);
  const parts = [main];
  if (c.tier) parts.push(c.tier);
  const hands = handsOf(c);
  if (hands) parts.push(t.deck.handsShort(hands));
  if (c.number != null) parts.push(t.deck.loreShort(c.number));
  const exp = Array.isArray(c.expansion) ? c.expansion[0] : c.expansion;
  if (exp) parts.push(t.expShort[exp] ?? exp);
  return parts.join(' · ') + (sub && sub !== main ? ` (${sub})` : '');
}
