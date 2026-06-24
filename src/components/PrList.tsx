import { useMemo } from 'react'
import { Box, Chip, Stack, Typography } from '@mui/material'
import FolderRoundedIcon from '@mui/icons-material/FolderRounded'
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded'
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
      <Stack alignItems="center" spacing={2} sx={{ py: 10, color: 'text.secondary' }}>
        <CheckCircleRoundedIcon sx={{ fontSize: 56, color: 'success.main' }} />
        <Typography variant="h6" align="center" color="text.secondary">
          {role === 'creator'
            ? 'Aucune de tes PR n’a eu de mise à jour depuis ta dernière visite.'
            : 'Aucune PR à reviewer n’a eu de mise à jour depuis ta dernière visite.'}
        </Typography>
      </Stack>
    )
  }

  return (
    <Stack spacing={4}>
      {groups.map(([repo, items]) => (
        <Box key={repo}>
          <Stack direction="row" alignItems="center" spacing={1.25} sx={{ mb: 1.5 }}>
            <FolderRoundedIcon color="primary" />
            <Typography variant="h6">{repo}</Typography>
            <Chip label={items.length} size="small" />
          </Stack>
          <Stack spacing={1.5}>
            {items.map((pr) => (
              <PrCard key={pr.id} pr={pr} onOpen={onOpen} />
            ))}
          </Stack>
        </Box>
      ))}
    </Stack>
  )
}
