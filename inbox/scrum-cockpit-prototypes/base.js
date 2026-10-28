// Shared helpers for the scrum-cockpit prototypes.
//
// The terminal mock is a cell grid: every line is a list of [text, class]
// segments, and the helpers pad, cut and frame them by code points so borders
// line up the way Ink would draw them. The VS Code mock is plain HTML, the way
// the extension's webview draws Box, Text, Button and Svg.

const T = (() => {
  const chars = s => [...s]
  const len = line => line.reduce((n, [t]) => n + chars(t).length, 0)
  const esc = s =>
    s
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/[^\x20-\x7e─-▟]/gu, ch => `<span class="g">${ch}</span>`)
  const html = line =>
    line.map(([t, c]) => (c ? `<span class="${c}">${esc(t)}</span>` : esc(t))).join('')

  // Pads a line to `w` cells, or cuts it with an ellipsis.
  function fit(line, w) {
    const n = len(line)
    if (n === w) return line
    if (n < w) return [...line, [' '.repeat(w - n), '']]
    const out = []
    let left = w - 1
    for (const [t, c] of line) {
      if (left <= 0) break
      const cs = chars(t)
      out.push([cs.slice(0, left).join(''), c])
      left -= Math.min(left, cs.length)
    }
    out.push(['…', 'dm'])
    return out
  }

  // A line from loose parts: strings, [text, class] pairs, or arrays of pairs.
  function L(...parts) {
    const out = []
    for (const p of parts) {
      if (typeof p === 'string') out.push([p, ''])
      else if (Array.isArray(p) && typeof p[0] === 'string') out.push([p[0], p[1] || ''])
      else if (Array.isArray(p)) out.push(...p)
    }
    return out
  }

  // Left part, right part, filler between, `w` cells in all.
  function spread(left, right, w, fill = ' ', fillCls = '') {
    const gap = Math.max(1, w - len(left) - len(right))
    return [...left, [fill.repeat(gap), fillCls], ...right]
  }

  const BORDERS = {
    round: '╭╮╰╯─│',
    single: '┌┐└┘─│',
    double: '╔╗╚╝═║',
    bold: '┏┓┗┛━┃',
  }

  // A bordered Box `w` cells wide. `title` / `right` sit in the top edge.
  function box(lines, { w, style = 'round', cls = 'dm', title, right, padX = 1, bg = '' }) {
    const [tl, tr, bl, br, hz, vt] = BORDERS[style]
    const inner = w - 2
    const t = title ? L([hz, cls], ' ', title, ' ') : []
    const r = right ? L(' ', right, ' ', [hz, cls]) : []
    const top = L([tl, cls], spread(t, r, inner, hz, cls), [tr, cls])
    const pad = ' '.repeat(padX)
    const body = lines.map(l =>
      L([vt, cls], [pad, bg], fit(l, inner - 2 * padX).map(([a, c]) => [a, `${c} ${bg}`.trim()]), [pad, bg], [vt, cls]),
    )
    const bottom = L([bl + hz.repeat(inner) + br, cls])
    return [top, ...body, bottom]
  }

  // Blocks of lines side by side, each padded to its own width.
  function cols(blocks, gap = 1) {
    const widths = blocks.map(b => Math.max(0, ...b.map(len)))
    const h = Math.max(...blocks.map(b => b.length))
    const out = []
    for (let i = 0; i < h; i++) {
      const row = []
      blocks.forEach((b, j) => {
        row.push(...fit(b[i] || [], widths[j]))
        if (j < blocks.length - 1) row.push([' '.repeat(gap), ''])
      })
      out.push(row)
    }
    return out
  }

  // A progress bar in eighth blocks.
  function bar(value, total, w, full = 'cl', empty = 'dm', emptyChar = '░') {
    const eighths = Math.round((value / total) * w * 8)
    const whole = Math.floor(eighths / 8)
    const part = eighths % 8
    const parts = ' ▏▎▍▌▋▊▉'
    const s = '█'.repeat(whole) + (part ? parts[part] : '')
    return L([s, full], [emptyChar.repeat(Math.max(0, w - chars(s).length)), empty])
  }

  // A one-row sparkline.
  function spark(values, cls = 'cl') {
    const ticks = '▁▂▃▄▅▆▇█'
    const max = Math.max(...values)
    return [[values.map(v => ticks[Math.round((v / max) * 7)]).join(''), cls]]
  }

  // A terminal Button as the engine draws it.
  const btn = (label, cls = '') => [[`[ ${label} ]`, `tb ${cls}`.trim()]]
  const rule = (w, ch = '─', cls = 'dm') => [[ch.repeat(w), cls]]

  function draw(el, lines) {
    el.innerHTML = lines.map(html).join('\n')
  }

  return { L, len, fit, spread, box, cols, bar, spark, btn, rule, draw }
})()

// --- frames ---

const TERM_LEFT = 56
const TERM_PANE = 54

function terminalChat(band, custom) {
  const { L, rule } = T
  const w = TERM_LEFT
  const log = custom || [
    L(['> ', 'dm'], '/sprint S13'),
    L(),
    L(['● ', 'cl'], 'Resuming sprint S13 — 2 stories left.'),
    L(['  ⎿ ', 'dm'], ['builder on 019, reviewer on 020', 'dm']),
    L(),
    L(['● ', 'cl'], ['Task', 'b'], '(builder · Story 019)'),
    L(['  ⎿ ', 'dm'], 'Edit ', ['tests/e2e/editor.spec.ts', 'su']),
    L(['     ', ''], ['+42 ', 'ok'], ['−3', 'er']),
    L(['  ⎿ ', 'dm'], 'Bash ', ['npx playwright test editor', 'dm']),
    L(['     ', ''], ['4 passed', 'ok'], ['  1 skipped', 'dm']),
    L(),
    L(['● ', 'cl'], ['Task', 'b'], '(reviewer · Story 020)'),
    L(['  ⎿ ', 'dm'], 'Read ', ['src/Import/ImportCli.cs', 'su']),
    L(['  ⎿ ', 'dm'], ['Reading 3 files…', 'dm']),
    L(),
    L(['✻ ', 'cl'], ['Orchestrating… ', 'cl'], ['(6m 12s · ↓ 8.1k tokens)', 'dm']),
  ]
  const prompt = [
    rule(w),
    L(['> ', 'dm'], ['█', 'dm']),
    rule(w),
    L(['  ⏵⏵ auto mode on ', 'au'], ['(shift+tab to cycle)', 'dm']),
  ]
  return { log, tail: [...band, ...prompt] }
}

function mountTerminal(el, { pane, band, log, title = 'claude — Abenteuer-Editor' }) {
  const chat = terminalChat(band, log)
  el.innerHTML = `
    <div class="surface-label">Terminal · fullscreen, pane beside the chat</div>
    <div class="term">
      <div class="bar"><i></i><i></i><i></i><span>${title}</span></div>
      <div class="screen">
        <div class="left"><pre class="log"></pre><pre class="tail"></pre></div>
        <div class="right"><pre class="pane"></pre></div>
      </div>
    </div>`
  T.draw(el.querySelector('.log'), chat.log)
  T.draw(el.querySelector('.tail'), chat.tail)
  T.draw(el.querySelector('.pane'), pane)
}

function mountVSCode(el, { pane, band = '', chat }) {
  el.innerHTML = `
    <div class="surface-label">VS Code · Claude Code extension, pane beside the chat</div>
    <div class="vscode">
      <div class="tabs"><span class="on">Claude Code</span><span>Chat</span><span>Codex</span></div>
      <div class="body">
        <div class="chat">
          ${chat || `          <div class="title">Resume sprint S13</div>
          <div class="log">
            <div class="me">/sprint S13</div>
            <div>Resuming sprint S13 — two stories left. Builder on 019, reviewer on 020.</div>
            <div class="tool"><b>Task</b> builder · Story 019</div>
            <div class="tool"><b>Edit</b> tests/e2e/editor.spec.ts <span style="color:var(--ok)">+42</span> <span style="color:var(--err)">−3</span></div>
            <div class="tool"><b>Bash</b> npx playwright test editor — 4 passed</div>
            <div class="tool"><b>Task</b> reviewer · Story 020</div>
            <div class="tool"><b>Read</b> src/Import/ImportCli.cs</div>
          </div>`}
          <div class="band-slot">${band}</div>
          <div class="input">Queue another message…</div>
        </div>
        <div class="pane">
          <div class="pane-head"><span>🧩 Scrum</span><span class="x">✕</span></div>
          <div class="pane-sub">From the scrum-cockpit plugin</div>
          <div class="pane-body">${pane}</div>
        </div>
      </div>
    </div>`
}

function nav(current) {
  const items = [
    ['index.html', 'Overview'],
    ['v1-mission-control.html', '1 · Mission Control'],
    ['v1b-mission-control-phases.html', '1b · Mission Control, by phase'],
    ['v2-timeline.html', '2 · Timeline'],
    ['v3-board.html', '3 · Board'],
    ['v4-dashboard.html', '4 · Dashboard'],
    ['v5-focus.html', '5 · Focus'],
  ]
  document.querySelector('.nav').innerHTML = items
    .map(([href, label]) => `<a href="${href}" class="${href === current ? 'on' : ''}">${label}</a>`)
    .join('')
}
