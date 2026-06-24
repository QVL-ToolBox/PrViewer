import type { UpdateKind } from './types'

/** Couleur sémantique MUI utilisée pour chaque catégorie d'activité. */
type MuiColor = 'warning' | 'error' | 'info' | 'success'

export interface UpdateMeta {
  label: string
  color: MuiColor
}

export const UPDATE_META: Record<UpdateKind, UpdateMeta> = {
  comment: { label: 'Commentaire', color: 'warning' },
  rejected: { label: 'Rejet / Waiting', color: 'error' },
  commits: { label: 'Nouveaux commits', color: 'info' },
  new: { label: 'Nouvelle PR', color: 'success' },
  updated: { label: 'Mise à jour', color: 'info' },
}

/** Ordre d'affichage stable pour la légende. */
export const UPDATE_ORDER: UpdateKind[] = ['comment', 'rejected', 'commits', 'new', 'updated']
