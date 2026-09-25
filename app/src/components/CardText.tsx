// Renders card text: line breaks become paragraphs, "Strike 3 (…)" keyword lines are emphasised,
// and "1 Success:" prefixes get the success glyph.
import { Fragment } from 'react';
import { CardIcon } from './Icons';

const KEYWORD_RE = /^(Strike|Sprint|Hide|Guard|Rest|Scout|Удар|Рывок|Укрытие|Защита|Отдых|Разведка)( \d+| X| Х)?\b/;
// EN sheet spells icons out ("2 Fate"); RU texts use {tokens} that stand for the printed glyphs
const ICON_RE = /(\d) (Success|Successes|Fate|Fear)\b|\{(success|fate|fear|damage|might|wisdom|agility|spirit|wit|inspiration|lore|trinket|armor|hand|hands|ranged|mount|action)\}/g;

function renderLine(line: string) {
  const parts: (string | JSX.Element)[] = [];
  let last = 0;
  for (const m of line.matchAll(ICON_RE)) {
    const i = m.index ?? 0;
    if (i > last) parts.push(line.slice(last, i));
    if (m[3]) {
      parts.push(<CardIcon name={m[3]} title={m[3]} key={i} />);
    } else {
      const name = m[2].toLowerCase().replace('successes', 'success');
      parts.push(
        <span className="inl-ico" key={i}>
          {m[1]}
          <CardIcon name={name} title={m[2]} />
        </span>,
      );
    }
    last = i + m[0].length;
  }
  if (last < line.length) parts.push(line.slice(last));
  return parts;
}

export function CardText({ text, className = '' }: { text: string | null | undefined; className?: string }) {
  if (!text) return null;
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  return (
    <div className={`cardtext ${className}`}>
      {lines.map((line, i) => {
        const kw = line.match(KEYWORD_RE);
        return (
          <p key={i} className={kw ? 'is-keyword' : undefined}>
            {kw ? (
              <Fragment>
                <b>{kw[0]}</b>
                {renderLine(line.slice(kw[0].length))}
              </Fragment>
            ) : (
              renderLine(line)
            )}
          </p>
        );
      })}
    </div>
  );
}
