/**
 * GitHub-file-backed JSON store for the NimHouse Cup.
 *
 * The leaderboard lives in `data/cup.json` of this public repo — fully
 * transparent: anyone can inspect every entry and payout in the repo history.
 *
 * Required Vercel env vars (set in the Vercel dashboard / CLI, NEVER in code):
 *   CUP_GITHUB_TOKEN  fine-grained token with Contents: read/write on this repo
 *   CUP_GITHUB_REPO   "owner/repo" (defaults to the env's repo)
 */

const FILE_PATH = 'data/cup.json'
const BRANCH = 'main'
const CACHE_TTL = 15_000

function seed() {
  return {
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
  }
}

async function gh(path, opts = {}) {
  const token = process.env.CUP_GITHUB_TOKEN
  const repo = process.env.CUP_GITHUB_REPO || 'sasam/nimhouse'
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

let cache = { at: 0, data: null }

export async function readCup({ fresh = false } = {}) {
  if (!fresh && cache.data && Date.now() - cache.at < CACHE_TTL) return cache.data
  const token = process.env.CUP_GITHUB_TOKEN
  let data = null
  if (token) {
    try {
      const repo = process.env.CUP_GITHUB_REPO || 'sasam/nimhouse'
      const blob = await gh(`/repos/${repo}/contents/${FILE_PATH}?ref=${BRANCH}`)
      data = JSON.parse(Buffer.from(blob.content, 'base64').toString('utf8'))
    } catch (e) {
      if (e.status !== 404) throw e
    }
  }
  if (!data) data = seed()
  if (!cache.data || fresh) cache = { at: Date.now(), data }
  return data
}

/**
 * Read-modify-write with a short retry on conflict.
 * `mutator(data)` returns the next data, or null to skip the write.
 */
export async function writeCup(mutator) {
  if (!process.env.CUP_GITHUB_TOKEN) throw new Error('cup-not-configured')
  const repo = process.env.CUP_GITHUB_REPO || 'sasam/nimhouse'
  for (let attempt = 0; attempt < 3; attempt++) {
    const data = await readCup({ fresh: true })
    const next = mutator(data)
    if (!next) return data
    let sha = ''
    try {
      const blob = await gh(`/repos/${repo}/contents/${FILE_PATH}?ref=${BRANCH}`)
      sha = blob.sha
    } catch (e) {
      if (e.status !== 404) throw e
    }
    const body = {
      message: `cup: update ${new Date().toISOString()}`,
      content: Buffer.from(JSON.stringify(next, null, 2)).toString('base64'),
      branch: BRANCH,
    }
    if (sha) body.sha = sha
    try {
      await gh(`/repos/${repo}/contents/${FILE_PATH}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
    } catch (e) {
      if (e.status === 409 || e.status === 422) continue // conflict — retry with fresh read
      throw e
    }
    cache = { at: Date.now(), data: next }
    return next
  }
  throw new Error('cup-write-conflict')
}
