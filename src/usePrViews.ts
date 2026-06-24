// Logique de récupération + filtrage des PR, extraite d'App.tsx.
// App ne fait plus que de l'orchestration JSX ; toute la mécanique (fetch,
// auto-refresh, anti-overlap, filtrage vu/pas-vu, compteurs) vit ici.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getProvider } from './providers'
import {
  DEFAULT_REFRESH_MINUTES,
  hasUpdateIn,
  loadSeen,
  markSeen as persistSeen,
  type AppConfig,
} from './storage'
import type { PrView, Role } from './types'

interface Counts {
  creator: number
  reviewer: number
}

interface UsePrViews {
  visible: PrView[]
  counts: Counts
  refresh: () => void
  refreshing: boolean
  hasLoaded: boolean
  error: string
  warnings: string[]
  markSeen: (pr: PrView) => void
}

const EMPTY_PRS: Record<Role, PrView[]> = { creator: [], reviewer: [] }

export function usePrViews(config: AppConfig | null, role: Role, active: boolean): UsePrViews {
  const [refreshing, setRefreshing] = useState(false)
  const [hasLoaded, setHasLoaded] = useState(false)
  const [error, setError] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [prs, setPrs] = useState<Record<Role, PrView[]>>(EMPTY_PRS)
  // Incrémenté à chaque « vu » pour recalculer le filtrage sans refetch.
  const [seenTick, setSeenTick] = useState(0)
  // Évite que deux rafraîchissements (manuel + automatique) se chevauchent.
  const refreshingRef = useRef(false)

  const runRefresh = useCallback(async (cfg: AppConfig) => {
    if (refreshingRef.current) return
    const provider = getProvider(cfg.provider)
    if (!provider) {
      setError(`Provider « ${cfg.provider} » introuvable. Vérifie la configuration.`)
      return
    }
    refreshingRef.current = true
    setRefreshing(true)
    setError('')
    try {
      const result = await provider.fetchPullRequests(cfg.providerConfig)
      setPrs({ creator: result.creator, reviewer: result.reviewer })
      setWarnings(result.warnings ?? [])
      setHasLoaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      refreshingRef.current = false
      setRefreshing(false)
    }
  }, [])

  const refresh = useCallback(() => {
    if (config) void runRefresh(config)
  }, [config, runRefresh])

  // Premier chargement + rechargement quand la config change.
  useEffect(() => {
    if (config && active) void runRefresh(config)
  }, [config, active, runRefresh])

  // Rafraîchissement automatique à intervalle configurable (0 = désactivé).
  useEffect(() => {
    if (!config || !active) return
    const minutes = config.refreshMinutes ?? DEFAULT_REFRESH_MINUTES
    if (minutes <= 0) return
    const id = window.setInterval(() => void runRefresh(config), minutes * 60_000)
    return () => window.clearInterval(id)
  }, [config, active, runRefresh])

  const markSeen = useCallback((pr: PrView) => {
    persistSeen(pr.id, pr.lastActivity)
    setSeenTick((t) => t + 1)
  }, [])

  // La SeenMap est chargée UNE fois par cycle, puis réutilisée pour le filtrage
  // et les deux compteurs : plus de relecture du localStorage par PR.
  const { visible, counts } = useMemo(() => {
    const seen = loadSeen()
    const isVisible = (pr: PrView) => hasUpdateIn(seen, pr.id, pr.lastActivity)
    return {
      visible: prs[role].filter(isVisible),
      counts: {
        creator: prs.creator.filter(isVisible).length,
        reviewer: prs.reviewer.filter(isVisible).length,
      },
    }
  }, [prs, role, seenTick])

  return { visible, counts, refresh, refreshing, hasLoaded, error, warnings, markSeen }
}
