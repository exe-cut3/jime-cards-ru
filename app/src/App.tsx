import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CardModal } from './components/CardModal';
import { CardTile } from './components/CardTile';
import { ActiveFilters, FiltersPanel, countActive } from './components/Filters';
import { BookmarkIcon, CardsIcon, DeckIcon, FilterIcon } from './components/Icons';
import { DeckMain } from './components/deck/DeckMain';
import { DeckSetup } from './components/deck/DeckSetup';
import { applyFilters, buildFacets, countByKind, displayName, loadDb, loadFavs, saveFavs } from './data';
import { type Build, allRoles, decodeBuild, loadBuilds, loadCurrentId, newBuild, playableHeroes, saveBuilds, saveCurrentId, uid } from './deck';
import { UI } from './i18n';
import { buildIndex, searchIds } from './search';
import type { Card, Db, Filters } from './types';
import { type View, isEmptyFilters, readCardId, readFilters, readSharedBuild, readView, writeUrl } from './url';

const PAGE = 120;

export default function App() {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(() => readFilters());
  const [cardId, setCardId] = useState<string | null>(() => readCardId());
  const [favs, setFavs] = useState<Set<string>>(() => loadFavs());
  const [showFilters, setShowFilters] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [view, setView] = useState<View>(() => readView());
  const [builds, setBuilds] = useState<Build[]>(() => loadBuilds());
  const [buildId, setBuildId] = useState<string | null>(() => loadCurrentId());
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const imported = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDb().then(setDb).catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  // a build shared as a link: import it as a new build, then drop it from the URL
  useEffect(() => {
    if (imported.current) return;
    imported.current = true;
    const s = readSharedBuild();
    if (!s) return;
    const b = decodeBuild(s);
    if (b) {
      if (!b.name.endsWith('(по ссылке)')) b.name += ' (по ссылке)';
      setBuilds((prev) => {
        const next = [...prev, b];
        saveBuilds(next);
        return next;
      });
      setBuildId(b.id);
      saveCurrentId(b.id);
      setView('deck');
    }
    writeUrl(readFilters(), readCardId(), true, 'deck');
  }, []);

  // the planner always has at least one build to show
  useEffect(() => {
    if (view === 'deck' && builds.length === 0) {
      const b = newBuild('Мой билд');
      setBuilds([b]);
      saveBuilds([b]);
      setBuildId(b.id);
      saveCurrentId(b.id);
    }
  }, [view, builds.length]);

  // back / forward buttons
  useEffect(() => {
    const onPop = () => {
      setFilters(readFilters());
      setCardId(readCardId());
      setView(readView());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // the filters drawer on phones locks page scroll behind it
  useEffect(() => {
    document.body.classList.toggle('drawer-open', showFilters && view === 'cards');
    return () => document.body.classList.remove('drawer-open');
  }, [showFilters, view]);

  const cards = db?.cards ?? [];
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const index = useMemo(() => (cards.length ? buildIndex(cards) : null), [cards]);
  const facets = useMemo(() => buildFacets(cards), [cards]);
  const counts = useMemo(() => countByKind(cards), [cards]);
  const heroes = useMemo(() => playableHeroes(cards), [cards]);
  const roles = useMemo(() => allRoles(cards), [cards]);

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
      writeUrl(filters, id, false, view);
    },
    [filters, view],
  );
  const closeCard = useCallback(() => openCard(null), [openCard]);

  const switchView = useCallback(
    (v: View) => {
      setView(v);
      setCardId(null);
      setShowFilters(false);
      writeUrl(filters, null, false, v);
      window.scrollTo({ top: 0 });
    },
    [filters],
  );

  const toggleFav = useCallback((id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveFavs(next);
      return next;
    });
  }, []);

  // more tiles as the grid scrolls (the button below stays as a fallback)
  const hasMore = visible.length > limit;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setLimit((l) => l + PAGE);
      },
      { rootMargin: '600px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, limit]);

  // ---- builds
  const build = builds.find((b) => b.id === buildId) ?? builds[0] ?? null;
  const currentBuildId = build?.id ?? null;

  const updateBuild = useCallback(
    (fn: (b: Build) => Build) => {
      if (!currentBuildId) return;
      setBuilds((prev) => {
        const next = prev.map((b) => (b.id === currentBuildId ? fn(b) : b));
        saveBuilds(next);
        return next;
      });
    },
    [currentBuildId],
  );

  const selectBuild = useCallback((id: string) => {
    setBuildId(id);
    saveCurrentId(id);
  }, []);

  const createBuild = useCallback(() => {
    const b = newBuild(`Билд ${builds.length + 1}`);
    const next = [...builds, b];
    setBuilds(next);
    saveBuilds(next);
    selectBuild(b.id);
  }, [builds, selectBuild]);

  const duplicateBuild = useCallback(() => {
    if (!build) return;
    const b: Build = { ...build, id: uid(), name: `${build.name} (копия)`, updated: Date.now() };
    const next = [...builds, b];
    setBuilds(next);
    saveBuilds(next);
    selectBuild(b.id);
  }, [build, builds, selectBuild]);

  const deleteBuild = useCallback(() => {
    if (!build) return;
    if (!window.confirm(`Удалить билд «${build.name}»?`)) return;
    const next = builds.filter((b) => b.id !== build.id);
    setBuilds(next);
    saveBuilds(next);
    selectBuild(next[0]?.id ?? '');
  }, [build, builds, selectBuild]);

  const current = cardId ? byId.get(cardId) ?? null : null;
  const related = useMemo(() => (current ? relatedCards(current, cards) : []), [current, cards]);
  const dirty = !isEmptyFilters(filters);
  const isDeck = view === 'deck';
  const activeCount = countActive(filters);

  // previous / next card inside the current list (cards view only)
  const navIndex = current && !isDeck ? visible.findIndex((c) => c.id === current.id) : -1;
  const prevCard = navIndex > 0 ? visible[navIndex - 1] : null;
  const nextCard = navIndex >= 0 && navIndex < visible.length - 1 ? visible[navIndex + 1] : null;
  const openPrev = useCallback(() => prevCard && openCard(prevCard.id), [prevCard, openCard]);
  const openNext = useCallback(() => {
    if (!nextCard) return;
    if (navIndex + 1 >= limit) setLimit((l) => l + PAGE);
    openCard(nextCard.id);
  }, [nextCard, navIndex, limit, openCard]);

  useEffect(() => {
    const site = UI.title;
    document.title = current ? `${displayName(current).main} — ${site}` : isDeck && build ? `${build.name} · ${UI.viewDeck} — ${site}` : `${site} — ${UI.subtitle}`;
  }, [current, isDeck, build]);

  const showBookmarks = () => {
    if (isDeck) switchView('cards');
    updateFilters({ ...filters, fav: !filters.fav });
  };
  const showFiltersDrawer = () => {
    if (isDeck) {
      switchView('cards');
      setShowFilters(true);
    } else setShowFilters((v) => !v);
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <h1>{UI.title}</h1>
          <span className="brand-sub">{UI.subtitle}</span>
          {!online && (
            <span className="online-badge" title="Нет сети: показываются сохранённые данные">
              {UI.offline}
            </span>
          )}
        </div>
        <div className="search">
          {!isDeck && (
            <input
              type="search"
              value={filters.q}
              placeholder={UI.search}
              onChange={(e) => updateFilters({ ...filters, q: e.target.value }, true)}
              aria-label={UI.search}
            />
          )}
        </div>
        <div className="topbar-actions">
          <div className="viewswitch" role="tablist">
            <button role="tab" className={!isDeck ? 'is-on' : ''} aria-selected={!isDeck} onClick={() => switchView('cards')} title={UI.viewCards}>
              <CardsIcon size={16} />
              <span className="btn-label">{UI.viewCards}</span>
            </button>
            <button role="tab" className={isDeck ? 'is-on' : ''} aria-selected={isDeck} onClick={() => switchView('deck')} title={UI.viewDeck}>
              <DeckIcon size={16} />
              <span className="btn-label">{UI.viewDeck}</span>
            </button>
          </div>
          {!isDeck && (
            <button className={`btn btn-icon ${filters.fav ? 'is-on' : ''}`} onClick={() => updateFilters({ ...filters, fav: !filters.fav })} aria-pressed={filters.fav} title={UI.bookmarks}>
              <BookmarkIcon filled={filters.fav} />
              <span className="btn-label">{UI.bookmarks}</span>
              {favs.size > 0 && <span className="count">{favs.size}</span>}
            </button>
          )}
        </div>
      </header>

      <div className={`layout ${isDeck ? 'is-deck' : ''}`}>
        {showFilters && !isDeck && <div className="drawer-backdrop" onClick={() => setShowFilters(false)} role="presentation" />}
        <aside className={`sidebar ${showFilters ? 'is-open' : ''} ${isDeck ? 'is-deck' : ''}`} aria-hidden={!isDeck && !showFilters ? undefined : undefined}>
          {isDeck ? (
            db &&
            build && (
              <DeckSetup
                build={build}
                builds={builds}
                heroes={heroes}
                roles={roles}
                cards={cards}
                byId={byId}
                onChange={updateBuild}
                onSelect={selectBuild}
                onCreate={createBuild}
                onDuplicate={duplicateBuild}
                onDelete={deleteBuild}
              />
            )
          ) : (
            <FiltersPanel
              f={filters}
              facets={facets}
              counts={counts}
              onChange={(n) => updateFilters(n)}
              onReset={() => updateFilters({ ...readFilters(''), q: '' })}
              dirty={dirty}
              count={visible.length}
              onClose={() => setShowFilters(false)}
            />
          )}
        </aside>

        <main className="content">
          {error && <div className="error">Не удалось загрузить данные: {error}</div>}
          {!db && !error && <div className="loading">Загрузка…</div>}
          {db && isDeck && build && <DeckMain build={build} cards={cards} byId={byId} roles={roles} heroes={heroes} onChange={updateBuild} onOpen={openCard} />}
          {db && !isDeck && (
            <>
              <div className="resultbar">
                <span className="resultbar-n">{UI.found(visible.length)}</span>
                {dirty && <ActiveFilters f={filters} onChange={(n) => updateFilters(n)} onReset={() => updateFilters({ ...readFilters(''), q: '' })} />}
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
              {hasMore && (
                <div className="more">
                  <div className="sentinel" ref={sentinel} aria-hidden="true" />
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

      <nav className="bottomnav" aria-label="Разделы">
        <button className={!isDeck && !showFilters ? 'is-on' : ''} onClick={() => switchView('cards')}>
          <CardsIcon size={22} />
          {UI.viewCards}
        </button>
        <button className={isDeck ? 'is-on' : ''} onClick={() => switchView('deck')}>
          <DeckIcon size={22} />
          {UI.viewDeck}
        </button>
        <button className={showFilters ? 'is-on' : ''} onClick={showFiltersDrawer} aria-expanded={showFilters}>
          <FilterIcon size={22} />
          {UI.filters}
          {activeCount > 0 && <span className="count">{activeCount}</span>}
        </button>
        <button className={!isDeck && filters.fav ? 'is-on' : ''} onClick={showBookmarks} aria-pressed={!isDeck && filters.fav}>
          <BookmarkIcon filled={!isDeck && filters.fav} size={22} />
          {UI.bookmarks}
          {favs.size > 0 && <span className="count">{favs.size}</span>}
        </button>
      </nav>

      {current && (
        <CardModal
          card={current}
          fav={favs.has(current.id)}
          onClose={closeCard}
          onFav={toggleFav}
          onOpen={openCard}
          related={related}
          onPrev={prevCard ? openPrev : undefined}
          onNext={nextCard ? openNext : undefined}
          position={navIndex >= 0 ? { index: navIndex + 1, total: visible.length } : undefined}
        />
      )}
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
