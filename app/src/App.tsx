import { useCallback, useEffect, useMemo, useState } from 'react';
import { CardModal } from './components/CardModal';
import { CardTile } from './components/CardTile';
import { FiltersPanel } from './components/Filters';
import { BookmarkIcon, FilterIcon } from './components/Icons';
import { applyFilters, buildFacets, countByKind, loadDb, loadFavs, saveFavs } from './data';
import { UI } from './i18n';
import { buildIndex, searchIds } from './search';
import type { Card, Db, Filters } from './types';
import { isEmptyFilters, readCardId, readFilters, writeUrl } from './url';

const PAGE = 120;

export default function App() {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => readFilters());
  const [cardId, setCardId] = useState<string | null>(() => readCardId());
  const [favs, setFavs] = useState<Set<string>>(() => loadFavs());
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);

  useEffect(() => {
    loadDb().then(setDb).catch((e) => setError(String(e)));
  }, []);

  // back / forward buttons
  useEffect(() => {
    const onPop = () => {
      setFilters(readFilters());
      setCardId(readCardId());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const cards = db?.cards ?? [];
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const index = useMemo(() => (cards.length ? buildIndex(cards) : null), [cards]);
  const facets = useMemo(() => buildFacets(cards), [cards]);
  const counts = useMemo(() => countByKind(cards), [cards]);

  const hits = useMemo(() => (index ? searchIds(index, filters.q) : null), [index, filters.q]);
  const visible = useMemo(() => applyFilters(cards, filters, hits, favs), [cards, filters, hits, favs]);

  const updateFilters = useCallback(
    (next: Filters, replace = false) => {
      setFilters(next);
      setLimit(PAGE);
      writeUrl(next, null, replace);
    },
    [],
  );

  const openCard = useCallback(
    (id: string | null) => {
      setCardId(id);
      writeUrl(filters, id);
    },
    [filters],
  );
  const closeCard = useCallback(() => openCard(null), [openCard]);

  const toggleFav = useCallback((id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavs(next);
      return next;
    });
  }, []);

  const current = cardId ? byId.get(cardId) ?? null : null;
  const related = useMemo(() => (current ? relatedCards(current, cards) : []), [current, cards]);
  const dirty = !isEmptyFilters(filters);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>{UI.title}</h1>
          <span className="brand-sub">{UI.subtitle}</span>
        </div>
        <div className="search">
          <input
            type="search"
            value={filters.q}
            placeholder={UI.search}
            onChange={(e) => updateFilters({ ...filters, q: e.target.value }, true)}
            aria-label={UI.search}
          />
        </div>
        <div className="topbar-actions">
          <button className={`btn btn-icon ${filters.fav ? 'is-on' : ''}`} onClick={() => updateFilters({ ...filters, fav: !filters.fav })} aria-pressed={filters.fav} title={UI.bookmarks}>
            <BookmarkIcon filled={filters.fav} />
            <span className="btn-label">{UI.bookmarks}</span>
            {favs.size > 0 && <span className="count">{favs.size}</span>}
          </button>
          <button className={`btn btn-icon only-mobile ${showFilters ? 'is-on' : ''}`} onClick={() => setShowFilters((v) => !v)} aria-expanded={showFilters}>
            <FilterIcon />
            <span className="btn-label">{UI.filters}</span>
          </button>
        </div>
      </header>

      <div className="layout">
        <aside className={`sidebar ${showFilters ? 'is-open' : ''}`}>
          <FiltersPanel f={filters} facets={facets} counts={counts} onChange={(n) => updateFilters(n)} onReset={() => updateFilters({ ...readFilters(''), q: '' })} dirty={dirty} />
        </aside>

        <main className="content">
          {error && <div className="error">Не удалось загрузить данные: {error}</div>}
          {!db && !error && <div className="loading">Загрузка…</div>}
          {db && (
            <>
              <div className="resultbar">
                <span>{UI.found(visible.length)}</span>
              </div>
              {visible.length === 0 ? (
                <div className="empty">{UI.nothing}</div>
              ) : (
                <div className="grid">
                  {visible.slice(0, limit).map((c) => (
                    <CardTile key={c.id} card={c} fav={favs.has(c.id)} onOpen={openCard} onFav={toggleFav} />
                  ))}
                </div>
              )}
              {visible.length > limit && (
                <div className="more">
                  <button className="btn" onClick={() => setLimit((l) => l + PAGE)}>
                    Показать ещё ({visible.length - limit})
                  </button>
                </div>
              )}
            </>
          )}
          <footer className="disclaimer">{UI.disclaimer}</footer>
        </main>
      </div>

      {current && <CardModal card={current} fav={favs.has(current.id)} onClose={closeCard} onFav={toggleFav} onOpen={openCard} related={related} />}
    </div>
  );
}

/** Cards shown as "related" in the modal: same owner (skills) or same upgrade family (items). */
function relatedCards(c: Card, all: Card[]): Card[] {
  if (c.kind === 'skill' && c.owner && ['Hero', 'Role'].includes(c.subtype ?? '')) {
    return all.filter((x) => x.kind === 'skill' && x.owner === c.owner).sort((a, b) => (a.number ?? 0) - (b.number ?? 0));
  }
  if (c.kind === 'item' && c.family) {
    const tierOrder = ['I', 'II', 'III', 'IV'];
    return all.filter((x) => x.kind === 'item' && x.family === c.family).sort((a, b) => tierOrder.indexOf(a.tier ?? '') - tierOrder.indexOf(b.tier ?? ''));
  }
  if (c.kind === 'hero') {
    const slug = c.id.replace('hero-', '');
    return all.filter((x) => x.kind === 'skill' && x.subtype === 'Hero' && x.owner && slugify(x.owner).startsWith(slug.split('-')[0]));
  }
  return [];
}

function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
}
