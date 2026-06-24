import { StatusChip } from '@custhome/ui'
import { UPDATE_META, UPDATE_ORDER } from '../updateKind'

export function UpdateLegend() {
  return (
    <div className="pr-row" role="list" aria-label="Légende des mises à jour">
      {UPDATE_ORDER.map((kind) => (
        <StatusChip
          key={kind}
          tone={UPDATE_META[kind].tone}
          label={UPDATE_META[kind].label}
          size="small"
        />
      ))}
    </div>
  )
}
