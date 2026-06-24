import { useMemo, useState } from 'react'
import { Button, Card, Form, Heading, Input, InputPassword, InputText, Stack } from '@custhome/ui'
import { CONFIG_VERSION, DEFAULT_REFRESH_MINUTES, saveConfig, type AppConfig } from '../storage'
import { DEFAULT_PROVIDER_ID, PROVIDERS, getProvider } from '../providers'
import type { FieldDef } from '../providers'

interface Props {
  initial: AppConfig | null
  onSave: (cfg: AppConfig) => void
  onCancel?: () => void
}

export function ConfigPanel({ initial, onSave, onCancel }: Props) {
  // Auto-réparation : si la config stockée porte un provider inconnu (ancien
  // format, valeur corrompue), on retombe sur le provider par défaut plutôt que
  // de rester coincé sur une valeur invalide avec un sélecteur désactivé.
  const [providerId, setProviderId] = useState(
    getProvider(initial?.provider) ? (initial as AppConfig).provider : DEFAULT_PROVIDER_ID,
  )
  const [values, setValues] = useState<Record<string, string>>(() => ({
    ...(initial?.providerConfig ?? {}),
  }))
  const [refreshMinutes, setRefreshMinutes] = useState(
    String(initial?.refreshMinutes ?? DEFAULT_REFRESH_MINUTES),
  )
  const [touched, setTouched] = useState(false)

  const provider = useMemo(() => getProvider(providerId), [providerId])

  const setField = (key: string, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  const switchProvider = (id: string) => {
    setProviderId(id)
    setValues(id === initial?.provider ? { ...initial.providerConfig } : {})
    setTouched(false)
  }

  // provider absent → message dédié ; sinon on retourne le verdict de validateConfig
  // (null = config valide). NE PAS écrire `validateConfig(values) ?? '…'` : un retour
  // `null` (valide) serait alors transformé à tort en message d'erreur.
  const error = useMemo(
    () => (provider ? provider.validateConfig(values) : 'Provider inconnu.'),
    [provider, values],
  )

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
    <div className="pr-config-screen">
      <div className="pr-config-card">
        <Card elevation="md">
          <Stack gap="lg">
            <Stack gap="xs">
              <Heading level={1} size={4} gutterBottom={false}>
                Connexion
              </Heading>
              <span>Tout reste stocké localement dans ce navigateur.</span>
            </Stack>

            <Form onSubmit={submit} submitLabel="Enregistrer" error={touched ? error : null}>
              <div className="pr-field">
                <label className="pr-field__label" htmlFor="provider">
                  Outil
                </label>
                {PROVIDERS.length === 1 ? (
                  <div id="provider" className="pr-native-select pr-native-select--readonly">
                    {provider?.name ?? providerId}
                  </div>
                ) : (
                  <select
                    id="provider"
                    className="pr-native-select"
                    value={providerId}
                    onChange={(e) => switchProvider(e.target.value)}
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {provider?.configFields.map((field: FieldDef) =>
                field.type === 'password' ? (
                  <InputPassword
                    key={field.key}
                    label={field.label}
                    value={values[field.key] ?? ''}
                    onChange={(value) => setField(field.key, value)}
                    placeholder={field.placeholder}
                    helperText={field.helperText}
                    required={field.required}
                    fullWidth
                  />
                ) : (
                  <InputText
                    key={field.key}
                    label={field.label}
                    value={values[field.key] ?? ''}
                    onChange={(value) => setField(field.key, value)}
                    placeholder={field.placeholder}
                    helperText={field.helperText}
                    required={field.required}
                    fullWidth
                  />
                ),
              )}

              <Input
                type="number"
                label="Rafraîchissement automatique (minutes)"
                value={refreshMinutes}
                onChange={setRefreshMinutes}
                helperText="Intervalle entre deux rafraîchissements automatiques. 0 pour désactiver."
                fullWidth
              />
            </Form>

            {onCancel && (
              <Button variant="secondary" onClick={onCancel}>
                Annuler
              </Button>
            )}
          </Stack>
        </Card>
      </div>
    </div>
  )
}
