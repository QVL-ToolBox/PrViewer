import type { KeyboardEvent } from 'react'
import { Card, StatusChip } from '@custhome/ui'
import type { PrView } from '../types'
import { UPDATE_META } from '../updateKind'
import { initials, relativeTime } from '../format'

interface Props {
  pr: PrView
  onOpen: (pr: PrView) => void
}

export function PrCard({ pr, onOpen }: Props) {
  const meta = UPDATE_META[pr.updateKind]
  const subtitle = pr.source && pr.target ? `${pr.source} → ${pr.target}` : undefined

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(pr)
    }
  }

  return (
    <div
      className={`pr-card pr-card--${meta.tone}`}
      role="button"
      tabIndex={0}
      aria-label={`Ouvrir la PR ${pr.ref ?? pr.id}`}
      onClick={() => onOpen(pr)}
      onKeyDown={handleKeyDown}
    >
      <Card
        elevation="sm"
        title={`#${pr.ref ?? pr.id} · ${pr.title}`}
        subtitle={subtitle}
        actions={
          <div className="pr-row pr-row--tight">
            <StatusChip tone={meta.tone} label={meta.label} size="small" />
            {pr.isDraft && <StatusChip tone="neutral" label="draft" size="small" />}
          </div>
        }
      >
        <div className="pr-meta">
          <span className="pr-meta__item">{initials(pr.author)}</span>
          <span className="pr-meta__item">{pr.author}</span>
          <span className="pr-row__spacer" />
          <span className="pr-meta__item">maj {relativeTime(pr.lastActivity)}</span>
        </div>
      </Card>
    </div>
  )
}
