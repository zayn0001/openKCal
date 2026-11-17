import { parseBlocks, parseInline } from '../lib/markdown'

function Inline({ text }) {
  return parseInline(text).map((p, i) =>
    p.t === 'b' ? <strong key={i}>{p.v}</strong>
    : p.t === 'i' ? <em key={i}>{p.v}</em>
    : p.t === 'code' ? <code key={i}>{p.v}</code>
    : p.v,
  )
}

export default function Markdown({ text }) {
  return (
    <div className="md">
      {parseBlocks(text).map((b, i) => {
        if (b.type === 'h') return <p key={i} className="md-h"><Inline text={b.text} /></p>
        if (b.type === 'p') return <p key={i}><Inline text={b.text} /></p>
        const List = b.type === 'ol' ? 'ol' : 'ul'
        let n = 0 // nested bullets must not advance the 1. 2. 3. numbering
        return (
          <List key={i}>
            {b.items.map((it, j) => (
              <li key={j} className={it.sub ? 'md-sub' : undefined} value={b.type === 'ol' && !it.sub ? ++n : undefined}>
                <Inline text={it.text} />
              </li>
            ))}
          </List>
        )
      })}
    </div>
  )
}
