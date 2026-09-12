const KEY = (g) => `nimhouse.lb.${g}`

export function loadLB(game) {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY(game)) || '[]')
    return Array.isArray(raw) ? raw : []
  } catch {
    return []
  }
}

/**
 * Record a run. Returns { rank, top } where top is the local top-10.
 * Leaderboards are per-device (no backend in a mini app), which the UI states honestly.
 */
export function submitScore(game, entry) {
  const lb = loadLB(game)
  lb.push(entry)
  lb.sort((a, b) => b.score - a.score || a.ts - b.ts)
  const top = lb.slice(0, 10)
  localStorage.setItem(KEY(game), JSON.stringify(top))
  const rank = top.findIndex((e) => e.id === entry.id) + 1
  return { rank, top }
}

export function bestScore(game) {
  const lb = loadLB(game)
  return lb.length ? Math.max(...lb.map((e) => e.score)) : 0
}

export function markVerified(game, id) {
  const lb = loadLB(game).map((e) => (e.id === id ? { ...e, verified: true } : e))
  localStorage.setItem(KEY(game), JSON.stringify(lb.slice(0, 10)))
}
