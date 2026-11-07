// Force-directed knowledge graph on a canvas, no dependencies. Ported from
// ap0110-systems.github.io/src/components/WikiGraph.jsx, then:
//   • colour = page type; shape = where the file lives (Drive square, Zulip diamond, mail triangle, repo circle).
//     The consortium's calls and messages are markers (activity.json): a kind and a date, no page.
//   • edges: link (solid), flow (marching dots: an original -> the page that uses it)
//   • the Framework Report is a document with one "loading" bar per element
//   • catalog pages (index, log) are in the data, behind one chip
// O(n²) repulsion and a 20 fps idle loop for the animation; fine at ~500 nodes.
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createLayout, DOC_W, DOC_H, ALPHA_MIN } from '../lib/graph-layout.js'

// One colour per layer, radiating out from the Report. UC palette, plus one green (UC has none) for evidence.
// UC Pink: the Report's sections. UC Blue: sources. UC Dark Blue: the wiki's synthesis. UC Orange: people and
// institutions. Green: original documents, the ground the library grows from. UC Gray: catalog pages. Validator (all pairs, #fafafa):
// blue, pink and green pass every check. Orange vs green is close for protan readers (ΔE 3.9); the legend and
// hover labels carry them. Fallback green if needed: #1d7a3a.
const GREEN = '#0b9a4a', PINK = '#e44c9a', ORANGE = '#ff6e1b', GREY = '#7c7e7f'
export const COLORS = {
  element: PINK, checklist: PINK,
  source: '#1295d8', concept: '#005581', analysis: '#005581', overview: '#005581', page: '#005581', report: '#005581',
  entity: ORANGE,
  legislative: GREEN, shared: GREEN, web: GREEN, human: GREEN, calls: GREEN, zulip: GREEN, email: GREEN, meet: GREEN, drive: GREEN,
  readme: GREY,
}
// Drawn hollow (a light tint with a ring in the type's colour): the consortium's communications, whose text is not public.
const OUTLINED = new Set(['calls', 'zulip', 'email', 'meet', 'drive'])
// The colour mixed with white: k of the colour, the rest white.
const tint = (hex, k = 0.22) => '#' + [1, 3, 5].map((i) => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * k).toString(16).padStart(2, '0')).join('')
const colorOf = (t) => COLORS[t] || GREY
const nodeColor = (n) => n.color ?? (n.hub ? GREY : colorOf(n.type)) // n.color: the data sets the colour
// One label per colour: types drawn alike share one chip and one key entry. Every original document is one kind,
// however it reached the library; every private transcript (a call's Meet chat included), email thread and Zulip topic is one kind.
const COMMS = 'communications'
const LABELS = { source: 'source page', concept: 'wiki page', analysis: 'wiki page', overview: 'wiki page', page: 'wiki page',
  element: 'reading list', checklist: 'reading list', entity: 'person or institution', readme: 'folder guide', drive: 'Drive listing',
  legislative: 'original document', shared: 'original document', web: 'original document', human: 'original document',
  calls: COMMS, email: COMMS, zulip: COMMS, meet: COMMS }
const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const FLOW = 'rgba(11,154,74,'

// backdrop: fill the parent as a background layer, legend and caption overlaid bottom-left.
// inPlace: settle the layout fully, hidden, and show it once in place; no fade or drift. navigator implies it.
// navigator: fill the parent, pan and zoom, and float the key (children as its title) top-left as a collapsible panel.
// center: where the graph's middle sits, as fractions of the canvas (desktop only, 1024px and wider). zoom: scale on top of fit.
export default function GraphView({ data, variant = 'radial', focusNodeId, labels = false, height = 600, filters = true, catalog = true, animate = false, legend = true, backdrop = false, center = [0.5, 0.5], zoom = 1, legendClass = 'left-4 bottom-4', captionClass, scale = 0.8, margin = [0, 0], hideLinks = false, download = false, navigator = false, inPlace = false, focusHash = false, selectOnClick = false, children }) {
  // focusHash: the selected node is the URL hash (a node id), so a Find box, a click or a link can set it. Selecting
  // moves nothing (user, Oct. 29, 2026): it only changes what is spotlit, so the layout never re-runs for it.
  const [hashFocus, setHashFocus] = useState(null)
  useEffect(() => {
    if (!focusHash) return
    const read = () => { let h = location.hash.slice(1); try { h = decodeURIComponent(h) } catch {} setHashFocus(h || null) }
    read(); window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [focusHash])
  const selectedId = focusHash && data.nodes.some((n) => n.id === hashFocus) ? hashFocus : null
  const types = useMemo(() => [...new Set(data.nodes.filter((n) => n.type !== 'report').map((n) => n.type))].sort(), [data])
  const kinds = useMemo(() => { const g = new Map(); for (const t of types) { const l = LABELS[t] || t; g.set(l, [...(g.get(l) ?? []), t]) } return [...g] }, [types])
  const [off, setOff] = useState(() => new Set())
  const [showHubs, setShowHubs] = useState(true) // catalog pages show by default; the chip hides them
  const hubs = data.nodes.filter((n) => n.hub)
  const view = useMemo(() => {
    const keep = new Set(data.nodes.filter((n) => !off.has(n.type) && (showHubs || !n.hub || n.id === focusNodeId)).map((n) => n.id))
    return { nodes: data.nodes.filter((n) => keep.has(n.id)), edges: data.edges.filter((e) => keep.has(e.source) && keep.has(e.target)) }
  }, [data, off, showHubs, focusNodeId])
  // Navigator: each change re-settles the whole layout, so chip clicks edit a draft and Apply runs one re-settle for
  // all of them. The spinner shows from Apply (and from page load) until the Canvas reports the new layout in place.
  const [draftOff, setDraftOff] = useState(off)
  const [draftHubs, setDraftHubs] = useState(showHubs)
  const [busy, setBusy] = useState(navigator)
  const shownOff = navigator ? draftOff : off, shownHubs = navigator ? draftHubs : showHubs
  const pending = draftHubs !== showHubs || draftOff.size !== off.size || [...draftOff].some((t) => !off.has(t))
  const apply = () => { setBusy(true); setOff(draftOff); setShowHubs(draftHubs) }
  // A chip turns all the types of its kind on or off together.
  const flip = (s, ts) => { const n = new Set(s), on = ts.every((t) => n.has(t)); ts.forEach((t) => (on ? n.delete(t) : n.add(t))); return n }
  const toggle = (t) => (navigator ? setDraftOff : setOff)((s) => flip(s, t))
  const toggleHubs = () => (navigator ? setDraftHubs : setShowHubs)((v) => !v)

  const overlay = backdrop || navigator // the canvas fills the parent and the key floats over it
  const fill = height === '100%' || overlay
  const legendEl = legend && (
        <div className={`flex flex-col gap-y-1 text-xs text-gray-600 shrink-0 ${backdrop ? `absolute ${legendClass} z-10 pointer-events-none w-fit max-w-[calc(100%-2rem)] rounded-md bg-white/75 px-2 py-1 backdrop-blur-sm` : navigator ? '' : 'mt-1'}`}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="inline-flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke="#9ca3af" /></svg>wiki link</span>
          <span className="inline-flex items-center gap-1.5"><svg width="22" height="6"><line x1="0" y1="3" x2="22" y2="3" stroke={GREEN} strokeDasharray="2 4" strokeWidth="2" /></svg>ingest link</span>
          <span className="inline-flex items-center gap-1.5"><svg width="12" height="12"><rect x="1" y="1" width="10" height="10" rx="2.5" fill={GREY} /></svg>Drive</span>
          <span className="inline-flex items-center gap-1.5"><svg width="12" height="12"><path d="M6 0.5L11.5 6L6 11.5L0.5 6Z" fill={GREY} /></svg>Zulip</span>
          <span className="inline-flex items-center gap-1.5"><svg width="12" height="12"><path d="M6 0.5L11.5 11L0.5 11Z" fill={GREY} /></svg>mail</span>
          <span className="inline-flex items-center gap-1.5"><svg width="12" height="12"><circle cx="6" cy="6" r="5" fill={GREY} /></svg>repo</span>
          </div>
          {!filters && (
            // Without the filter chips (the hero), the key carries the colours instead, communications included.
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
              {kinds.map(([l, [t]]) => (
                <span key={l} className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={OUTLINED.has(t) ? { background: tint(colorOf(t)), boxShadow: `inset 0 0 0 1.5px ${colorOf(t)}` } : { background: colorOf(t) }} />
                  {l}
                </span>
              ))}
            </div>
          )}
        </div>
  )
  const filtersEl = filters && (
        <div className={`mt-2 flex gap-1.5 shrink-0 ${fill && !navigator ? 'overflow-x-auto pb-1 [&>button]:shrink-0 [&>button]:whitespace-nowrap' : 'flex-wrap'}`}>
          {catalog && hubs.length > 0 && (
            <button className="chip" aria-pressed={shownHubs} onClick={toggleHubs} title={hubs.map((h) => h.label).join(', ')}>
              Catalog pages <span className="opacity-60">{hubs.length}</span>
            </button>
          )}
          {kinds.map(([l, ts]) => (
            <button key={l} className="chip inline-flex items-center gap-1.5" aria-pressed={!ts.every((t) => shownOff.has(t))} onClick={() => toggle(ts)}>
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={OUTLINED.has(ts[0]) ? { background: tint(colorOf(ts[0])), boxShadow: `inset 0 0 0 1.5px ${colorOf(ts[0])}` } : { background: colorOf(ts[0]) }} />
              {l} <span className="opacity-60">{data.nodes.filter((n) => ts.includes(n.type)).length}</span>
            </button>
          ))}
          {navigator && (
            <button type="button" className="btn btn-primary basis-full justify-center mt-1 py-1.5 text-sm disabled:opacity-40 disabled:cursor-not-allowed" disabled={!pending || busy} onClick={apply}>
              {busy ? 'Applying…' : 'Apply filters'}
            </button>
          )}
        </div>
  )
  return (
    <div className={overlay ? 'relative w-full h-full' : fill ? 'w-full flex-1 min-h-0 flex flex-col' : 'w-full'}>
      <Canvas data={view} variant={variant} focusNodeId={focusNodeId} selectedId={selectedId} selectOnClick={selectOnClick} height={fill ? '100%' : height} animate={animate} labels={labels} hideLinks={hideLinks} download={download} navigator={navigator} inPlace={inPlace || navigator} onSettled={() => setBusy(false)} center={center} zoom={zoom} margin={margin} scale={scale}
        fillClass={overlay ? 'absolute inset-0' : 'relative flex-1 min-h-0'} captionClass={captionClass ?? (backdrop ? 'left-4 bottom-12' : 'left-2 bottom-2')} />
      {navigator && !children && !legendEl && !filtersEl ? null : navigator ? (
        // The key: pinned over the graph, collapsed by clicking its title. Native <details>; open is set once here and
        // never passed as a prop, because React re-applies a prop on each render and would undo the reader's toggle.
        // Phones start with it closed.
        <details ref={(el) => { if (el && !el.dataset.ready) { el.dataset.ready = '1'; el.open = window.matchMedia('(min-width: 768px)').matches } }} className="group absolute left-3 top-3 z-10 w-[min(24rem,calc(100%-1.5rem))] not-open:w-auto max-h-[calc(100%-1.5rem)] overflow-y-auto rounded-lg border border-gray-200 bg-white/90 shadow-sm backdrop-blur-sm text-sm">
          <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0 flex-1 group-not-open:[&_p]:hidden">{children}</div>
            <span aria-hidden="true" className="mt-0.5 text-gray-500 transition-transform group-open:rotate-180">▾</span>
          </summary>
          {(legendEl || filtersEl) && <div className="border-t border-gray-100 px-3 pb-3 pt-2">{legendEl}{filtersEl}</div>}
        </details>
      ) : <>{legendEl}{filtersEl}</>}
      {busy && (
        <div role="status" className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <svg className="h-10 w-10 animate-spin" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="none" stroke="#e5e7eb" strokeWidth="3" />
            <path d="M12 2a10 10 0 0 1 10 10" fill="none" stroke="#1295d8" strokeWidth="3" strokeLinecap="round" />
          </svg>
          <span className="sr-only">Updating the graph</span>
        </div>
      )}
      <nav className="sr-only" aria-label="Pages in the graph">
        <ul>{data.nodes.map((n) => <li key={n.id}>{n.static ? n.label : <a href={n.href || n.id}>{n.label}</a>}</li>)}</ul>
      </nav>
    </div>
  )
}

// Node outline by where the file lives. Report = document, drawn separately.
function shapePath(ctx, n, x, y, r) {
  ctx.beginPath()
  if (n.system === 'drive') { const s = r * 0.9, k = s * 0.35; ctx.roundRect(x - s, y - s, 2 * s, 2 * s, k) }
  else if (n.system === 'zulip') { const s = r * 1.2; ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath() }
  else if (n.system === 'mail') { const s = r * 1.3; ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.87, y + s * 0.5); ctx.lineTo(x - s * 0.87, y + s * 0.5); ctx.closePath() }
  else ctx.arc(x, y, r, 0, Math.PI * 2)
}

// The Framework Report: a rounded page with one skeleton bar per element.
function drawDocument(ctx, n, s, t, still) {
  const x = n.x - DOC_W / 2, y = n.y - DOC_H / 2
  ctx.save()
  ctx.shadowColor = 'rgba(0,32,51,0.12)'; ctx.shadowBlur = 8 / s; ctx.shadowOffsetY = 1 / s
  ctx.beginPath(); ctx.roundRect(x, y, DOC_W, DOC_H, 4)
  ctx.fillStyle = '#ffffff'; ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = 1.5 / s; ctx.strokeStyle = '#72cdf4'; ctx.stroke()
  // Skeleton bars: a title bar, then one bar per element A..G.
  const padX = 10, top = y + 11, bars = [{ w: 0.55, h: 6 }, ...LETTERS.map((L, i) => ({ w: [0.92, 0.8, 0.88, 0.7, 0.85, 0.76, 0.62][i], h: 4, L }))]
  const band = still ? null : (t % 1600) / 1600
  let yy = top
  bars.forEach((b, i) => {
    const bw = (DOC_W - 2 * padX) * b.w, bx = x + padX
    const done = b.L && n.drafted?.includes(b.L)
    ctx.beginPath(); ctx.roundRect(bx, yy, bw, b.h, b.h / 2)
    if (done) ctx.fillStyle = '#1295d8'
    else if (band === null) ctx.fillStyle = '#e5e7eb'
    else {
      const cx = x - 20 + band * (DOC_W + 40)
      const g = ctx.createLinearGradient(cx - 20, 0, cx + 20, 0)
      g.addColorStop(0, '#e5e7eb'); g.addColorStop(0.5, '#f8fafc'); g.addColorStop(1, '#e5e7eb')
      ctx.fillStyle = g
    }
    ctx.fill()
    yy += b.h + (i === 0 ? 8 : 4.8)
  })
  ctx.restore()
}

// Photos and marks, loaded once per page. A load triggers a redraw through the listeners set.
const IMAGES = new Map()
const imgListeners = new Set()
function imageFor(src) {
  let im = IMAGES.get(src)
  if (!im) { im = new Image(); im.decoding = 'async'; im.onload = () => imgListeners.forEach((f) => f()); im.src = src; IMAGES.set(src, im) }
  return im.complete && im.naturalWidth ? im : null
}

// margin: [top, bottom] px of canvas that lies outside the box the graph is fitted to (room to overflow into).
// Radial graphs are contained: drawn at a fixed scale (px per layout unit), and nodes bounce off the element's edges.
function Canvas({ data, variant, focusNodeId, selectedId = null, selectOnClick = false, height, animate, labels = false, hideLinks = false, download = false, navigator = false, inPlace = false, onSettled, center = [0.5, 0.5], zoom = 1, margin = [0, 0], scale = 0.8, captionClass = 'left-2 bottom-2', fillClass = 'relative flex-1 min-h-0' }) {
  const canvasRef = useRef(null)
  // The selection reaches the drawing through a ref, outside the layout effect's dependencies, so it never re-settles.
  const selRef = useRef(selectedId)
  const redrawRef = useRef(null)
  useEffect(() => { selRef.current = selectedId; redrawRef.current?.() }, [selectedId])
  const settledRef = useRef(onSettled); settledRef.current = onSettled // latest callback, without re-running the effect
  const navRef = useRef(null) // navigator: the zoom buttons call into the effect
  const rafRef = useRef(null)
  const timerRef = useRef(null)
  const labelRef = useRef(null)
  const descRef = useRef(null)
  const saveRef = useRef(null)
  // Mini map zoom: the canvas sits in a native scroll box and is drawn z times the box's size, so the browser
  // scrolls it. At z = 1 the whole drawing fits the box.
  const scrollRef = useRef(null)
  const innerRef = useRef(null)
  const zRef = useRef(1)
  const Z_MIN = 1, Z_MAX = 4
  // Zoom to z, keeping the drawing point under (px, py), an offset inside the box, where it is.
  const setZoom = (z, px, py) => {
    const box = scrollRef.current, inner = innerRef.current
    if (!box || !inner) return
    const z0 = zRef.current, z1 = Math.min(Z_MAX, Math.max(Z_MIN, z))
    if (px == null) { px = box.clientWidth / 2; py = box.clientHeight / 2 }
    zRef.current = z1
    if (z1 === 1) { inner.style.width = '100%'; inner.style.height = '100%' }
    else { inner.style.width = `${box.offsetWidth * z1}px`; inner.style.height = `${box.offsetHeight * z1}px` }
    box.scrollLeft = (box.scrollLeft + px) * (z1 / z0) - px
    box.scrollTop = (box.scrollTop + py) * (z1 / z0) - py
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !data?.nodes?.length) return
    const ctx = canvas.getContext('2d')
    const radial = variant === 'radial'
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const live = animate && !reduceMotion
    let width = 0, height = 0, dpr = Math.min(window.devicePixelRatio || 1, 2), hover = -1, hoverEdge = -1
    let dragged = false, downX = 0, downY = 0, panning = false, lastX = 0, lastY = 0

    // With `labels` (a page's mini map), every node carries its name, at a fixed size in layout units.
    // lw is a label's width in layout units; side is where it sits: 1 right, -1 left, 0 centred below.
    const LABEL_FONT = '500 11px Kunst Grotesk, system-ui', LABEL_PAD = 4, ROW = 22
    const textOf = (n) => (n.label.length > 28 ? n.label.slice(0, 27) + '…' : n.label)
    const sim = createLayout(data, { radial, labels, focusNodeId, center, scale, size: () => [width, height], place: labels ? placeLabels : undefined })
    const { nodes, edges, nbr, N, mainIdx, focusIdx, fixedIdx, step, separate, escape, fixedView } = sim
    if (labels) { ctx.font = LABEL_FONT; for (const n of nodes) n.lw = ctx.measureText(textOf(n)).width + LABEL_PAD }

    // The selection's spotlight. An insider (consortium) lights its own links. Anyone else lights every path to the
    // consortium people it can reach: breadth-first, up to 6 steps, stopping at the first insider on each branch, so a
    // path never runs through one consortium person to reach another. With no such path, it lights its own links.
    const edgeAt = new Map(edges.map(([a, b], k) => [a < b ? `${a}|${b}` : `${b}|${a}`, k]))
    const edgeOf = (a, b) => edgeAt.get(a < b ? `${a}|${b}` : `${b}|${a}`)
    let selIdx = -1, spotNodes = new Set(), spotEdges = new Set()
    const refreshSelection = () => {
      const id = selRef.current
      selIdx = id ? nodes.findIndex((n) => n.id === id) : -1
      spotNodes = new Set(); spotEdges = new Set()
      if (selIdx < 0) return
      const own = () => { spotNodes = new Set([selIdx, ...nbr[selIdx]]); for (const j of nbr[selIdx]) spotEdges.add(edgeOf(selIdx, j)) }
      if (nodes[selIdx].insider) return own()
      const prev = new Map([[selIdx, -1]]), found = []
      let frontier = [selIdx]
      for (let d = 0; d < 6 && frontier.length; d++) {
        const next = []
        for (const u of frontier) for (const v of nbr[u]) {
          if (prev.has(v)) continue
          prev.set(v, u)
          if (nodes[v].insider) found.push(v); else next.push(v)
        }
        frontier = next
      }
      if (!found.length) return own()
      spotNodes.add(selIdx)
      for (const v of found) for (let x = v; x !== selIdx; x = prev.get(x)) { spotNodes.add(x); spotEdges.add(edgeOf(prev.get(x), x)) }
    }
    refreshSelection()
    // A labeled mini map has a fixed layout, so no two labels can collide: the page in the centre, its neighbours on
    // two arcs, grouped by type then name, one row apart. Labels point outward. No physics runs.
    function placeLabels(nodes, fixedIdx, focusIdx) {
      const rest = nodes.map((n, i) => i).filter((i) => i !== focusIdx)
        .sort((a, b) => nodeColor(nodes[a]).localeCompare(nodeColor(nodes[b])) || nodes[a].label.localeCompare(nodes[b].label))
      const half = Math.ceil(rest.length / 2)
      ;[[rest.slice(0, half), 1], [rest.slice(half), -1]].forEach(([side, dir]) => {
        const step = side.length > 1 ? Math.max(ROW, 120 / (side.length - 1)) : 0 // a few neighbours spread over 120 units
        const H = (side.length - 1) * step, R = Math.max(H / 2 + ROW, 70)
        side.forEach((i, k) => {
          const y = -H / 2 + k * step
          Object.assign(nodes[i], { x: dir * (36 + Math.sqrt(Math.max(R * R - y * y, 0)) * 0.6), y, side: dir, px: undefined })
          nodes[i].px = nodes[i].x; nodes[i].py = nodes[i].y; fixedIdx.add(i)
        })
      })
      if (focusIdx >= 0) Object.assign(nodes[focusIdx], { x: 0, y: 0, side: 0 })
    }

    let view = [0, 0, 1], base = [0, 0, 1]
    // Navigator: pan (tx, ty, screen px) and zoom (k) on top of the fitted view. It magnifies the picture only; the walls
    // stay where fixedView() puts them, so zooming never re-settles the nodes.
    // Mouse and trackpad only; add pointer events for touch pinch and pan when someone uses it on a tablet.
    let nav = [0, 0, 1]
    const K_MIN = 0.5, K_MAX = 6
    // The drawing's extent in layout units, labels included on a labeled map.
    const bounds = () => {
      let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity
      for (const n of nodes) {
        const l = n.side === 1 ? n.lw : 0, rr = n.side === -1 ? n.lw : 0, below = n.side === 0 ? 18 : 0, cw = n.side === 0 ? n.lw / 2 : 0
        a = Math.min(a, n.x - n.r - rr - cw); b = Math.max(b, n.x + n.r + l + cw); c = Math.min(c, n.y - Math.max(n.r, labels ? 8 : 0)); d = Math.max(d, n.y + n.r + below)
      }
      return [a, b, c, d]
    }
    const baseFit = () => {
      if (radial) return (base = fixedView())
      const [a, b, c, d] = bounds()
      const boxH = height - margin[0] - margin[1]
      const [fx, fy] = width >= 1024 ? center : [0.5, 0.5]
      let target
      if (mainIdx >= 0) {
        // Radial: the Report is the centre. Fit the farthest node from it, in every direction.
        const R = Math.max(...nodes.map((n) => Math.hypot(n.x, n.y) + n.hit)) || 1
        const s = Math.min(1.6, (width - 20) / (2 * R), (boxH - 20) / (2 * R)) * zoom
        target = [width * fx, margin[0] + boxH * fy, s]
      } else {
        const s = Math.min((labels ? 1.15 : 1.6) * zRef.current, (width - 20) / (b - a || 1), (boxH - 20) / (d - c || 1)) * zoom
        target = [width * fx - ((a + b) / 2) * s, margin[0] + boxH * fy - ((c + d) / 2) * s, s]
      }
      // Ease the zoom toward the new bounds instead of jumping, so the drawing does not pump while it settles.
      if (!eased) { eased = true; return (base = target) }
      return (base = base.map((v, k) => v + (target[k] - v) * 0.12))
    }
    const fit = () => { const [bx, by, bs] = baseFit(), [tx, ty, k] = nav; return (view = [bx * k + tx, by * k + ty, bs * k]) }
    // Zoom by f, keeping the screen point (px, py) still. Default: the canvas centre.
    const zoomAt = (f, px = width / 2, py = height / 2) => {
      const [tx, ty, k] = nav, k1 = Math.min(K_MAX, Math.max(K_MIN, k * f))
      nav = [px - ((px - tx) * k1) / k, py - ((py - ty) * k1) / k, k1]; clampNav(); paint()
    }
    const paint = () => draw(performance.now()) // now, not on the animation's next 20 fps tick
    // Keep the drawing in the box: smaller than the box, it cannot leave it; larger, the box cannot show past its edge.
    const clampNav = () => {
      if (!width || !N) return
      const [bx, by, bs] = base, k = nav[2], S = bs * k, [a, b, c, d] = bounds(), p = 8
      const cl = (o, lo, hi) => Math.min(Math.max(o, Math.min(lo, hi)), Math.max(lo, hi))
      const ox = cl(bx * k + nav[0], p - a * S, width - p - b * S), oy = cl(by * k + nav[1], p - c * S, height - p - d * S)
      nav = [ox - bx * k, oy - by * k, k]
    }
    const panBy = (dx, dy) => { nav = [nav[0] + dx, nav[1] + dy, nav[2]]; clampNav(); paint() }
    // Buttons ease over 220 ms. A zoom applies its factor in slices, so the centre stays still on every frame.
    let anim = 0
    const tween = (apply) => {
      cancelAnimationFrame(anim)
      if (reduceMotion) return apply(1, 0)
      const t0 = performance.now(); let last = 0
      const tick = (t) => { const p = Math.min(1, (t - t0) / 220), e = 1 - (1 - p) ** 3; apply(e, last); last = e; if (p < 1) anim = requestAnimationFrame(tick) }
      anim = requestAnimationFrame(tick)
    }
    navRef.current = {
      zoom: (f) => tween((e, last) => zoomAt(f ** (e - last))),
      fit: () => { const from = nav; tween((e) => { nav = from.map((v, i) => v + ([0, 0, 1][i] - v) * e); paint() }) },
    }
    let eased = false
    sim.settling = inPlace // inPlace: while true, settle() owns the layout; nothing else steps or redraws

    let noLinks = false // the PNG export: nodes only
    // Nodes linked to the Report through any chain of links (with no Report, to the first node).
    const joined = new Set([Math.max(mainIdx, 0)])
    for (const i of joined) for (const j of nbr[i]) joined.add(j)
    const draw = (t = 0) => {
      if (!width) return // not measured yet
      ctx.clearRect(0, 0, width, height)
      const [ox, oy, s] = sim.dragIdx >= 0 ? view : fit()
      ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s)
      // What is spotlit: the selection and its paths, which a hover never drops (user, Oct. 29, 2026), plus the hovered
      // node and its neighbours, or a hovered edge's two ends.
      const he = hoverEdge >= 0 ? edges[hoverEdge] : null
      const hv = hover >= 0 ? hover : -1
      const sel = selIdx >= 0
      const spot = hv >= 0 || !!he || sel
      const inSpot = (i) => (sel && spotNodes.has(i)) || (he ? i === he[0] || i === he[1] : hv >= 0 && (i === hv || nbr[hv].has(i)))
      const isPath = (k) => sel && spotEdges.has(k)
      const incOf = (e, k) => isPath(k) || (he ? e === he : hv >= 0 && (e[0] === hv || e[1] === hv))
      ctx.lineWidth = 1 / s
      if (!noLinks) for (let k = 0; k < edges.length; k++) {
        const e = edges[k], [a, b, kind] = e, inc = incOf(e, k)
        if (labels && spot && !(inSpot(a) && inSpot(b))) continue // the mini map hides what the hovered node does not touch
        if (hideLinks && !inc) continue // the homepage graph shows only the hovered node's links (user request, Oct. 26, 2026)
        if (kind === 'report') { ctx.setLineDash([]); ctx.lineDashOffset = 0; ctx.strokeStyle = inc ? 'rgba(228,76,154,0.95)' : spot ? 'rgba(228,76,154,0.15)' : 'rgba(228,76,154,0.7)'; ctx.lineWidth = 2 / s }
        else if (kind === 'flow') {
          // The path runs source -> target, and a falling lineDashOffset marches the dots from start to end:
          // the dots move out of the document the agent may not edit, into the wiki page that uses it.
          ctx.setLineDash([2 / s, 6 / s]); ctx.lineDashOffset = live ? -(t / (inc ? 25 : 50)) / s : 0
          ctx.strokeStyle = FLOW + (inc ? '0.95)' : spot ? '0.05)' : '0.3)'); ctx.lineWidth = (inc ? 2 : 1.4) / s
        } else if (isPath(k)) { ctx.setLineDash([]); ctx.strokeStyle = '#1295d8'; ctx.lineWidth = 2.5 / s } // a selected path: one blue line
        else { ctx.setLineDash([]); ctx.strokeStyle = inc ? 'rgba(0,0,0,0.55)' : spot ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1 / s }
        ctx.beginPath(); ctx.moveTo(nodes[a].x, nodes[a].y); ctx.lineTo(nodes[b].x, nodes[b].y); ctx.stroke()
      }
      ctx.setLineDash([]); ctx.lineWidth = 1 / s
      for (let i = 0; i < N; i++) {
        const n = nodes[i]
        if (noLinks && !joined.has(i)) continue // the PNG leaves out pages not linked, by any path, to the Report
        ctx.globalAlpha = spot && !inSpot(i) ? (labels ? 0 : 0.25) : 1
        if (n.type === 'report') { drawDocument(ctx, n, s, t, !live || noLinks); continue }
        const r = n.r + (i === hover ? 2 : 0)
        const im = n.img ? imageFor(n.img) : null
        if (im) {
          ctx.save(); shapePath(ctx, n, n.x, n.y, r); ctx.clip(); ctx.fillStyle = '#ffffff'; ctx.fill()
          const iw = im.naturalWidth, ih = im.naturalHeight
          if (n.imgKind === 'photo') { const k = (2 * r) / Math.min(iw, ih); ctx.drawImage(im, n.x - (iw * k) / 2, n.y - (ih * k) / 2, iw * k, ih * k) }
          else { const box = 2 * r * 0.64, k = box / Math.max(iw, ih); ctx.drawImage(im, n.x - (iw * k) / 2, n.y - (ih * k) / 2, iw * k, ih * k) }
          ctx.restore(); ctx.lineWidth = (n.color ? 3.5 : 1.5) / s; ctx.strokeStyle = nodeColor(n); shapePath(ctx, n, n.x, n.y, r); ctx.stroke(); ctx.lineWidth = 1 / s // a role colour (Contacts) reads as a thick ring
        } else if (OUTLINED.has(n.type) && !n.hub) {
          // Hollow: an outline file in the Report's Drive folder, or evidence the public Report cannot cite.
          shapePath(ctx, n, n.x, n.y, r - 0.75 / s); ctx.fillStyle = tint(nodeColor(n)); ctx.fill(); ctx.lineWidth = 1.5 / s; ctx.strokeStyle = nodeColor(n); ctx.stroke(); ctx.lineWidth = 1 / s
        } else {
          shapePath(ctx, n, n.x, n.y, r); ctx.fillStyle = nodeColor(n); ctx.fill()
          // A node with no image carries its monogram: initials for a person, a short name for an institution.
          if (n.mono) {
            const k = n.mono.length <= 2 ? 0.9 : n.mono.length === 3 ? 0.7 : 0.55
            ctx.fillStyle = '#ffffff'; ctx.font = `700 ${r * k}px Kunst Grotesk, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
            ctx.fillText(n.mono, n.x, n.y + r * 0.06); ctx.textBaseline = 'alphabetic'
          }
        }
        // An element hub carries its letter, from its title ("A - Landscape Analysis").
        const L = n.type === 'element' && /^([A-G]) - /.exec(n.label)?.[1]
        if (L) {
          ctx.fillStyle = '#ffffff'; ctx.font = `700 ${r * 1.05}px Kunst Grotesk, system-ui`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
          ctx.fillText(L, n.x, n.y + r * 0.06); ctx.textBaseline = 'alphabetic'
        }
        if (i === focusIdx || i === selIdx) { ctx.lineWidth = 2 / s; ctx.strokeStyle = '#1295d8'; shapePath(ctx, n, n.x, n.y, r + 3); ctx.stroke(); ctx.lineWidth = 1 / s }
      }
      // Labels. With `labels`, every node carries its name; a hover hides the nodes it does not touch.
      // Otherwise only the hovered node and its neighbours do, and a label that would overlap one already drawn is skipped.
      if (spot || labels) {
        const k = labels ? 1 : 1 / s // labels: layout units, sized with the graph; hover labels: constant screen size
        ctx.font = labels ? LABEL_FONT : `500 ${11 / s}px Kunst Grotesk, system-ui`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
        ctx.lineJoin = 'round'; ctx.lineWidth = 3 * k; ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.fillStyle = '#002033'
        const boxes = [], h = 13 * k
        const order = labels ? [...nodes.keys()].filter((i) => !spot || inSpot(i))
          : [...new Set([...(sel ? [selIdx, ...spotNodes] : []), ...(he ? [he[0], he[1]] : hv >= 0 ? [hv, ...nbr[hv]] : [])])]
        for (const i of order) {
          const n = nodes[i]
          ctx.globalAlpha = spot && !inSpot(i) ? (labels ? 0 : 0.25) : 1
          const text = textOf(n)
          const w = ctx.measureText(text).width
          const [x, y] = n.type === 'report' ? [n.x - w / 2, n.y + DOC_H / 2 + 10 * k]
            : labels && n.side === -1 ? [n.x - n.hit - 4 - w, n.y]
              : labels && n.side === 0 ? [n.x - w / 2, n.y + n.hit + 10] : [n.x + n.hit + 4 * k, n.y]
          if (!labels && i !== order[0] && i !== hv && boxes.some(([bx, by, bw]) => x < bx + bw && x + w > bx && Math.abs(y - by) < h)) continue
          boxes.push([x, y, w])
          ctx.strokeText(text, x, y); ctx.fillText(text, x, y)
        }
        // Edge labels: what a spotlit edge means ("pointed the group to his talk"), at its midpoint, when the data has one.
        if (!labels) {
          ctx.font = `400 ${10 / s}px Kunst Grotesk, system-ui`; ctx.textAlign = 'center'; ctx.fillStyle = '#4b5563'; ctx.globalAlpha = 1
          for (let k = 0; k < edges.length; k++) {
            const e = edges[k], [a, b, , d] = e
            if (!d?.label || !incOf(e, k)) continue
            const x = (nodes[a].x + nodes[b].x) / 2, y = (nodes[a].y + nodes[b].y) / 2, w = ctx.measureText(d.label).width
            if (e !== he && boxes.some(([bx, by, bw]) => x - w / 2 < bx + bw && x + w / 2 > bx && Math.abs(y - by) < h)) continue
            boxes.push([x - w / 2, y, w])
            ctx.strokeText(d.label, x, y); ctx.fillText(d.label, x, y)
          }
          ctx.fillStyle = '#002033'
        }
        ctx.textBaseline = 'alphabetic'
      }
      ctx.globalAlpha = 1; ctx.restore()
    }
    const redraw = () => { if (!running && !sim.settling) draw() }
    redrawRef.current = () => { refreshSelection(); redraw() }
    // Save the graph as a square PNG at 3x: every node with its colour and image, no links, transparent background.
    // The layout re-settles in a square of the same area as the browser view, then the browser layout comes back.
    saveRef.current = () => {
      const w0 = width, h0 = height, hv = hover, a0 = sim.alpha, nv = nav, saved = nodes.map((n) => [n.x, n.y, n.vx, n.vy]), k = 3
      const S = Math.round(Math.sqrt(w0 * h0))
      width = height = S; nav = [0, 0, 1] // the file is the whole graph, whatever the zoom
      for (const n of nodes) { n.x *= S / w0; n.y *= S / h0 }
      sim.alpha = 1; while (sim.alpha > ALPHA_MIN) step(); step() // the last step runs the final no-overlap pass
      hover = -1; noLinks = true; eased = false; canvas.width = S * k; canvas.height = S * k; ctx.setTransform(k, 0, 0, k, 0, 0)
      draw()
      canvas.toBlob((b) => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `CalCompute knowledge graph ${new Date().toLocaleDateString('en-CA')}.png`; a.click(); URL.revokeObjectURL(a.href) })
      nodes.forEach((n, i) => { [n.x, n.y, n.vx, n.vy] = saved[i] })
      width = w0; height = h0; nav = nv; sim.alpha = a0; hover = hv; noLinks = false; eased = false
      canvas.width = Math.floor(width * dpr); canvas.height = Math.floor(height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      draw()
    }
    imgListeners.add(redraw)

    // Layout runs until it settles. With `animate`, drawing continues at ~20 fps for the flows and shimmer.
    let running = false
    const frame = (t) => {
      if (sim.alpha > ALPHA_MIN) step()
      draw(t)
      if (sim.alpha > ALPHA_MIN) rafRef.current = requestAnimationFrame(frame)
      else if (live) timerRef.current = setTimeout(() => { rafRef.current = requestAnimationFrame(frame) }, 50)
      else { eased = false; draw(t); running = false; rafRef.current = null } // final frame: land exactly on the fitted view
    }
    const kick = () => { if (!running) { running = true; rafRef.current = requestAnimationFrame(frame) } }
    const measure = () => {
      const rect = canvas.getBoundingClientRect(), w = Math.round(rect.width), h = Math.round(rect.height)
      // The scroll box changed size while zoomed: size the canvas to the new box, at the same zoom.
      const box = scrollRef.current
      if (labels && box && zRef.current > 1 && Math.abs(w - box.offsetWidth * zRef.current) > 1) { setZoom(zRef.current, 0, 0); return }
      if (!w || !h || (w === width && h === height)) return
      width = w; height = h; dpr = Math.min(window.devicePixelRatio || 1, 2)
      canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      eased = false; draw(performance.now()) // resizing clears the canvas: repaint now, on the new fitted view
      if (radial && nodes.length && !sim.settling) { sim.alpha = Math.max(sim.alpha, 0.2); kick() } // new walls: let nodes settle inside them
    }
    let roPending = false
    const onResize = () => { if (roPending) return; roPending = true; requestAnimationFrame(() => { roPending = false; measure() }) }
    const toSim = (ev) => { const r = canvas.getBoundingClientRect(), [ox, oy, s] = view; return [(ev.clientX - r.left - ox) / s, (ev.clientY - r.top - oy) / s] }
    const pick = (ev) => {
      const [mx, my] = toSim(ev); let best = -1, bd = Infinity
      for (let i = 0; i < N; i++) {
        const n = nodes[i], d = (mx - n.x) ** 2 + (my - n.y) ** 2
        const hit = n.type === 'report' ? Math.abs(mx - n.x) < DOC_W / 2 && Math.abs(my - n.y) < DOC_H / 2 : d < (n.r + 4) ** 2
        if (hit && d < bd) { bd = d; best = i }
      }
      return best
    }
    // An edge that carries its evidence (text, cite) can be hovered: within 6 screen px of the line, nearest wins.
    const pickEdge = (ev) => {
      const [mx, my] = toSim(ev), tol = 6 / view[2]; let best = -1, bd = tol * tol
      edges.forEach(([a, b, , d], k) => {
        if (!d?.text) return
        const p = nodes[a], q = nodes[b], dx = q.x - p.x, dy = q.y - p.y, L = dx * dx + dy * dy || 1
        const t = Math.max(0, Math.min(1, ((mx - p.x) * dx + (my - p.y) * dy) / L)), d2 = (p.x + t * dx - mx) ** 2 + (p.y + t * dy - my) ** 2
        if (d2 < bd) { bd = d2; best = k }
      })
      return best
    }
    const caption = () => {
      const d = hoverEdge >= 0 ? edges[hoverEdge][3] : null
      labelRef.current.classList.toggle('truncate', !d); labelRef.current.classList.toggle('line-clamp-3', !!d)
      labelRef.current.textContent = d ? d.text : hover >= 0 ? nodes[hover].label : ''
      descRef.current.textContent = d ? (d.cite ? `Source: ${d.cite.label}. Click the line to open it.` : '') : hover >= 0 ? nodes[hover].desc || '' : ''
    }
    const onDown = (ev) => {
      const i = pick(ev)
      if (i < 0) { if (navigator) { panning = true; dragged = false; downX = lastX = ev.clientX; downY = lastY = ev.clientY; canvas.style.cursor = 'grabbing'; ev.preventDefault() } return }
      sim.dragIdx = i; dragged = false; downX = ev.clientX; downY = ev.clientY; sim.dragX = nodes[i].x; sim.dragY = nodes[i].y; ev.preventDefault() }
    const onUp = () => { sim.dragIdx = -1; if (panning) { panning = false; canvas.style.cursor = 'grab' } }
    const onMove = (ev) => {
      if (panning) {
        if (!dragged && Math.hypot(ev.clientX - downX, ev.clientY - downY) < 3) return
        dragged = true; panBy(ev.clientX - lastX, ev.clientY - lastY); lastX = ev.clientX; lastY = ev.clientY
        return
      }
      if (sim.dragIdx >= 0) {
        if (!dragged && Math.hypot(ev.clientX - downX, ev.clientY - downY) < 3) return
        dragged = true;[sim.dragX, sim.dragY] = toSim(ev); sim.alpha = Math.max(sim.alpha, 0.3); kick()
        return
      }
      const prev = hover, prevE = hoverEdge; hover = pick(ev); hoverEdge = hover < 0 ? pickEdge(ev) : -1
      canvas.style.cursor = (hover >= 0 && !nodes[hover].static) || hoverEdge >= 0 ? 'pointer' : navigator ? 'grab' : 'default'
      if (hover !== prev || hoverEdge !== prevE) { caption(); if (!running) draw() }
    }
    const onClick = (ev) => {
      if (dragged) { dragged = false; return }
      const i = pick(ev)
      if (i < 0) {
        const k = pickEdge(ev), c = k >= 0 && edges[k][3].cite
        // selectOnClick: a click on empty canvas clears the selection, as the page's Clear button does.
        if (k < 0 && selectOnClick) { clearTimeout(selectTimer); if (location.hash) { history.replaceState(null, '', location.pathname + location.search); dispatchEvent(new HashChangeEvent('hashchange')) } return }
        // selectOnClick (Contacts): a source opens in a new tab, so the graph and the selection stay.
        if (c?.href) selectOnClick ? window.open(c.href, '_blank', 'noopener') : (window.location.href = c.href)
        return
      }
      const n = nodes[i]
      // selectOnClick: a click selects the node (the URL hash, as the Find box sets it) and the page stays.
      // It waits a moment, so a double-click opens the page instead of re-centring the graph first.
      if (selectOnClick) { clearTimeout(selectTimer); if (ev.detail < 2 && n.type !== 'report' && !n.static) selectTimer = setTimeout(() => { location.hash = n.id }, 250); return }
      if (/^https?:/.test(n.href ?? '')) window.open(n.href, '_blank', 'noopener'); else if (n.type !== 'report' && !n.static) window.location.href = n.href || n.id
    }
    // selectOnClick: a double-click opens the node's own page in a new tab.
    let selectTimer = 0
    const onDbl = (ev) => { clearTimeout(selectTimer); const i = pick(ev); if (i >= 0 && nodes[i].type !== 'report' && !nodes[i].static) window.open(nodes[i].href || nodes[i].id, '_blank', 'noopener') }
    const onLeave = () => { sim.dragIdx = -1; panning = false; hover = -1; hoverEdge = -1; caption(); if (!running) draw() }

    // inPlace (and navigator): the canvas stays hidden until the layout has settled all the way, so the graph is in place on its
    // first paint. Settling runs in short slices that yield to the browser, so the page and the spinner stay live.
    // Revealed with a quick fade, not a pop: transparent while hidden, so showing it runs the transition.
    if (inPlace) { canvas.style.visibility = 'hidden'; if (!reduceMotion) { canvas.style.opacity = '0'; canvas.style.transition = 'opacity 250ms ease-out' } }
    measure()
    // Calm load-in: settle most of the layout before the first paint, then fade the canvas in while the rest settles.
    sim.presettling = true
    for (let k = 0; k < (inPlace ? 0 : 110) && sim.alpha > 0.1; k++) step()
    sim.presettling = false
    // The final no-overlap pass is sliced too: one pass at a time, a wedged-node escape every 400, up to 1600, as in step().
    // Hand back to the browser between slices with a message, not setTimeout, which browsers delay by 4 ms or more
    // once calls nest. Slices are 12 ms where a spinner must keep turning (navigator), 40 ms elsewhere.
    let passes = 0
    const SLICE = navigator ? 12 : 40
    const tick = new MessageChannel()
    tick.port1.onmessage = () => settle()
    const settle = () => {
      const t = performance.now(), spent = () => performance.now() - t >= SLICE
      while (sim.alpha > ALPHA_MIN && !spent()) step()
      let clear = false
      if (sim.alpha <= ALPHA_MIN) while (!clear && passes < 1600 && !spent()) { clear = separate(1); if (++passes % 400 === 0 && !clear) escape() }
      if (!clear && passes < 1600) { tick.port2.postMessage(0); return }
      sim.settling = false; eased = false; canvas.style.visibility = ''; canvas.style.opacity = ''; settledRef.current?.(); kick()
    }
    if (inPlace) settle()
    else if (!reduceMotion) {
      canvas.style.opacity = '0'; canvas.style.transition = 'opacity 700ms ease-out'
      requestAnimationFrame(() => { canvas.style.opacity = '1' })
    }
    canvas.addEventListener('mousedown', onDown); window.addEventListener('mouseup', onUp)
    canvas.addEventListener('mousemove', onMove); canvas.addEventListener('click', onClick); canvas.addEventListener('mouseleave', onLeave)
    if (selectOnClick) canvas.addEventListener('dblclick', onDbl)
    if (!inPlace) { if (reduceMotion) { while (sim.alpha > ALPHA_MIN) step(); draw() } else kick() } // inPlace: settle() kicks
    const ro = new ResizeObserver(onResize); ro.observe(canvas.parentElement)
    // Ctrl/⌘ + wheel (and trackpad pinch, which arrives as one) zooms about the cursor. A plain wheel scrolls.
    const box = scrollRef.current
    const onWheel = (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return
      ev.preventDefault()
      const r = box.getBoundingClientRect()
      setZoom(zRef.current * 1.1 ** (-ev.deltaY / 50), ev.clientX - r.left, ev.clientY - r.top)
    }
    if (box) { ro.observe(box); box.addEventListener('wheel', onWheel, { passive: false }) }
    // Navigator: Ctrl/⌘ + wheel (and trackpad pinch) zooms about the cursor; a plain wheel or two-finger scroll pans.
    const onNavWheel = (ev) => {
      ev.preventDefault()
      const r = canvas.getBoundingClientRect(), u = ev.deltaMode === 1 ? 16 : 1 // line-based wheels (Firefox mice)
      if (ev.ctrlKey || ev.metaKey) zoomAt(1.1 ** ((-ev.deltaY * u) / 20), ev.clientX - r.left, ev.clientY - r.top)
      else panBy(-ev.deltaX * u, -ev.deltaY * u)
    }
    if (navigator) canvas.addEventListener('wheel', onNavWheel, { passive: false })
    return () => {
      redrawRef.current = null
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      cancelAnimationFrame(anim)
      clearTimeout(timerRef.current); tick.port1.close(); imgListeners.delete(redraw)
      ro.disconnect(); window.removeEventListener('mouseup', onUp); box?.removeEventListener('wheel', onWheel); canvas.removeEventListener('wheel', onNavWheel)
      canvas.removeEventListener('mousedown', onDown); canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('click', onClick); canvas.removeEventListener('mouseleave', onLeave); canvas.removeEventListener('dblclick', onDbl)
    }
  }, [data, variant, focusNodeId, selectOnClick, animate, labels, navigator, inPlace, zoom, center[0], center[1], margin[0], margin[1], scale])

  const fill = height === '100%'
  if (labels) return (
    <div className="relative w-full" style={{ height }}>
      <div ref={scrollRef} className="h-full w-full overflow-auto">
        <div ref={innerRef} className="relative" style={{ width: '100%', height: '100%' }}>
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        </div>
      </div>
      <div className="absolute right-2 top-2 z-10 flex gap-1">
        <ZoomChips zoom={(f) => setZoom(zRef.current * f)} fit={() => setZoom(1)} />
      </div>
      <div aria-live="polite" className={`pointer-events-none absolute ${captionClass} max-w-[70%] text-sm z-10`}>
        <div ref={labelRef} className="font-medium text-gray-800 truncate" />
        <div ref={descRef} className="text-gray-500 truncate" />
      </div>
    </div>
  )
  return (
    <div className={fill ? fillClass : ''}>
      <div className={fill ? 'absolute inset-0' : 'relative w-full'} style={fill ? undefined : { height }}>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
        {(download || navigator) && (
          <div className="absolute right-2 top-2 z-10 flex gap-1">
            {navigator && <ZoomChips zoom={(f) => navRef.current?.zoom(f)} fit={() => navRef.current?.fit()} />}
            {download && <button type="button" className="chip" title="Download every node as a PNG, without links or background" onClick={() => saveRef.current?.()}>Save PNG</button>}
          </div>
        )}
        <div aria-live="polite" className={`pointer-events-none absolute ${captionClass} max-w-[70%] text-sm z-10`}>
          <div ref={labelRef} className="font-medium text-gray-800 truncate" />
          <div ref={descRef} className="text-gray-500 truncate" />
        </div>
      </div>
    </div>
  )
}

// Zoom in, zoom out, fit: the mini map's and the navigator's buttons.
function ZoomChips({ zoom, fit }) {
  return (
    <>
      <button type="button" className="chip" aria-label="Zoom in" title="Zoom in (or ⌘/Ctrl + scroll)" onClick={() => zoom(1.25)}>+</button>
      <button type="button" className="chip" aria-label="Zoom out" title="Zoom out" onClick={() => zoom(1 / 1.25)}>−</button>
      <button type="button" className="chip" aria-label="Fit the whole map" title="Fit the whole map" onClick={fit}>⤢</button>
    </>
  )
}
