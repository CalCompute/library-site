// The knowledge graph's layout: the force simulation WikiGraph.jsx runs on the page, as plain JS, so the build can lay
// the graph out the same way for graph.png (scripts/graph-png.mjs). Moved out of WikiGraph.jsx's effect unchanged.
// The caller owns the canvas: size() gives its [width, height] in px, and the walls are its edges. Mutable state the
// caller also touches (alpha, the dragged node, the settling flags) lives on the returned object.
export const DOC_W = 76, DOC_H = 96 // the Framework Report, drawn as a document
export const ALPHA_MIN = 0.005

// place(nodes, fixedIdx, focusIdx): optional, positions and pins nodes before the radial start (a labeled mini map).
export function createLayout(data, { radial = true, labels = false, focusNodeId, center = [0.5, 0.5], scale = 0.8, size, place }) {
  const sim = { alpha: labels ? 0 : 1, dragIdx: -1, dragX: 0, dragY: 0, presettling: false, settling: false } // labeled maps are placed, not simulated
  const sizes = data.nodes.map((n) => Math.max(1, n.size || 1))
  const minS = Math.min(...sizes), maxS = Math.max(...sizes)
  const R_MIN = 6, R_MAX = radial ? 22 : labels ? 9 : 18
  const radiusFor = (n) => n.type === 'report' ? 56 : R_MIN + ((Math.sqrt(Math.max(1, n.size || 1)) - Math.sqrt(minS)) / (Math.sqrt(maxS) - Math.sqrt(minS) || 1)) * (R_MAX - R_MIN)

  const N = data.nodes.length
  const idToIdx = new Map(data.nodes.map((n, i) => [n.id, i]))
  const nodes = data.nodes.map((n, i) => {
    const a = (i / N) * Math.PI * 2, r0 = radial ? 40 + (n.ring ?? 3) * 60 : 90
    const r = labels && n.id === focusNodeId ? 14 : n.radius ?? radiusFor(n) // a mini map's own page stands out; n.radius: the data sets it
    const hit = n.type === 'report' ? Math.hypot(DOC_W, DOC_H) / 2 : n.system === 'zulip' ? r * 1.2 : n.system === 'mail' ? r * 1.3 : n.system === 'drive' ? r * 1.15 : r
    return { ...n, r, hit, x: Math.cos(a) * r0, y: Math.sin(a) * r0, vx: 0, vy: 0 }
  })
  const edges = data.edges.map((e) => [idToIdx.get(e.source), idToIdx.get(e.target), e.kind, e]).filter(([a, b]) => a != null && b != null)

  // Round 2's even layout, opened up: GAP 3 -> 8 and K_REPULSE 500 -> 700 space every node a little further apart.
  // Radial: weak link springs and firmer rings keep the picture round and even (measured: centre of mass within 2% of
  // the Report, emptiest of 8 directions 0.74 of the fullest). Local graphs keep firmer springs so neighbours stay close.
  const REST = 40, K_SPRING = 0.02, K_REPULSE = 700, K_CENTER = 0.01, DAMP = 0.8, V_MAX = 5, GAP = 10
  const nbr = Array.from({ length: N }, () => new Set())
  for (const [a, b] of edges) { nbr[a].add(b); nbr[b].add(a) }
  const mainIdx = radial ? nodes.findIndex((n) => n.type === 'report') : -1
  const fixedIdx = new Set() // nodes held at a fixed place (px, py)
  const focusIdx = focusNodeId ? nodes.findIndex((n) => n.id === focusNodeId) : -1
  place?.(nodes, fixedIdx, focusIdx)

  const ALPHA_DECAY = 0.02
  // Rings sized by what they hold: each ring is a band just wide enough for its nodes at the GAP spacing,
  // starting right outside the one before it. Small inner rings hug the Report; nothing leaves a hole.
  const PACK = 0.62 // share of a band's area the node disks fill
  const ringTarget = new Map()
  if (radial) {
    const rings = [...new Set(nodes.map((n) => n.ring ?? 3))].sort((a, b) => a - b)
    let inner = 0
    for (const k of rings) {
      const members = nodes.filter((n) => (n.ring ?? 3) === k)
      if (k === 0) { inner = Math.max(...members.map((n) => n.hit)) + GAP; ringTarget.set(0, 0); continue }
      const area = members.reduce((a, n) => a + Math.PI * (n.hit + GAP / 2) ** 2, 0) / PACK
      const outer = Math.sqrt(inner * inner + area / Math.PI)
      ringTarget.set(k, Math.max(inner + Math.max(...members.map((n) => n.hit)) + GAP / 2, (inner + outer) / 2))
      inner = Math.max(outer, ringTarget.get(k) + Math.max(...members.map((n) => n.hit)) + GAP / 2)
    }
    // The Report's seven sections sit like a clock face around it: fixed, evenly spaced, A at the top.
    // Without this their links drag them together on one side and the Report ends up beside the mass.
    const hubs = nodes.map((n, i) => [n, i]).filter(([n]) => n.ring === 1).sort(([a], [b]) => a.label.localeCompare(b.label))
    hubs.forEach(([n, i], k) => { const a = -Math.PI / 2 + (k / hubs.length) * Math.PI * 2; n.px = Math.cos(a) * ringTarget.get(1); n.py = Math.sin(a) * ringTarget.get(1); fixedIdx.add(i) })
    // Start with no type information: a sunflower spiral in an order shuffled by a hash of each page's id.
    // Where a node ends up then comes from its links alone.
    const h = (t) => { let x = 2166136261; for (const c of t) x = Math.imul(x ^ c.charCodeAt(0), 16777619); return x >>> 0 }
    const free = nodes.filter((n, i) => i !== mainIdx && !fixedIdx.has(i)).sort((p, q) => h(p.id) - h(q.id))
    const step0 = ringTarget.get(1) * 0.35
    free.forEach((n, i) => { const r = ringTarget.get(1) + step0 * Math.sqrt(i + 1), a = i * 2.39996; n.x = Math.cos(a) * r; n.y = Math.sin(a) * r })
  }
  const K_BALANCE = 0.06 // pulls the free nodes' centre of mass onto the Report, so no side is heavier

  const step = () => {
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, d2 = dx * dx + dy * dy
      if (d2 < 1) d2 = 1
      const d = Math.sqrt(d2), f = (K_REPULSE / d2) * sim.alpha, fx = (dx / d) * f, fy = (dy / d) * f
      nodes[i].vx += fx; nodes[i].vy += fy; nodes[j].vx -= fx; nodes[j].vy -= fy
    }
    for (const [a, b] of edges) {
      const dx = nodes[b].x - nodes[a].x, dy = nodes[b].y - nodes[a].y, d = Math.sqrt(dx * dx + dy * dy) || 1
      const f = (d - REST) * K_SPRING * sim.alpha, fx = (dx / d) * f, fy = (dy / d) * f
      nodes[a].vx += fx; nodes[a].vy += fy; nodes[b].vx -= fx; nodes[b].vy -= fy
    }
    let mx = 0, my = 0, mc = 0
    if (radial) { for (let i = 0; i < N; i++) if (i !== mainIdx) { mx += nodes[i].x; my += nodes[i].y; mc++ } mx /= mc || 1; my /= mc || 1 }
    for (let i = 0; i < N; i++) {
      const n = nodes[i]
      if (radial) {
        n.vx -= mx * K_BALANCE * sim.alpha; n.vy -= my * K_BALANCE * sim.alpha // walls contain the graph; no pull to the centre, so nodes use the whole element
      } else { n.vx -= n.x * K_CENTER * sim.alpha; n.vy -= n.y * K_CENTER * sim.alpha }
      n.vx = Math.max(-V_MAX, Math.min(V_MAX, n.vx * DAMP)); n.vy = Math.max(-V_MAX, Math.min(V_MAX, n.vy * DAMP))
      n.x += n.vx; n.y += n.vy
      if (radial) wall(n, true)
    }
    sim.alpha -= sim.alpha * ALPHA_DECAY
    for (const k of [mainIdx, focusIdx]) if (k >= 0 && k !== sim.dragIdx) Object.assign(nodes[k], { x: 0, y: 0, vx: 0, vy: 0 })
    for (const k of fixedIdx) if (k !== sim.dragIdx) Object.assign(nodes[k], { x: nodes[k].px, y: nodes[k].py, vx: 0, vy: 0 })
    if (sim.dragIdx >= 0) Object.assign(nodes[sim.dragIdx], { x: sim.dragX, y: sim.dragY, vx: 0, vy: 0 })
    if (sim.alpha > ALPHA_MIN) separate(sim.presettling ? 1 : 3)
    else if (!sim.settling) for (let round = 0; round < 4 && !separate(400); round++) escape() // settle() slices this pass itself
  }

  // No overlaps, ever: every pair keeps at least GAP between the outer edges of their shapes.
  // Pinned nodes (the Report, a page's focus node, a dragged node) do not move; the other node takes the whole push.
  // Repeats until nothing overlaps, up to `iters` passes (3 per frame while moving, 300 once settled).
  const pinned = (i) => i === mainIdx || i === focusIdx || i === sim.dragIdx || fixedIdx.has(i)
  // Push one pair apart if their shapes are closer than GAP. Returns true if it moved them.
  const pair = (i, j) => {
    const a = nodes[i], b = nodes[j], min = a.hit + b.hit + GAP
    let dx = a.x - b.x, dy = a.y - b.y
    if (Math.abs(dx) >= min || Math.abs(dy) >= min) return false
    let d = Math.sqrt(dx * dx + dy * dy)
    if (d >= min) return false
    if (d < 0.01) { dx = Math.cos(i + j); dy = Math.sin(i + j); d = 1 } // coincident: split in a fixed direction
    const over = min - d + 0.01, ux = dx / d, uy = dy / d, pa = pinned(i), pb = pinned(j)
    if (pa && pb) return false
    const ka = pa ? 0 : pb ? 1 : 0.5, kb = 1 - ka
    a.x += ux * over * ka; a.y += uy * over * ka; b.x -= ux * over * kb; b.y -= uy * over * kb
    return true
  }
  // Only near pairs can overlap. Each pass bins the nodes into square cells as wide as the largest gap any two
  // ordinary nodes need (CELL), so each node is checked against its own and the 8 neighbouring cells. Nodes wider
  // than that (the Report) are checked against every node. The bins are made at the start of a pass, so a pass
  // that moves nothing has checked the exact positions: "no overlaps" stays exact.
  const HS = Math.max(0, ...nodes.filter((n) => n.type !== 'report').map((n) => n.hit))
  const CELL = 2 * HS + GAP
  const big = nodes.map((n, i) => i).filter((i) => nodes[i].hit > HS)
  const cellOf = (n) => [Math.floor(n.x / CELL), Math.floor(n.y / CELL)]
  const ck = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768)
  const separate = (iters) => {
    for (let it = 0; it < iters; it++) {
      let moved = false
      const cells = new Map()
      for (let i = 0; i < N; i++) {
        if (nodes[i].hit > HS) continue
        const k = ck(...cellOf(nodes[i])), c = cells.get(k)
        c ? c.push(i) : cells.set(k, [i])
      }
      for (let i = 0; i < N; i++) {
        if (nodes[i].hit > HS) continue
        const [cx, cy] = cellOf(nodes[i])
        for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
          const c = cells.get(ck(cx + ox, cy + oy))
          if (c) for (const j of c) if (j > i && pair(i, j)) moved = true
        }
      }
      for (const b of big) for (let j = 0; j < N; j++) if (j !== b && !(nodes[j].hit > HS && j < b) && pair(Math.min(b, j), Math.max(b, j))) moved = true
      if (radial) for (const n of nodes) wall(n, false)
      if (!moved) return true
    }
    return false
  }
  // A node wedged between two fixed nodes (a hub and the Report) is pushed back and forth and cannot escape.
  // Move it outward, away from the Report, until it clears every fixed node; then normal spacing settles it.
  const escape = () => {
    for (let i = 0; i < N; i++) {
      if (pinned(i)) continue
      const n = nodes[i]
      for (let tries = 0; tries < 60; tries++) {
        const hit = [...fixedIdx, mainIdx].some((k) => k >= 0 && Math.hypot(n.x - nodes[k].x, n.y - nodes[k].y) < n.hit + nodes[k].hit + GAP)
        if (!hit) break
        const r = Math.hypot(n.x, n.y) || 1
        n.x += (n.x / r) * (n.hit + GAP); n.y += (n.y / r) * (n.hit + GAP)
      }
    }
  }

  // The fixed view for a contained graph. The scale shrinks only if the element is too small to hold every node
  // at its gap (about 42% fill); on desktop it never does.
  let need = 0
  const fixedView = () => {
    if (!need) need = nodes.reduce((a, n) => a + Math.PI * (n.hit + GAP / 2) ** 2, 0)
    const [width, height] = size()
    const [fx, fy] = width >= 1024 ? center : [0.5, 0.5]
    const s = Math.min(scale, Math.sqrt((0.42 * width * height) / need)) || scale
    return [width * fx, height * fy, s]
  }
  // Bounce off the element's edges: keep each node's outer edge inside, and reverse its speed (losing some).
  const wall = (n, bounce) => {
    const [width, height] = size()
    if (n.type === 'report' || !width) return
    const [ox, oy, s] = fixedView(), pad = 4 / s
    const x0 = -ox / s + n.hit + pad, x1 = (width - ox) / s - n.hit - pad, y0 = -oy / s + n.hit + pad, y1 = (height - oy) / s - n.hit - pad
    if (n.x < x0) { n.x = x0; if (bounce) n.vx = Math.abs(n.vx) * 0.5 } else if (n.x > x1) { n.x = x1; if (bounce) n.vx = -Math.abs(n.vx) * 0.5 }
    if (n.y < y0) { n.y = y0; if (bounce) n.vy = Math.abs(n.vy) * 0.5 } else if (n.y > y1) { n.y = y1; if (bounce) n.vy = -Math.abs(n.vy) * 0.5 }
  }
  Object.assign(sim, { nodes, edges, nbr, N, mainIdx, focusIdx, fixedIdx, step, separate, escape, fixedView })
  return sim
}
