import { useCallback, useMemo, useState } from 'react'
import {
  Alert,
  AppBar,
  Badge,
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  Stack,
  Tab,
  Tabs,
  Toolbar,
  Typography,
} from '@mui/material'
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded'
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded'
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded'
import { ConfigPanel } from './components/ConfigPanel'
import { PrList } from './components/PrList'
import { getProvider } from './providers'
import { loadConfig, type AppConfig } from './storage'
import type { PrView, Role } from './types'
import { UPDATE_META, UPDATE_ORDER } from './updateKind'
import { usePrViews } from './usePrViews'

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

  const handleOpen = useCallback(
    (pr: PrView) => {
      window.open(pr.webUrl, '_blank', 'noopener,noreferrer')
      markSeen(pr)
    },
    [markSeen],
  )

  // Sous-titre : nom de l'outil + valeurs de config non sensibles.
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
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="sticky">
        <Container maxWidth="md">
          <Toolbar disableGutters sx={{ gap: 2, py: 1.5 }}>
            <AccountTreeRoundedIcon color="primary" sx={{ fontSize: 38 }} />
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <Typography variant="h5" noWrap>
                Mes pull requests
              </Typography>
              <Typography variant="body2" color="text.secondary" noWrap>
                {subtitle}
              </Typography>
            </Box>
            <Button
              variant="contained"
              size="large"
              startIcon={
                refreshing ? <CircularProgress size={18} color="inherit" /> : <RefreshRoundedIcon />
              }
              onClick={refresh}
              disabled={refreshing}
            >
              Rafraîchir
            </Button>
            <Button
              variant="outlined"
              size="large"
              startIcon={<SettingsRoundedIcon />}
              onClick={() => setEditingConfig(true)}
            >
              Config
            </Button>
          </Toolbar>
        </Container>
      </AppBar>

      <Container maxWidth="md" sx={{ pb: 8 }}>
        <Tabs
          value={role}
          onChange={(_, v: Role) => setRole(v)}
          sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}
        >
          <Tab
            value="creator"
            sx={{ fontSize: '1rem', py: 2 }}
            label={
              <Badge color="primary" badgeContent={counts.creator} showZero sx={{ pr: 1.5 }}>
                Mes PR
              </Badge>
            }
          />
          <Tab
            value="reviewer"
            sx={{ fontSize: '1rem', py: 2 }}
            label={
              <Badge color="primary" badgeContent={counts.reviewer} showZero sx={{ pr: 1.5 }}>
                À reviewer
              </Badge>
            }
          />
        </Tabs>

        {hasLoaded && (
          <Stack
            direction="row"
            spacing={1}
            flexWrap="wrap"
            useFlexGap
            alignItems="center"
            sx={{ mb: 3 }}
          >
            <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
              Légende :
            </Typography>
            {UPDATE_ORDER.map((kind) => (
              <Chip
                key={kind}
                size="small"
                variant="outlined"
                color={UPDATE_META[kind].color}
                label={UPDATE_META[kind].label}
              />
            ))}
          </Stack>
        )}

        {warnings.length > 0 && (
          <Alert severity="warning" sx={{ mb: 3 }}>
            {warnings.join(' ')}
          </Alert>
        )}

        {error && (
          <Alert
            severity="error"
            sx={{ mb: 3 }}
            action={
              <Button color="inherit" size="small" onClick={refresh} disabled={refreshing}>
                Réessayer
              </Button>
            }
          >
            {error}
          </Alert>
        )}

        {refreshing && !hasLoaded ? (
          <Stack alignItems="center" spacing={2} sx={{ py: 8 }}>
            <CircularProgress />
            <Typography color="text.secondary">Récupération des PR et de leur activité…</Typography>
          </Stack>
        ) : (
          hasLoaded && <PrList prs={visible} onOpen={handleOpen} role={role} />
        )}
      </Container>
    </Box>
  )
}
