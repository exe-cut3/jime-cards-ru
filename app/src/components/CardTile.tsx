import { displayName, primaryImage } from '../data';
import type { Card } from '../types';
import { CostChip, ExpansionBadge, IconRow, OwnerBadge, TierChip, TypeBadge, typeClass } from './Badges';
import { BookmarkIcon } from './Icons';

interface Props {
  card: Card;
  fav: boolean;
  onOpen: (id: string) => void;
  onFav: (id: string) => void;
}

export function CardTile({ card, fav, onOpen, onFav }: Props) {
  const { main, sub } = displayName(card);
  const img = primaryImage(card, 'front', true);
  const landscape = card.kind === 'hero';
  return (
    <article className={`tile ${typeClass(card)} ${landscape ? 'is-landscape' : ''}`}>
      <button className="tile-img" onClick={() => onOpen(card.id)} aria-label={main}>
        {img ? <img src={img} alt="" loading="lazy" decoding="async" /> : <div className="tile-noimg">нет скана</div>}
      </button>
      <div className="tile-body">
        <div className="tile-head">
          <h3 className="tile-name">
            <button className="linklike" onClick={() => onOpen(card.id)}>
              {main}
            </button>
          </h3>
          <button className={`favbtn ${fav ? 'is-on' : ''}`} onClick={() => onFav(card.id)} aria-label={fav ? 'Убрать из закладок' : 'В закладки'} aria-pressed={fav}>
            <BookmarkIcon filled={fav} size={16} />
          </button>
        </div>
        {sub && <div className="tile-sub">{sub}</div>}
        <div className="tile-meta">
          <TypeBadge c={card} />
          <OwnerBadge c={card} />
          <CostChip c={card} />
          <TierChip c={card} />
          <IconRow c={card} />
          <span className="spacer" />
          <ExpansionBadge c={card} />
        </div>
      </div>
    </article>
  );
}
