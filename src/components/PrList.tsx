import { useMemo } from 'react'
import { Feedback, Heading, Icon, Stack, StatusChip } from '@custhome/ui'
import type { PrView, Role } from '../types'
import { PrCard } from './PrCard'

interface Props {
  prs: PrView[]
  role: Role
  onOpen: (pr: PrView) => void
}

export function PrList({ prs, role, onOpen }: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, PrView[]>()
    for (const pr of prs) {
      const key = pr.group
      const arr = map.get(key) ?? []
      arr.push(pr)
      map.set(key, arr)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [prs])

  if (prs.length === 0) {
    return (
      <div className="pr-empty">
        <Icon name="check" variant="solid" size={56} />
        <Feedback severity="success">
          {role === 'creator'
            ? 'Aucune de tes PR n’a eu de mise à jour depuis ta dernière visite.'
            : 'Aucune PR à reviewer n’a eu de mise à jour depuis ta dernière visite.'}
        </Feedback>
      </div>
    )
  }

  return (
    <Stack gap="xl">
      {groups.map(([repo, items]) => (
        <Stack key={repo} gap="sm" as="section" label={repo}>
          <div className="pr-group-header">
            <Icon name="apps" size={22} />
            <Heading level={2} size={5} gutterBottom={false}>
              {repo}
            </Heading>
            <StatusChip tone="neutral" label={String(items.length)} size="small" />
          </div>
          <Stack gap="sm">
            {items.map((pr) => (
              <PrCard key={pr.id} pr={pr} onOpen={onOpen} />
            ))}
          </Stack>
        </Stack>
      ))}
    </Stack>
  )
}
