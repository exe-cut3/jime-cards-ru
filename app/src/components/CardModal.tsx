import { useEffect, useState } from 'react';
import { displayName, expansions, imageUrl } from '../data';
import { EXPANSION_LABEL, OWNER_LABEL, STAT_KEYS, STAT_LABEL, STAT_LABEL_EN, UI } from '../i18n';
import type { Card, StatKey } from '../types';
import { CostChip, ExpansionBadge, IconRow, OwnerBadge, TierChip, TypeBadge, typeClass } from './Badges';
import { CardText } from './CardText';
import { BookmarkIcon, CardIcon, CloseIcon, LinkIcon, StatIcon } from './Icons';

interface Props {
  card: Card;
  fav: boolean;
  onClose: () => void;
  onFav: (id: string) => void;
  onOpen: (id: string) => void;
  related: Card[]; // same owner / family
}

export function CardModal({ card, fav, onClose, onFav, onOpen, related }: Props) {
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [lang, setLang] = useState<'ru' | 'en'>('ru');
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setSide('front');
    setLang(card.image.front_ru ? 'ru' : 'en');
  }, [card.id, card.image.front_ru]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose]);

  const { main, sub } = displayName(card);
  const hasRu = Boolean(card.image.front_ru);
  const hasBack = Boolean(lang === 'ru' ? card.image.back_ru : card.image.back);
  const path = lang === 'ru' ? (side === 'back' ? card.image.back_ru : card.image.front_ru) : side === 'back' ? card.image.back : card.image.front;
  const img = imageUrl(path ?? (lang === 'ru' ? card.image.front_ru : card.image.front), lang === 'ru');
  const unverified = Boolean(card.text_ru) && card.translation && !card.translation.verified;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className={`modal ${typeClass(card)} ${card.kind === 'hero' ? 'is-landscape' : ''}`} role="dialog" aria-modal="true" aria-label={main} onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label={UI.close}>
          <CloseIcon />
        </button>

        <div className={`modal-img ${card.kind === 'hero' ? 'is-landscape' : ''}`}>
          {img ? <img src={img} alt={main} /> : <div className="tile-noimg">нет скана</div>}
          <div className="img-controls">
            {hasBack && (
              <div className="segmented small">
                <button className={side === 'front' ? 'is-on' : ''} onClick={() => setSide('front')}>
                  {UI.front}
                </button>
                <button className={side === 'back' ? 'is-on' : ''} onClick={() => setSide('back')}>
                  {UI.back}
                </button>
              </div>
            )}
            {hasRu && (
              <div className="segmented small">
                <button className={lang === 'ru' ? 'is-on' : ''} onClick={() => { setLang('ru'); if (!card.image.back_ru) setSide('front'); }}>
                  RU
                </button>
                <button className={lang === 'en' ? 'is-on' : ''} onClick={() => { setLang('en'); if (!card.image.back) setSide('front'); }}>
                  EN
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-title">
            <h2>{main}</h2>
            {sub && <div className="modal-sub">{sub}</div>}
          </div>
          <div className="tile-meta">
            <TypeBadge c={card} />
            <OwnerBadge c={card} />
            <CostChip c={card} />
            <TierChip c={card} />
            <IconRow c={card} />
            <ExpansionBadge c={card} long />
          </div>

          {card.kind === 'hero' && card.stats && <HeroStats card={card} />}

          {card.kind === 'item' && <ItemFacts card={card} />}

          {(card.traits_ru || (card.traits && card.traits.length > 0)) && (
            <div className="traits">
              {card.traits_ru ?? card.traits!.join(' · ')}
              {card.traits_ru && card.traits && card.traits.length > 0 && <span className="dim"> · {card.traits.join(' · ')}</span>}
            </div>
          )}

          <section className="texts">
            {card.text_ru ? (
              <CardText text={card.text_ru} className="ru" />
            ) : card.no_text ? null : (
              <div className="todo-note">RU: {UI.noRu}</div>
            )}
            {unverified && <div className="todo-note">{card.translation?.proofread ? UI.proofreadNote : UI.ocrNote}</div>}
            {card.text_en && <CardText text={card.text_en} className={card.text_ru ? 'en dim' : 'en'} />}
          </section>

          {card.kind === 'hero' && (card.background_ru || card.background_en || card.suggested_role) && (
            <section className="hero-extra">
              {(card.background_ru || card.background_en) && (
                <>
                  <h4>{UI.background}</h4>
                  <p className="flavour">{card.background_ru ?? card.background_en}</p>
                  {card.background_ru && card.background_en && <p className="flavour dim small">{card.background_en}</p>}
                </>
              )}
              {card.suggested_role && (
                <>
                  <h4>{UI.suggested}</h4>
                  <p>
                    <span className="badge badge-owner is-role">{card.suggested_role}</span>
                    {card.starting_gear && card.starting_gear.length > 0 && <> · {card.starting_gear.join(', ')}</>}
                  </p>
                  {card.suggested_ru && <p className="dim">{card.suggested_ru}</p>}
                </>
              )}
            </section>
          )}

          <dl className="facts">
            {card.number != null && (
              <>
                <dt>{card.kind === 'item' ? UI.lore : UI.number}</dt>
                <dd>
                  {card.owner && card.kind === 'skill' ? `${OWNER_LABEL[card.owner] ?? card.owner} ` : ''}
                  {card.number}
                </dd>
              </>
            )}
            {card.copies != null && card.copies > 1 && (
              <>
                <dt>{UI.copies}</dt>
                <dd>{card.copies}</dd>
              </>
            )}
            {card.count != null && card.count > 1 && (
              <>
                <dt>в колоде</dt>
                <dd>{card.count}</dd>
              </>
            )}
            {expansions(card).length > 0 && (
              <>
                <dt>{UI.expansion}</dt>
                <dd>{expansions(card).map((e) => EXPANSION_LABEL[e] ?? e).join(', ')}</dd>
              </>
            )}
          </dl>

          {related.length > 0 && (
            <section className="related">
              <h4>{card.kind === 'item' ? 'Линейка улучшений' : 'Той же принадлежности'}</h4>
              <div className="related-list">
                {related.map((r) => (
                  <button key={r.id} className={`related-item ${r.id === card.id ? 'is-current' : ''}`} onClick={() => onOpen(r.id)}>
                    {r.kind === 'item' && r.tier && <span className="chip chip-tier">{r.tier}</span>}
                    {r.kind === 'skill' && r.number != null && <span className="chip chip-n">{r.number}</span>}
                    {displayName(r).main}
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="modal-actions">
            <button className={`btn ${fav ? 'is-on' : ''}`} onClick={() => onFav(card.id)}>
              <BookmarkIcon filled={fav} size={16} /> {fav ? UI.unbookmark : UI.bookmark}
            </button>
            <button className="btn" onClick={copyLink}>
              <LinkIcon /> {copied ? UI.copied : UI.copyLink}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroStats({ card }: { card: Card }) {
  const s = card.stats!;
  return (
    <div className="herostats">
      {STAT_KEYS.map((k: StatKey) => (
        <div key={k} className="stat">
          <StatIcon stat={k} size={18} title={STAT_LABEL[k]} />
          <span className="stat-n">{s[k]}</span>
          <span className="stat-l">{STAT_LABEL[k]}</span>
        </div>
      ))}
      <div className="stat stat-sep" />
      <div className="stat">
        <CardIcon name="inspiration" size={18} />
        <span className="stat-n">{card.inspiration ?? '—'}</span>
        <span className="stat-l">Воодушевление</span>
      </div>
      <div className="stat">
        <CardIcon name="fear" size={18} />
        <span className="stat-n">{card.fear ?? '—'}</span>
        <span className="stat-l">Предел страха</span>
      </div>
      <div className="stat">
        <CardIcon name="damage" size={18} />
        <span className="stat-n">{card.damage ?? '—'}</span>
        <span className="stat-l">Предел урона</span>
      </div>
    </div>
  );
}

function ItemFacts({ card }: { card: Card }) {
  const test = card.test ?? [];
  return (
    <div className="itemfacts">
      {test.length > 0 && (
        <span className="itemfact">
          {test.map((t) => (
            <StatIcon key={t} stat={t.toLowerCase() as StatKey} size={16} title={STAT_LABEL_EN[t] ?? t} />
          ))}
          <span>{test.map((t) => STAT_LABEL_EN[t] ?? t).join(' / ')}</span>
        </span>
      )}
      {card.hands_or_tokens != null && (
        <span className="itemfact">{card.subtype === 'Trinket' ? `${card.hands_or_tokens} depletion` : `${card.hands_or_tokens}-hand`}</span>
      )}
      {card.ranged && <span className="itemfact">ranged</span>}
      {card.family && card.family !== card.name_en && <span className="itemfact dim">{card.family}</span>}
    </div>
  );
}
