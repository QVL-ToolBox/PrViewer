import { Avatar, Box, Card, CardActionArea, Chip, Stack, Typography } from '@mui/material'
import AccessTimeRoundedIcon from '@mui/icons-material/AccessTimeRounded'
import CallSplitRoundedIcon from '@mui/icons-material/CallSplitRounded'
import OpenInNewRoundedIcon from '@mui/icons-material/OpenInNewRounded'
import type { PrView } from '../types'
import { UPDATE_META } from '../updateKind'

interface Props {
  pr: PrView
  onOpen: (pr: PrView) => void
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.round(h / 24)
  return `il y a ${d} j`
}

function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

export function PrCard({ pr, onOpen }: Props) {
  const meta = UPDATE_META[pr.updateKind]
  return (
    <Card
      sx={{
        borderLeft: '5px solid',
        borderLeftColor: `${meta.color}.main`,
        transition: 'box-shadow .15s',
        '&:hover': { boxShadow: 4 },
      }}
    >
      <CardActionArea onClick={() => onOpen(pr)} sx={{ p: 2.5 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="flex-start" spacing={1.5}>
            <Chip label={pr.ref ?? pr.id} color="primary" variant="outlined" size="small" sx={{ fontWeight: 700 }} />
            <Typography variant="h6" sx={{ flexGrow: 1, fontSize: '1.15rem', lineHeight: 1.35 }}>
              {pr.title}
            </Typography>
            <Chip label={meta.label} color={meta.color} size="small" sx={{ fontWeight: 600 }} />
            {pr.isDraft && <Chip label="draft" size="small" variant="outlined" />}
            <OpenInNewRoundedIcon fontSize="small" color="action" />
          </Stack>

          <Stack
            direction="row"
            alignItems="center"
            flexWrap="wrap"
            useFlexGap
            spacing={2}
            sx={{ color: 'text.secondary' }}
          >
            {pr.source && pr.target && (
              <Stack direction="row" alignItems="center" spacing={0.5}>
                <CallSplitRoundedIcon fontSize="small" />
                <Typography variant="body2" sx={{ fontFamily: 'Consolas, ui-monospace, monospace' }}>
                  {pr.source} → {pr.target}
                </Typography>
              </Stack>
            )}

            <Stack direction="row" alignItems="center" spacing={0.75}>
              <Avatar sx={{ width: 22, height: 22, fontSize: 11, bgcolor: 'primary.light' }}>
                {initials(pr.author)}
              </Avatar>
              <Typography variant="body2">{pr.author}</Typography>
            </Stack>

            <Box sx={{ flexGrow: 1 }} />

            <Stack direction="row" alignItems="center" spacing={0.5} sx={{ color: 'primary.main' }}>
              <AccessTimeRoundedIcon fontSize="small" />
              <Typography variant="body2" fontWeight={600}>
                maj {relativeTime(pr.lastActivity)}
              </Typography>
            </Stack>
          </Stack>
        </Stack>
      </CardActionArea>
    </Card>
  )
}
