import type { ProviderConfig } from './providers/types'

/** Intervalle de rafraîchissement automatique par défaut, en minutes. */
export const DEFAULT_REFRESH_MINUTES = 2

/** Version courante du schéma de config persisté. À incrémenter à chaque migration. */
export const CONFIG_VERSION = 1

/** Configuration de l'app : provider choisi + sa config + réglages transverses. */
export interface AppConfig {
  /** Version du schéma, pour piloter les migrations futures. */
  version: number
  /** Identifiant du provider (ex: 'ado'). */
  provider: string
  /** Config propre au provider (champs déclarés par celui-ci). */
  providerConfig: ProviderConfig
  /** Intervalle de rafraîchissement automatique, en minutes. 0 = désactivé. */
  refreshMinutes: number
}

const CONFIG_KEY = 'ado_pr_viewer_config'
const SECRETS_KEY = 'ado_pr_viewer_secrets'
const SEEN_KEY = 'ado_pr_viewer_seen'

/** Secrets routés vers sessionStorage : effacés à la fermeture de l'onglet. */
interface StoredSecrets {
  provider: string
  secrets: Record<string, string>
}

function loadSecrets(): StoredSecrets | null {
  const raw = sessionStorage.getItem(SECRETS_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as StoredSecrets
  } catch {
    return null
  }
}

function writeSecrets(provider: string, secrets: Record<string, string>): void {
  if (Object.keys(secrets).length === 0) {
    sessionStorage.removeItem(SECRETS_KEY)
    return
  }
  sessionStorage.setItem(SECRETS_KEY, JSON.stringify({ provider, secrets } satisfies StoredSecrets))
}

// Ancien format (mono-provider ADO), pour migration transparente.
interface LegacyConfig {
  org?: string
  projects?: string[]
  pat?: string
  refreshMinutes?: number
}

function migrate(raw: AppConfig & LegacyConfig): AppConfig | null {
  // Nouveau format déjà présent (avec ou sans `version` : on l'estampille).
  if (raw.provider && raw.providerConfig) {
    return {
      version: CONFIG_VERSION,
      provider: raw.provider,
      providerConfig: raw.providerConfig,
      refreshMinutes: raw.refreshMinutes ?? DEFAULT_REFRESH_MINUTES,
    }
  }
  // Ancien format ADO (legacy, sans `version`) → on le convertit.
  if (raw.org && raw.projects?.length) {
    return {
      version: CONFIG_VERSION,
      provider: 'ado',
      providerConfig: {
        org: raw.org,
        projects: raw.projects.join(', '),
        pat: raw.pat ?? '',
      },
      refreshMinutes: raw.refreshMinutes ?? DEFAULT_REFRESH_MINUTES,
    }
  }
  return null
}

export function loadConfig(): AppConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY)
  if (!raw) return null
  let cfg: AppConfig | null
  try {
    cfg = migrate(JSON.parse(raw) as AppConfig & LegacyConfig)
  } catch {
    return null
  }
  if (!cfg) return null
  const stored = loadSecrets()
  if (stored && stored.provider === cfg.provider) {
    cfg.providerConfig = { ...cfg.providerConfig, ...stored.secrets }
  }
  return cfg
}

export function saveConfig(cfg: AppConfig, secretKeys: string[]): void {
  const persisted: ProviderConfig = { ...cfg.providerConfig }
  const secrets: Record<string, string> = {}
  for (const key of secretKeys) {
    const value = cfg.providerConfig[key]
    if (value) secrets[key] = value
    delete persisted[key]
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify({ ...cfg, providerConfig: persisted }))
  writeSecrets(cfg.provider, secrets)
}

export function clearConfig(): void {
  localStorage.removeItem(CONFIG_KEY)
  sessionStorage.removeItem(SECRETS_KEY)
}

/** Map id → date ISO de la dernière activité « vue » par l'utilisateur. */
export type SeenMap = Record<string, string>

/** Charge la map vu/pas-vu depuis le localStorage. À appeler UNE fois par cycle de filtrage. */
export function loadSeen(): SeenMap {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}') as SeenMap
  } catch {
    return {}
  }
}

function saveSeen(map: SeenMap): void {
  localStorage.setItem(SEEN_KEY, JSON.stringify(map))
}

/**
 * Prédicat pur : une PR est "à regarder" si jamais vue, ou si son activité est
 * plus récente que la dernière visite. Travaille sur une `SeenMap` déjà chargée
 * pour éviter de relire le localStorage à chaque PR.
 */
export function hasUpdateIn(seen: SeenMap, id: string, lastActivity: string): boolean {
  const last = seen[id]
  if (!last) return true
  return new Date(lastActivity).getTime() > new Date(last).getTime()
}

/** Variante autonome (recharge la map). Pratique hors cycle de filtrage groupé. */
export function hasUpdate(id: string, lastActivity: string): boolean {
  return hasUpdateIn(loadSeen(), id, lastActivity)
}

/** Marque la PR comme vue jusqu'à sa dernière activité connue. */
export function markSeen(id: string, lastActivity: string): void {
  const map = loadSeen()
  map[id] = lastActivity
  saveSeen(map)
}
