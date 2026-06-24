import type { UpdateKind } from './types'

export type ChStatusTone = 'success' | 'warning' | 'error' | 'info' | 'neutral'

export interface UpdateMeta {
  label: string
  tone: ChStatusTone
}

export const UPDATE_META: Record<UpdateKind, UpdateMeta> = {
  comment: { label: 'Commentaire', tone: 'warning' },
  rejected: { label: 'Rejet / Waiting', tone: 'error' },
  commits: { label: 'Nouveaux commits', tone: 'info' },
  new: { label: 'Nouvelle PR', tone: 'success' },
  updated: { label: 'Mise à jour', tone: 'info' },
}

export const UPDATE_ORDER: UpdateKind[] = ['comment', 'rejected', 'commits', 'new', 'updated']
