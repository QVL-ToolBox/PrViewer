import { useMemo, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import AccountTreeRoundedIcon from '@mui/icons-material/AccountTreeRounded'
import { CONFIG_VERSION, DEFAULT_REFRESH_MINUTES, saveConfig, type AppConfig } from '../storage'
import { DEFAULT_PROVIDER_ID, PROVIDERS, getProvider } from '../providers'

interface Props {
  initial: AppConfig | null
  onSave: (cfg: AppConfig) => void
  onCancel?: () => void
}

export function ConfigPanel({ initial, onSave, onCancel }: Props) {
  const [providerId, setProviderId] = useState(initial?.provider ?? DEFAULT_PROVIDER_ID)
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...(initial?.providerConfig ?? {}) }))
  const [refreshMinutes, setRefreshMinutes] = useState(
    String(initial?.refreshMinutes ?? DEFAULT_REFRESH_MINUTES),
  )
  const [touched, setTouched] = useState(false)

  const provider = useMemo(() => getProvider(providerId), [providerId])

  const setField = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const switchProvider = (id: string) => {
    setProviderId(id)
    // Repart d'une config vierge, sauf si on revient sur le provider initial.
    setValues(id === initial?.provider ? { ...initial.providerConfig } : {})
    setTouched(false)
  }

  const error = useMemo(() => provider?.validateConfig(values) ?? 'Provider inconnu.', [provider, values])

  const submit = () => {
    setTouched(true)
    if (error || !provider) return
    const parsed = Number(refreshMinutes)
    const minutes = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_REFRESH_MINUTES
    const cfg: AppConfig = {
      version: CONFIG_VERSION,
      provider: provider.id,
      providerConfig: values,
      refreshMinutes: minutes,
    }
    const secretKeys = provider.configFields
      .filter((f) => f.type === 'password')
      .map((f) => f.key)
    saveConfig(cfg, secretKeys)
    onSave(cfg)
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        bgcolor: 'background.default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        p: 2,
      }}
    >
      <Card sx={{ width: '100%', maxWidth: 480 }}>
        <CardContent sx={{ p: 4 }}>
          <Stack
            component="form"
            spacing={3}
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <AccountTreeRoundedIcon color="primary" sx={{ fontSize: 40 }} />
              <Box>
                <Typography variant="h5">Connexion</Typography>
                <Typography variant="body2" color="text.secondary">
                  Tout reste stocké localement dans ce navigateur.
                </Typography>
              </Box>
            </Stack>

            <TextField
              select
              label="Outil"
              value={providerId}
              onChange={(e) => switchProvider(e.target.value)}
              fullWidth
            >
              {PROVIDERS.map((p) => (
                <MenuItem key={p.id} value={p.id}>
                  {p.name}
                </MenuItem>
              ))}
            </TextField>

            {provider?.configFields.map((field) => (
              <TextField
                key={field.key}
                label={field.label}
                type={field.type === 'password' ? 'password' : 'text'}
                value={values[field.key] ?? ''}
                onChange={(e) => setField(field.key, e.target.value)}
                placeholder={field.placeholder}
                helperText={field.helperText ?? ' '}
                fullWidth
              />
            ))}

            <TextField
              label="Rafraîchissement automatique (minutes)"
              type="number"
              value={refreshMinutes}
              onChange={(e) => setRefreshMinutes(e.target.value)}
              inputProps={{ min: 0, step: 1 }}
              helperText="Intervalle entre deux rafraîchissements automatiques. 0 pour désactiver."
              fullWidth
            />

            {touched && error && <Alert severity="error">{error}</Alert>}

            <Stack direction="row" justifyContent="flex-end" spacing={1.5}>
              {onCancel && (
                <Button variant="text" size="large" onClick={onCancel}>
                  Annuler
                </Button>
              )}
              <Button type="submit" variant="contained" size="large">
                Enregistrer
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  )
}
