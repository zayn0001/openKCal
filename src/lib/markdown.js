// Just enough Markdown for coach replies: headings, bullet/numbered lists (one nesting level),
// paragraphs, **bold**, *italic* and `code`. Returns plain data; the component turns it into
// React elements, so model output is never injected as HTML.
// ponytail: no tables, links or code fences; add a real parser if the coach starts using them.

const INLINE = /(\*\*[^*\n]+\*\*|__[^_\n]+__|`[^`\n]+`|\*[^*\s][^*\n]*\*)/

export function parseInline(text) {
  return text
    .split(INLINE)
    .filter(Boolean)
    .map((part) => {
      if (/^(\*\*|__).+\1$/.test(part)) return { t: 'b', v: part.slice(2, -2) }
      if (/^`.+`$/.test(part)) return { t: 'code', v: part.slice(1, -1) }
      if (/^\*.+\*$/.test(part)) return { t: 'i', v: part.slice(1, -1) }
      return { t: 'text', v: part }
    })
}

const BULLET = /^(\s*)(?:[-*•➔]|\d+[.)])\s+(.*)$/

export function parseBlocks(md = '') {
  const blocks = []
  let para = []
  const flush = () => {
    if (para.length) blocks.push({ type: 'p', text: para.join('\n') })
    para = []
  }
  for (const line of String(md).split(/\r?\n/)) {
    const h = line.match(/^\s*(#{1,6})\s+(.*)$/)
    const li = line.match(BULLET)
    if (!line.trim()) flush()
    else if (h) {
      flush()
      blocks.push({ type: 'h', text: h[2].replace(/\s*#+\s*$/, '') })
    } else if (li) {
      flush()
      const type = /^\s*\d/.test(line) ? 'ol' : 'ul'
      const item = { text: li[2], sub: li[1].length >= 2 }
      const last = blocks.at(-1)
      // a nested bullet stays inside the list above it, whatever its marker
      if (last && (last.type === type || item.sub) && (last.type === 'ul' || last.type === 'ol')) last.items.push(item)
      else blocks.push({ type, items: [item] })
    } else para.push(line.trim())
  }
  flush()
  return blocks
}
