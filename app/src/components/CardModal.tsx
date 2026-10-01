import { useEffect, useRef, useState } from 'react';
import { displayName, expansions, imageUrl, traitLine, traitLineEn } from '../data';
import { type Dict, STAT_KEYS, useI18n } from '../i18n';
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
  onPrev?: () => void; // neighbours in the current list (arrow keys, swipe)
  onNext?: () => void;
  position?: { index: number; total: number };
}

// Russian interface: the English original of a card is one tap away and the choice is remembered,
// so someone who always compares keeps it open.
const ORIGINAL_KEY = 'jime.original';
function loadOriginal(): boolean {
  try {
    return localStorage.getItem(ORIGINAL_KEY) === '1';
  } catch {
    return false;
  }
}
function saveOriginal(v: boolean): void {
  try {
    localStorage.setItem(ORIGINAL_KEY, v ? '1' : '0');
  } catch {
    /* ignore */
  }
}

// the spreadsheet spells Bilbo's role "Burgler"
const fixRole = (r: string | null | undefined) => (r === 'Burgler' ? 'Burglar' : r ?? '');

function quoteList(items: string[], and: string): string {
  const q = items.map((x) => `“${x}”`);
  return q.length > 1 ? `${q.slice(0, -1).join(', ')} ${and} ${q[q.length - 1]}` : q.join('');
}

export function CardModal({ card, fav, onClose, onFav, onOpen, related, onPrev, onNext, position }: Props) {
  const { lang, t } = useI18n();
  const ru = lang === 'ru';
  const [side, setSide] = useState<'front' | 'back'>('front');
  const [scanLang, setScanLang] = useState<'ru' | 'en'>(ru ? 'ru' : 'en');
  const [copied, setCopied] = useState(false);
  const [zoom, setZoom] = useState(false);
  const [showOriginal, setShowOriginal] = useState<boolean>(() => loadOriginal());
  const touch = useRef<{ x: number; y: number; atTop: boolean } | null>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setSide('front');
    setScanLang(ru && card.image.front_ru ? 'ru' : card.image.front ? 'en' : 'ru');
    setZoom(false);
    scroller.current?.scrollTo({ top: 0 });
  }, [card.id, card.image.front_ru, card.image.front, ru]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (zoom) setZoom(false);
        else onClose();
      } else if (e.key === 'ArrowLeft') onPrev?.();
      else if (e.key === 'ArrowRight') onNext?.();
    };
    window.addEventListener('keydown', onKey);
    document.body.classList.add('modal-open');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('modal-open');
    };
  }, [onClose, onPrev, onNext, zoom]);

  function toggleOriginal() {
    setShowOriginal((v) => {
      saveOriginal(!v);
      return !v;
    });
  }

  // Phones: a horizontal swipe flips to the neighbouring card; pulling the sheet down while its
  // content is scrolled to the top closes it (the sheet follows the finger).
  const setPull = (dy: number, animate = false) => {
    const el = sheet.current;
    if (!el) return;
    el.style.transition = animate ? 'transform 0.18s ease-out' : '';
    el.style.transform = dy > 0 ? `translateY(${dy}px)` : '';
  };
  const onTouchStart = (e: React.TouchEvent) => {
    const tt = e.touches[0];
    touch.current = { x: tt.clientX, y: tt.clientY, atTop: (scroller.current?.scrollTop ?? 0) <= 0 };
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const s = touch.current;
    if (!s || !s.atTop) return;
    const tt = e.touches[0];
    const dy = tt.clientY - s.y;
    const dx = tt.clientX - s.x;
    if (dy > 0 && dy > Math.abs(dx)) setPull(dy);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const tt = e.changedTouches[0];
    const dx = tt.clientX - s.x;
    const dy = tt.clientY - s.y;
    if (s.atTop && dy > 110 && dy > Math.abs(dx) * 1.5) {
      onClose();
      return;
    }
    setPull(0, true);
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) onNext?.();
      else onPrev?.();
    }
  };

  const { main, sub } = displayName(card, lang);
  const hasRuScan = Boolean(card.image.front_ru);
  const showScanSwitch = ru && hasRuScan && Boolean(card.image.front);
  const hasBack = Boolean(scanLang === 'ru' ? card.image.back_ru : card.image.back);
  const path = scanLang === 'ru' ? (side === 'back' ? card.image.back_ru : card.image.front_ru) : side === 'back' ? card.image.back : card.image.front;
  const img = imageUrl(path ?? (scanLang === 'ru' ? card.image.front_ru : card.image.front), scanLang === 'ru');
  // The Great Bear's back explains the alternate form instead of a background
  const altForm = card.kind === 'hero' && /alternate form/i.test(card.background_en ?? '');

  // texts in the interface language
  const traits = traitLine(card, lang, t);
  const text = ru ? card.text_ru : card.text_en;
  const background = ru ? card.background_ru ?? card.background_en : card.background_en;
  const gearEn = card.starting_gear ?? [];
  const suggestedEn = altForm
    ? quoteList(gearEn, 'and')
    : [card.suggested_role ? `“${fixRole(card.suggested_role)}” ${t.suggestedRole}` : null, gearEn.length ? quoteList(gearEn, 'and') : null].filter(Boolean).join('\n');
  const suggested = ru ? card.suggested_ru ?? null : suggestedEn || null;
  const race = ru ? card.race_ru ?? null : card.race ?? null;

  // the English original, offered next to the Russian text
  const hasOriginal = ru && Boolean(card.text_en || card.background_en);
  const tr = card.translation;
  const note = !ru || !card.text_ru || !tr
    ? null
    : tr.proofread === 'scan'
      ? { text: `✓ ${t.scanNote}`, title: t.scanNoteTitle }
      : tr.proofread === 'llm-unofficial'
        ? { text: t.unofficialNote, title: '' }
        : tr.proofread
          ? { text: t.proofreadNote, title: '' }
          : { text: t.ocrNote, title: '' };

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
      <div
        className={`modal ${typeClass(card)} ${card.kind === 'hero' ? 'is-landscape' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={main}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        ref={sheet}
      >
        <button className="modal-close" onClick={onClose} aria-label={t.close}>
          <CloseIcon />
        </button>
        {position && (
          <span className="modal-pos" aria-hidden="true">
            {position.index} / {position.total}
          </span>
        )}

        {/* phones: only this part scrolls, the close button and the dock stay in place */}
        <div className="modal-scroll" ref={scroller}>
          <div className={`modal-img ${card.kind === 'hero' ? 'is-landscape' : ''}`}>
            {img ? (
              <button className="modal-zoom" onClick={() => setZoom(true)} aria-label={t.zoom}>
                <img src={img} alt={main} />
              </button>
            ) : (
              <div className="tile-noimg">{t.noScan}</div>
            )}
            {onPrev && (
              <button className="modal-nav prev" onClick={onPrev} aria-label={t.prev}>
                ‹
              </button>
            )}
            {onNext && (
              <button className="modal-nav next" onClick={onNext} aria-label={t.next}>
                ›
              </button>
            )}
            <div className="img-controls">
              {hasBack && (
                <div className="segmented small">
                  <button className={side === 'front' ? 'is-on' : ''} onClick={() => setSide('front')}>
                    {t.front}
                  </button>
                  <button className={side === 'back' ? 'is-on' : ''} onClick={() => setSide('back')}>
                    {t.back}
                  </button>
                </div>
              )}
              {showScanSwitch && (
                <div className="segmented small" aria-label={t.language}>
                  <button
                    className={scanLang === 'ru' ? 'is-on' : ''}
                    onClick={() => {
                      setScanLang('ru');
                      if (!card.image.back_ru) setSide('front');
                    }}
                  >
                    RU
                  </button>
                  <button
                    className={scanLang === 'en' ? 'is-on' : ''}
                    onClick={() => {
                      setScanLang('en');
                      if (!card.image.back) setSide('front');
                    }}
                  >
                    EN
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="modal-body">
            <div className="modal-title">
              <h2>{main}</h2>
              {sub && (
                <div className="modal-sub" lang="en">
                  {sub}
                </div>
              )}
            </div>
            <div className="tile-meta">
              <TypeBadge c={card} />
              <OwnerBadge c={card} />
              <CostChip c={card} />
              <TierChip c={card} />
              <IconRow c={card} />
              <ExpansionBadge c={card} long />
            </div>

            {card.kind === 'hero' && card.stats && <HeroStats card={card} t={t} />}

            {card.kind === 'item' && <ItemFacts card={card} t={t} showFamily={!ru} />}

            {traits && <div className="traits">{traits}</div>}

            <section className="texts">
              {text ? <CardText text={text} className={ru ? 'ru' : 'en'} /> : ru && !card.no_text ? <div className="todo-note">{t.noText}</div> : null}

              {(note || hasOriginal) && (
                <div className="text-meta">
                  {note ? (
                    <span className="text-note" title={note.title}>
                      {note.text}
                    </span>
                  ) : (
                    <span />
                  )}
                  {hasOriginal && (
                    <button className={`orig-toggle ${showOriginal ? 'is-on' : ''}`} onClick={toggleOriginal} aria-expanded={showOriginal} title={t.originalTitle}>
                      <span className="orig-chip">EN</span>
                      {t.original}
                      <span className="orig-chev" aria-hidden="true">
                        ›
                      </span>
                    </button>
                  )}
                </div>
              )}

              {ru && showOriginal && (card.text_en || traitLineEn(card)) && (
                <div className="original" lang="en">
                  {traitLineEn(card) && <div className="original-traits">{traitLineEn(card)}</div>}
                  {card.text_en && <CardText text={card.text_en} className="en" />}
                </div>
              )}
            </section>

            {card.kind === 'hero' && (background || suggested) && (
              <section className="hero-extra">
                {background && (
                  <>
                    <h4>{altForm ? t.altForm : t.background}</h4>
                    <Paragraphs text={background} className="flavour" />
                    {ru && showOriginal && card.background_ru && card.background_en && (
                      <div className="original" lang="en">
                        <Paragraphs text={card.background_en} className="flavour" />
                      </div>
                    )}
                  </>
                )}
                {suggested && (
                  <>
                    <h4>{altForm ? t.mandatedGear : t.suggested}</h4>
                    <Paragraphs text={suggested} className="suggested" />
                    {ru && showOriginal && suggestedEn && (
                      <div className="original" lang="en">
                        <Paragraphs text={suggestedEn} className="suggested" />
                      </div>
                    )}
                  </>
                )}
              </section>
            )}

            <dl className="facts">
              {race && (
                <>
                  <dt>{t.race}</dt>
                  <dd>{race}</dd>
                </>
              )}
              {card.number != null && (
                <>
                  <dt>{card.kind === 'item' ? t.lore : t.number}</dt>
                  <dd>
                    {card.owner && card.kind === 'skill' ? `${t.owner(card.owner)} ` : ''}
                    {card.number}
                  </dd>
                </>
              )}
              {card.copies != null && card.copies > 1 && (
                <>
                  <dt>{t.copies}</dt>
                  <dd>{card.copies}</dd>
                </>
              )}
              {card.count != null && card.count > 1 && (
                <>
                  <dt>{t.inDeck}</dt>
                  <dd>{card.count}</dd>
                </>
              )}
              {expansions(card).length > 0 && (
                <>
                  <dt>{t.expansion}</dt>
                  <dd>{expansions(card).map((e) => t.exp[e] ?? e).join(', ')}</dd>
                </>
              )}
            </dl>

            {related.length > 0 && (
              <section className="related">
                <h4>{card.kind === 'item' ? t.upgradeLine : t.sameOwner}</h4>
                <div className="related-list">
                  {related.map((r) => (
                    <button key={r.id} className={`related-item ${r.id === card.id ? 'is-current' : ''}`} onClick={() => onOpen(r.id)}>
                      {r.kind === 'item' && r.tier && <span className="chip chip-tier">{r.tier}</span>}
                      {r.kind === 'skill' && r.number != null && <span className="chip chip-n">{r.number}</span>}
                      {displayName(r, lang).main}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className="modal-actions">
              <button className={`btn ${fav ? 'is-on' : ''}`} onClick={() => onFav(card.id)}>
                <BookmarkIcon filled={fav} size={16} /> {fav ? t.unbookmark : t.bookmark}
              </button>
              <button className="btn" onClick={copyLink}>
                <LinkIcon /> {copied ? t.copied : t.copyLink}
              </button>
            </div>
          </div>
        </div>

        {/* phones: thumb-reach controls at the bottom of the sheet */}
        <div className="modal-dock">
          <button onClick={onPrev} disabled={!onPrev} aria-label={t.prev}>
            ‹
          </button>
          <button className="dock-close" onClick={onClose}>
            {t.close}
            {position && (
              <span className="dock-pos">
                {position.index} / {position.total}
              </span>
            )}
          </button>
          <button onClick={onNext} disabled={!onNext} aria-label={t.next}>
            ›
          </button>
        </div>
      </div>

      {zoom && img && (
        <div
          className="lightbox"
          onClick={(e) => {
            e.stopPropagation();
            setZoom(false);
          }}
          role="presentation"
        >
          <img src={img} alt={main} />
        </div>
      )}
    </div>
  );
}

/** Multi-paragraph text: one <p> per line of the source. */
function Paragraphs({ text, className }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  return (
    <>
      {text
        .split(/\n+/)
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l, i) => (
          <p key={i} className={className}>
            {l}
          </p>
        ))}
    </>
  );
}

function HeroStats({ card, t }: { card: Card; t: Dict }) {
  const s = card.stats!;
  return (
    <div className="herostats">
      {STAT_KEYS.map((k: StatKey) => (
        <div key={k} className="stat">
          <StatIcon stat={k} size={18} title={t.stat[k]} />
          <span className="stat-n">{s[k]}</span>
          <span className="stat-l">{t.stat[k]}</span>
        </div>
      ))}
      <div className="stat stat-sep" />
      <div className="stat">
        <CardIcon name="inspiration" size={18} />
        <span className="stat-n">{card.inspiration ?? '—'}</span>
        <span className="stat-l">{t.inspiration}</span>
      </div>
      <div className="stat">
        <CardIcon name="fear" size={18} />
        <span className="stat-n">{card.fear ?? '—'}</span>
        <span className="stat-l">{t.fearLimit}</span>
      </div>
      <div className="stat">
        <CardIcon name="damage" size={18} />
        <span className="stat-n">{card.damage ?? '—'}</span>
        <span className="stat-l">{t.damageLimit}</span>
      </div>
    </div>
  );
}

function ItemFacts({ card, t, showFamily }: { card: Card; t: Dict; showFamily: boolean }) {
  const test = card.test ?? [];
  const stat = (x: string) => t.stat[x.toLowerCase() as StatKey] ?? x;
  const n = Number(card.hands_or_tokens);
  return (
    <div className="itemfacts">
      {test.length > 0 && (
        <span className="itemfact">
          {test.map((x) => (
            <StatIcon key={x} stat={x.toLowerCase() as StatKey} size={16} title={stat(x)} />
          ))}
          <span>{test.map(stat).join(' / ')}</span>
        </span>
      )}
      {card.hands_or_tokens != null && (
        <span className="itemfact">{card.subtype === 'Trinket' ? t.depletion(card.hands_or_tokens) : t.hands(Number.isFinite(n) ? n : 1)}</span>
      )}
      {card.ranged && <span className="itemfact">{t.ranged}</span>}
      {showFamily && card.family && card.family !== card.name_en && <span className="itemfact dim">{card.family}</span>}
    </div>
  );
}
