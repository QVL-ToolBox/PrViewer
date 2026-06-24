// Provider de référence : Azure DevOps. Implémente le contrat PrProvider.
// Toute la logique spécifique à ADO (auth, retry, analyse des threads) vit ici.

import type { PrView, Role, UpdateKind } from '../types'
import type { FetchResult, FieldDef, PrProvider } from './types'

const API_VERSION = '7.1'

// Retry rapide : absorbe la fenêtre pendant laquelle le proxy Vite rafraîchit
// le jeton Azure AD (la 1ʳᵉ requête après expiration reçoit la page HTML de login).
const MAX_ATTEMPTS = 3
const RETRY_BASE_DELAY_MS = 500
// Plafond du délai imposé par un header Retry-After (en cas de 429 agressif).
const MAX_RETRY_AFTER_MS = 5000
// Nombre maximal de PR analysées en parallèle (borne le N+1 sur les threads).
const ANALYZE_CONCURRENCY = 8

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Applique `fn` à `items` en bornant la concurrence à `limit` (home made, sans
 * dépendance). Préserve l'ordre des résultats. Évite que des centaines de
 * requêtes partent en même temps quand on analyse l'activité de chaque PR.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, worker)
  await Promise.all(workers)
  return results
}

// --- Types propres à l'API Azure DevOps -----------------------------------

// Les champs issus de l'API externe sont optionnels : une identité supprimée,
// une PR système ou un objet partiel peuvent les laisser absents.
interface IdentityRef {
  id?: string
  displayName?: string
}

interface GitProjectRef {
  id?: string
  name?: string
}

interface GitRepository {
  id: string
  name: string
  project?: GitProjectRef
}

interface PullRequest {
  pullRequestId: number
  title: string
  status: string
  creationDate: string
  createdBy?: IdentityRef
  repository: GitRepository
  isDraft?: boolean
  sourceRefName?: string
  targetRefName?: string
}

interface ListResponse<T> {
  count: number
  value: T[]
}

interface ConnectionData {
  authenticatedUser: { id: string; providerDisplayName?: string }
}

interface Comment {
  author?: IdentityRef
  commentType?: string // 'text' | 'system' | 'codeChange'
  publishedDate?: string
  lastUpdatedDate?: string
  isDeleted?: boolean
}

interface Thread {
  publishedDate?: string
  lastUpdatedDate?: string
  isDeleted?: boolean
  comments?: Comment[]
  properties?: Record<string, { $value?: unknown } | string | number | undefined>
}

// --- Normalisation des entrées de config ----------------------------------

/** Extrait le nom d'org si l'utilisateur colle une URL complète. */
export function normalizeOrg(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  const match = trimmed.match(/dev\.azure\.com\/([^/]+)/i)
  if (match) return match[1]
  const legacy = trimmed.match(/^https?:\/\/([^.]+)\.visualstudio\.com/i)
  if (legacy) return legacy[1]
  return trimmed
}

/** Extrait le nom de projet si l'utilisateur colle une URL Azure DevOps complète. */
export function normalizeProject(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  const dev = trimmed.match(/dev\.azure\.com\/[^/]+\/([^/?#]+)/i)
  if (dev) return decodeURIComponent(dev[1])
  const legacy = trimmed.match(/[^./]+\.visualstudio\.com\/([^/?#]+)/i)
  if (legacy) return decodeURIComponent(legacy[1])
  return trimmed
}

function parseProjects(raw: string): string[] {
  return raw
    .split(',')
    .map((p) => normalizeProject(p))
    .filter(Boolean)
}

// --- Appels HTTP -----------------------------------------------------------

function authHeader(pat: string): string {
  return 'Basic ' + btoa(':' + pat)
}

function isTransientStatus(status: number): boolean {
  // 203 Non-Authoritative = page de login ADO renvoyée en auth dégradée (transitoire).
  // 429 Too Many Requests = throttling ADO, à réessayer (idéalement après Retry-After).
  return (
    status === 401 ||
    status === 203 ||
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504
  )
}

interface AdoCtx {
  org: string
  pat?: string
}

/** Verdict typé d'une réponse HTTP ADO, consommé par `adoGet`. */
type ResponseVerdict =
  | { kind: 'ok' }
  | { kind: 'auth' }
  | { kind: 'transient' }
  | { kind: 'fatal' }

/**
 * Classe une réponse en un verdict unique (pure, sans effet de bord) :
 *   - ok        : 2xx + corps JSON exploitable
 *   - auth      : auth refusée / dégradée (401, 203, ou 2xx renvoyant du HTML)
 *   - transient : statut transitoire à réessayer
 *   - fatal     : erreur définitive
 */
function classifyResponse(res: Response, isJson: boolean): ResponseVerdict {
  if (res.ok && isJson) return { kind: 'ok' }
  if (res.status === 401 || res.status === 203 || (res.ok && !isJson)) return { kind: 'auth' }
  if (isTransientStatus(res.status) || !isJson) return { kind: 'transient' }
  return { kind: 'fatal' }
}

/** Délai d'attente avant retry : respecte Retry-After (plafonné) sinon backoff linéaire. */
function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get('retry-after')
  if (header) {
    const seconds = Number(header)
    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS)
    }
  }
  return RETRY_BASE_DELAY_MS * attempt
}

async function adoGet<T>(
  ctx: AdoCtx,
  path: string,
  params: Record<string, string> = {},
  apiVersion: string = API_VERSION,
): Promise<T> {
  const qs = new URLSearchParams({ 'api-version': apiVersion, ...params })
  const url = `/ado/${encodeURIComponent(ctx.org)}/${path}?${qs.toString()}`
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (ctx.pat) headers.Authorization = authHeader(ctx.pat)

  let lastError: Error = new Error(`Échec de la requête sur ${path}.`)

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let res: Response
    try {
      res = await fetch(url, { headers })
    } catch {
      lastError = new Error('Connexion au serveur impossible. Nouvelle tentative…')
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * attempt)
        continue
      }
      break
    }

    const contentType = res.headers.get('content-type') ?? ''
    const isJson = contentType.includes('application/json')
    const verdict = classifyResponse(res, isJson)

    if (verdict.kind === 'ok') {
      return res.json() as Promise<T>
    }

    if (verdict.kind === 'auth') {
      lastError = new Error(
        'Authentification refusée. Vérifie ton PAT (scope « Code (Read) ») ou ta session « az login ».',
      )
    } else {
      const body = await res.text().catch(() => '')
      lastError = new Error(`Erreur HTTP ${res.status} sur ${path} — ${body.slice(0, 160)}`)
    }

    const retriable = verdict.kind === 'auth' || verdict.kind === 'transient'
    if (retriable && attempt < MAX_ATTEMPTS) {
      await sleep(retryDelayMs(res, attempt))
      continue
    }
    break
  }

  throw lastError
}

// Cache en closure par org : `connectionData` ne change pas durant la session.
// On garde la Promise (pas seulement la valeur) pour dédupliquer les appels
// concurrents (creator + reviewer partis en parallèle).
const myIdCache = new Map<string, Promise<string>>()

function resolveMyId(ctx: AdoCtx): Promise<string> {
  return adoGet<ConnectionData>(ctx, '_apis/connectionData', {}, '7.1-preview').then((data) => {
    if (!data.authenticatedUser?.id) {
      throw new Error("Impossible d'identifier l'utilisateur courant.")
    }
    return data.authenticatedUser.id
  })
}

function getMyId(ctx: AdoCtx): Promise<string> {
  const cached = myIdCache.get(ctx.org)
  if (cached) return cached
  const pending = resolveMyId(ctx).catch((error: unknown) => {
    myIdCache.delete(ctx.org)
    throw error
  })
  myIdCache.set(ctx.org, pending)
  return pending
}

function branch(ref?: string): string | undefined {
  return ref ? ref.replace('refs/heads/', '') : undefined
}

function buildWebUrl(org: string, pr: PullRequest): string {
  const project = encodeURIComponent(pr.repository.project?.name ?? '?')
  const repo = encodeURIComponent(pr.repository.name)
  return `https://dev.azure.com/${encodeURIComponent(org)}/${project}/_git/${repo}/pullrequest/${pr.pullRequestId}`
}

// --- Analyse de l'activité pertinente --------------------------------------

function propString(props: Thread['properties'], key: string): string | undefined {
  const raw = props?.[key]
  if (raw == null) return undefined
  if (typeof raw === 'object' && '$value' in raw) {
    return raw.$value == null ? undefined : String(raw.$value)
  }
  return String(raw)
}

function timeMs(...dates: Array<string | undefined>): number {
  for (const d of dates) {
    if (d) {
      const ms = new Date(d).getTime()
      if (!Number.isNaN(ms)) return ms
    }
  }
  return 0
}

interface ActivityResult {
  lastActivity: string
  updateKind: UpdateKind
}

/**
 * Ne retient que les activités *pertinentes* du point de vue de `myId` :
 *   - commentaire d'un autre          → 'comment'
 *   - vote négatif d'un autre          → 'rejected'  (Rejected -10 / Waiting -5)
 *   - nouveaux commits d'un autre      → 'commits'
 * Ignorés : mes propres actions, votes positifs (approve), ajouts de reviewers,
 * mises à jour de statut/build.
 */
async function analyzeActivity(ctx: AdoCtx, project: string, pr: PullRequest, myId: string): Promise<ActivityResult> {
  const base = `${encodeURIComponent(project)}/_apis/git/repositories/${pr.repository.id}/pullRequests/${pr.pullRequestId}`
  const events: Array<{ kind: UpdateKind; ms: number }> = []

  try {
    const threads = await adoGet<ListResponse<Thread>>(ctx, `${base}/threads`)
    for (const t of threads.value ?? []) {
      if (t.isDeleted) continue
      const threadMs = timeMs(t.lastUpdatedDate, t.publishedDate)
      const type = propString(t.properties, 'CodeReviewThreadType')
      const comments = (t.comments ?? []).filter((c) => !c.isDeleted)

      if (!type) {
        // Fil de commentaires humain.
        for (const c of comments) {
          if ((c.commentType ?? 'text') !== 'text') continue
          if (c.author?.id && c.author.id !== myId) {
            events.push({ kind: 'comment', ms: timeMs(c.lastUpdatedDate, c.publishedDate) || threadMs })
          }
        }
        continue
      }

      const actor = comments[0]?.author?.id
      if (actor === myId) continue // jamais mes propres actions
      const when = timeMs(comments[0]?.lastUpdatedDate, comments[0]?.publishedDate) || threadMs

      if (type === 'VoteUpdate') {
        const vote = Number(propString(t.properties, 'CodeReviewVoteResult') ?? '0')
        if (vote < 0) events.push({ kind: 'rejected', ms: when })
      } else if (type === 'RefUpdate') {
        events.push({ kind: 'commits', ms: when })
      }
    }
  } catch (error) {
    // Best effort : la lecture des threads a échoué (réseau/transitoire). On
    // retombe sur « new » faute de mieux, mais on ne confond pas ce silence
    // avec une vraie absence d'activité — d'où le warn ciblé.
    console.warn(`Activité illisible pour la PR !${pr.pullRequestId}, retombée sur « new ».`, error)
    return { lastActivity: pr.creationDate, updateKind: 'new' }
  }

  if (events.length === 0) {
    return { lastActivity: pr.creationDate, updateKind: 'new' }
  }
  events.sort((a, b) => b.ms - a.ms)
  return { lastActivity: new Date(events[0].ms).toISOString(), updateKind: events[0].kind }
}

interface RoleResult {
  prs: PrView[]
  failedProjects: string[]
}

async function fetchProjectRole(
  ctx: AdoCtx,
  project: string,
  myId: string,
  criterion: string,
): Promise<PrView[]> {
  const list = await adoGet<ListResponse<PullRequest>>(
    ctx,
    `${encodeURIComponent(project)}/_apis/git/pullrequests`,
    { 'searchCriteria.status': 'active', [criterion]: myId, '$top': '200' },
  )
  return mapWithConcurrency(list.value ?? [], ANALYZE_CONCURRENCY, async (pr): Promise<PrView> => {
    const { lastActivity, updateKind } = await analyzeActivity(ctx, project, pr, myId)
    return {
      id: String(pr.pullRequestId),
      ref: `!${pr.pullRequestId}`,
      title: pr.title,
      author: pr.createdBy?.displayName ?? 'Inconnu',
      group: pr.repository.name,
      source: branch(pr.sourceRefName),
      target: branch(pr.targetRefName),
      isDraft: pr.isDraft,
      webUrl: buildWebUrl(ctx.org, pr),
      lastActivity,
      updateKind,
    }
  })
}

async function fetchRole(
  ctx: AdoCtx,
  projects: string[],
  myId: string,
  role: Role,
): Promise<RoleResult> {
  const criterion = role === 'creator' ? 'searchCriteria.creatorId' : 'searchCriteria.reviewerId'

  // allSettled : un projet inaccessible (inexistant, droits manquants) ne doit
  // pas faire échouer les autres. On agrège les PR des projets OK et on
  // collecte ceux en échec pour les remonter en avertissement.
  const settled = await Promise.allSettled(
    projects.map((project) => fetchProjectRole(ctx, project, myId, criterion)),
  )

  const prs: PrView[] = []
  const failedProjects: string[] = []
  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      prs.push(...result.value)
    } else {
      failedProjects.push(projects[index])
    }
  })

  return { prs, failedProjects }
}

// --- Le provider -----------------------------------------------------------

const configFields: FieldDef[] = [
  {
    key: 'org',
    label: 'Organisation',
    type: 'text',
    placeholder: 'mon-org ou https://dev.azure.com/mon-org',
    required: true,
  },
  {
    key: 'projects',
    label: 'Projet(s)',
    type: 'list',
    placeholder: 'MonProjet (plusieurs séparés par des virgules)',
    required: true,
  },
  {
    key: 'pat',
    label: 'Personal Access Token (optionnel)',
    type: 'password',
    placeholder: 'Laisse vide pour utiliser ton az login',
    helperText:
      "Vide → auth via ton az login (jeton Azure AD). Sinon, PAT avec le scope Code (Read).",
  },
]

export const adoProvider: PrProvider = {
  id: 'ado',
  name: 'Azure DevOps',
  configFields,

  validateConfig(config) {
    if (!normalizeOrg(config.org ?? '')) return "Renseigne l'organisation."
    if (parseProjects(config.projects ?? '').length === 0) return 'Renseigne au moins un projet.'
    return null
  },

  async fetchPullRequests(config): Promise<FetchResult> {
    const ctx: AdoCtx = { org: normalizeOrg(config.org ?? ''), pat: config.pat?.trim() || undefined }
    const projects = parseProjects(config.projects ?? '')
    const myId = await getMyId(ctx)
    const [creator, reviewer] = await Promise.all([
      fetchRole(ctx, projects, myId, 'creator'),
      fetchRole(ctx, projects, myId, 'reviewer'),
    ])

    const unavailable = [...new Set([...creator.failedProjects, ...reviewer.failedProjects])]
    const warnings =
      unavailable.length > 0
        ? [`Projet(s) indisponible(s) (ignoré(s)) : ${unavailable.join(', ')}.`]
        : undefined

    return { creator: creator.prs, reviewer: reviewer.prs, warnings }
  },
}
