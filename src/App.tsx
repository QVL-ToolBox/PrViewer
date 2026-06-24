import { useCallback, useMemo, useState } from 'react'
import {
  Button,
  Feedback,
  IconActionButton,
  PageScaffold,
  Spinner,
  Stack,
  ThemeToggle,
  type ChNavbarItem,
} from '@custhome/ui'
import { ConfigPanel } from './components/ConfigPanel'
import { PrList } from './components/PrList'
import { UpdateLegend } from './components/UpdateLegend'
import { getProvider } from './providers'
import { loadConfig, type AppConfig } from './storage'
import type { PrView, Role } from './types'
import { usePrViews } from './usePrViews'

const NAV_BASE: { label: string; icon: ChNavbarItem['icon']; href: Role }[] = [
  { label: 'Mes PR', icon: 'user', href: 'creator' },
  { label: 'À reviewer', icon: 'check', href: 'reviewer' },
]

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(() => loadConfig())
  const [editingConfig, setEditingConfig] = useState(false)
  const [role, setRole] = useState<Role>('creator')

  const provider = config ? getProvider(config.provider) : undefined
  const { visible, counts, refresh, refreshing, hasLoaded, error, warnings, markSeen } = usePrViews(
    config,
    role,
    !editingConfig,
  )

  const navItems = useMemo<ChNavbarItem[]>(
    () =>
      NAV_BASE.map((item) => ({
        ...item,
        label: `${item.label} (${counts[item.href]})`,
      })),
    [counts],
  )

  const handleOpen = useCallback(
    (pr: PrView) => {
      window.open(pr.webUrl, '_blank', 'noopener,noreferrer')
      markSeen(pr)
    },
    [markSeen],
  )

  const subtitle = useMemo(() => {
    if (!config || !provider) return ''
    const parts = provider.configFields
      .filter((f) => f.type !== 'password')
      .map((f) => config.providerConfig[f.key])
      .filter(Boolean)
    return [provider.name, ...parts].join(' · ')
  }, [config, provider])

  if (!config || editingConfig) {
    return (
      <ConfigPanel
        initial={config}
        onSave={(cfg) => {
          setConfig(cfg)
          setEditingConfig(false)
        }}
        onCancel={config ? () => setEditingConfig(false) : undefined}
      />
    )
  }

  return (
    <PageScaffold
      title="Pull requests"
      items={navItems}
      activeHref={role}
      onNavigate={(href) => setRole(href as Role)}
    >
      <Stack gap="lg">
        <div className="pr-row pr-row--spread">
          <span>{subtitle}</span>
          <div className="pr-row pr-row--tight">
            <ThemeToggle />
            <IconActionButton
              icon="settings"
              aria-label="Modifier la configuration"
              onClick={() => setEditingConfig(true)}
            />
            <Button onClick={refresh} loading={refreshing} disabled={refreshing}>
              Rafraîchir
            </Button>
          </div>
        </div>

        {hasLoaded && <UpdateLegend />}

        {warnings.length > 0 && <Feedback severity="warning">{warnings.join(' ')}</Feedback>}

        {error && (
          <Stack gap="sm">
            <Feedback severity="error" error={error} />
            <Button variant="secondary" onClick={refresh} disabled={refreshing}>
              Réessayer
            </Button>
          </Stack>
        )}

        {refreshing && !hasLoaded ? (
          <Spinner fullPage label="Récupération des PR et de leur activité…" />
        ) : (
          hasLoaded && <PrList prs={visible} onOpen={handleOpen} role={role} />
        )}
      </Stack>
    </PageScaffold>
  )
}
