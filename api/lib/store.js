/**
 * GitHub-file-backed JSON store for NimHouse (Cup + name claims).
 *
 * Everything lives in `data/*.json` of this public repo — fully
 * transparent: anyone can inspect every entry, payout, and name claim in
 * the repo history.
 *
 * Required Vercel env vars (set in the Vercel dashboard / CLI, NEVER in code):
 *   CUP_GITHUB_TOKEN  fine-grained token with Contents: read/write on this repo
 *   CUP_GITHUB_REPO   "owner/repo"
 */

const BRANCH = 'main'
const CACHE_TTL = 15_000

const SEEDS = {
  'data/cup.json': () => ({
    version: 1,
    pool: {
      perGameDailyNim: 100,
      splitPct: [50, 30, 20],
      wallet: 'PENDING — NimHouse wallet address',
      stakeTx: '',
      note: 'Cup data is seeded until the repo file exists.',
    },
    entries: {},
    payouts: {},
  }),
  'data/names.json': () => ({ version: 1, names: {} }),
  'data/cheers.json': () => ({ version: 1, cheers: [] }),
}

function repo() {
  return process.env.CUP_GITHUB_REPO || 'sasam44/nimhouse'
}

async function gh(path, opts = {}) {
  const token = process.env.CUP_GITHUB_TOKEN
  const res = await fetch(`https://api.github.com${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'nimhouse-cup',
      ...(opts.headers || {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const err = new Error(`github-${res.status}: ${body.slice(0, 200)}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

const caches = new Map()

export async function readJsonFile(path, { fresh = false } = {}) {
  if (!SEEDS[path]) throw new Error(`unknown store file: ${path}`)
  if (!fresh && caches.get(path)?.data && Date.now() - caches.get(path).at < CACHE_TTL)
    return caches.get(path).data
  const token = process.env.CUP_GITHUB_TOKEN
  let data = null
  if (token) {
    try {
      const blob = await gh(`/repos/${repo()}/contents/${path}?ref=${BRANCH}`)
      data = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'))
    } catch (e) {
      if (e.status !== 404) throw e
    }
  }
  if (!data) data = SEEDS[path]()
  if (!caches.get(path)?.data || fresh) caches.set(path, { at: Date.now(), data })
  return data
}

/**
 * Read-modify-write with a short retry on conflict.
 * `mutator(data)` returns the next data, or null to skip the write.
 */
export async function writeJsonFile(path, mutator) {
  if (!process.env.CUP_GITHUB_TOKEN) throw new Error('cup-not-configured')
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = await readJsonFile(path, { fresh: true })
    const next = mutator(data)
    if (!next) return data
    let sha = ''
    try {
      const blob = await gh(`/repos/${repo()}/contents/${path}?ref=${BRANCH}`)
      sha = blob.sha
    } catch (e) {
      if (e.status !== 404) throw e
    }
    const body = {
      message: `${path.split('/').pop()}: update ${new Date().toISOString()}`,
      content: Buffer.from(JSON.stringify(next, null, 2)).toString('base64'),
      branch: BRANCH,
    }
    if (sha) body.sha = sha
    try {
      await gh(`/repos/${repo()}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
    } catch (e) {
      if (e.status === 409 || e.status === 422) continue // conflict — retry with fresh read
      throw e
    }
    caches.set(path, { at: Date.now(), data: next })
    return next
  }
  throw new Error('cup-write-conflict')
}

// ---- cup.json convenience API (used by existing endpoints) ----
export async function readCup(opts) {
  return readJsonFile('data/cup.json', opts)
}
export async function writeCup(mutator) {
  return writeJsonFile('data/cup.json', mutator)
}
