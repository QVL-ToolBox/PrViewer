import { defineConfig, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

// GUID de ressource Azure DevOps — identique à ce qu'utilise l'agent chabe-dev-ops
// (az account get-access-token --resource 499b84ac-...).
const ADO_RESOURCE = '499b84ac-1321-427f-aa17-267ca6975798'

let cachedToken = ''
let tokenExpiry = 0
let refreshing: Promise<void> | null = null

async function refreshToken(): Promise<void> {
  try {
    const { stdout } = await execAsync(
      `az account get-access-token --resource ${ADO_RESOURCE} --query accessToken -o tsv`,
      { windowsHide: true },
    )
    const token = stdout.trim()
    if (token) {
      cachedToken = token
      // az renvoie un jeton valide ~1 h : on le rafraîchit avec une marge.
      tokenExpiry = Date.now() + 45 * 60 * 1000
      console.log('[ado-proxy] Jeton Azure AD rafraîchi.')
    }
  } catch (e) {
    console.warn(
      '[ado-proxy] Impossible de récupérer un jeton via "az account get-access-token". ' +
        'Es-tu connecté avec "az login" ? Détail :',
      e instanceof Error ? e.message : e,
    )
  }
}

// Rafraîchit le jeton si expiré et ATTEND la fin du rafraîchissement.
// C'est la correction de la cause racine du bug "page HTML de login" : avant,
// le refresh était fire-and-forget, donc la 1ʳᵉ requête après expiration partait
// avec un jeton périmé. Désormais on bloque jusqu'à obtenir un jeton frais, en
// dédupliquant les rafraîchissements concurrents via la promesse partagée.
async function ensureFreshToken(): Promise<void> {
  if (Date.now() < tokenExpiry) return
  if (!refreshing) {
    refreshing = refreshToken().finally(() => {
      refreshing = null
    })
  }
  await refreshing
}

// L'API Azure DevOps n'autorise pas les appels cross-origin depuis le navigateur (CORS).
// On proxifie via Vite, et on injecte le jeton Azure AD (az login) côté serveur :
//   - /ado/...   -> https://dev.azure.com/...
// Si le navigateur fournit déjà un en-tête Authorization (mode PAT), on ne le touche pas.
const adoProxy: ProxyOptions = {
  target: 'https://dev.azure.com',
  changeOrigin: true,
  secure: true,
  rewrite: (path) => path.replace(/^\/ado/, ''),
  configure: (proxy) => {
    proxy.on('proxyReq', (proxyReq) => {
      // Le jeton est déjà garanti frais par le middleware ci-dessous (await).
      // Si l'app n'envoie pas déjà son propre Authorization (PAT), on injecte le Bearer az.
      if (!proxyReq.getHeader('authorization') && cachedToken) {
        proxyReq.setHeader('authorization', `Bearer ${cachedToken}`)
      }
    })
  },
}

// Middleware exécuté AVANT le proxy (ajouté hors du callback retourné par
// configureServer) : il garantit un jeton frais avant chaque requête proxifiée
// et restreint la surface du proxy aux seules routes REST `_apis/` d'Azure DevOps.
function adoTokenPlugin(): Plugin {
  return {
    name: 'ado-token-proxy',
    configureServer(server) {
      server.middlewares.use('/ado', async (req, res, next) => {
        // Surface restreinte : on ne relaie que les appels à l'API REST ADO.
        if (req.url && !req.url.includes('/_apis/')) {
          res.statusCode = 404
          res.end('Not found')
          return
        }
        await ensureFreshToken()
        next()
      })
    },
  }
}

export default defineConfig(async () => {
  await refreshToken() // pré-chauffe le jeton au démarrage du serveur de dev

  return {
    plugins: [react(), adoTokenPlugin()],
    server: {
      port: 5180,
      proxy: { '/ado': adoProxy },
    },
  }
})
