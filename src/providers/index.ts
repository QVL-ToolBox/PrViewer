// Registre des providers. Pour brancher un nouvel outil : créer src/providers/<outil>.ts
// implémentant PrProvider, puis l'ajouter au tableau ci-dessous. Voir PROVIDERS.md.

import type { PrProvider } from './types'
import { adoProvider } from './ado'

export const PROVIDERS: PrProvider[] = [adoProvider]

export const DEFAULT_PROVIDER_ID = adoProvider.id

export function getProvider(id: string | undefined): PrProvider | undefined {
  return PROVIDERS.find((p) => p.id === id)
}

export type { PrProvider, ProviderConfig, FieldDef } from './types'
