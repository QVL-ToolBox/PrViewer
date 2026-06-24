# PR Viewer — visualiseur de Pull Requests multi-outils

Petite web app **React + TypeScript** qui rassemble **tes** Pull Requests sur un seul écran
et ne fait remonter que celles qui ont **bougé depuis ta dernière visite** (commentaire,
rejet, nouveaux commits…).

Elle est **agnostique de l'outil** : Azure DevOps est livré comme provider de référence,
mais l'app est bâtie en **ports & adapters** pour qu'on puisse brancher Jira, GitHub,
GitLab… en écrivant un seul fichier, **sans toucher à l'UI**.

> 👉 Tu veux juste ajouter ton outil ? Saute à **[Brancher un nouveau provider](#-brancher-un-nouveau-provider)**.

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Démarrage rapide](#démarrage-rapide)
- [Configuration](#configuration)
- [Architecture (ports & adapters)](#architecture-ports--adapters)
- [🔌 Brancher un nouveau provider](#-brancher-un-nouveau-provider)
  - [Étape 1 — écrire l'adapter](#étape-1--écrire-ladapter)
  - [Étape 2 — l'enregistrer](#étape-2--lenregistrer)
  - [Étape 3 — le proxy CORS (si besoin)](#étape-3--le-proxy-cors-si-besoin)
  - [Le modèle neutre `PrView`](#le-modèle-neutre-prview)
  - [L'invariant `lastActivity` (à lire absolument)](#linvariant-lastactivity-à-lire-absolument)
  - [`updateKind` — la couleur de la carte](#updatekind--la-couleur-de-la-carte)
  - [Exemple complet : un provider GitHub](#exemple-complet--un-provider-github)
- [Stockage & sécurité](#stockage--sécurité)
- [Scripts npm](#scripts-npm)
- [Structure du projet](#structure-du-projet)
- [Publier / contribuer (QVL-ToolBox)](#publier--contribuer-qvl-toolbox)

---

## Fonctionnalités

- **Onglet « Mes PR »** : les PR dont tu es l'auteur, groupées par dépôt/projet.
- **Onglet « À reviewer »** : les PR où tu es reviewer.
- **Suivi vu / pas-vu** : une PR n'apparaît que si elle a une activité **plus récente que ta
  dernière visite**. Cliquer dessus l'ouvre dans l'outil d'origine **et** la marque comme vue ;
  elle ne réapparaîtra qu'à la prochaine activité pertinente.
- **Légende colorée** : chaque carte est colorée selon le **type** de la dernière activité
  (commentaire, rejet, nouveaux commits…).
- **Rafraîchissement automatique** configurable (défaut : 2 min ; le premier a lieu au chargement).
- **Échecs partiels non bloquants** : si une source (un projet) est inaccessible, les autres
  s'affichent quand même, accompagnées d'un avertissement.
- Configuration stockée **localement** dans le navigateur (secrets en `sessionStorage`).

---

## Démarrage rapide

**Prérequis :** Node.js 18+.

```bash
npm install
npm run dev
```

Ouvre http://localhost:5180 et renseigne la configuration de ton outil dans le panneau.

Pour Azure DevOps (provider par défaut) :
- **Organisation** : `mon-org` (ou colle l'URL `https://dev.azure.com/mon-org`)
- **Projet(s)** : un ou plusieurs noms séparés par des virgules
- **PAT** *(optionnel)* : laisse vide pour t'authentifier via ton `az login` (recommandé), sinon
  un Personal Access Token avec le scope **Code (Read)**.

> ⚠️ L'API de la plupart des outils n'autorise pas les appels directs depuis le navigateur (CORS).
> L'app passe par le **proxy intégré de Vite** — elle fonctionne donc via `npm run dev`.
> Un build statique servi seul (`npm run build`) aurait besoin d'un proxy équivalent côté serveur.

---

## Configuration

La config est **pilotée par le provider** : c'est lui qui déclare ses champs
(`configFields`), l'UI les affiche automatiquement. Trois réglages sont transverses :

| Réglage | Détail |
|---|---|
| **Outil** | Sélecteur de provider (rempli depuis le registre). |
| **Champs du provider** | Rendus dynamiquement d'après `configFields` (texte, mot de passe, liste). |
| **Rafraîchissement (min)** | Intervalle de l'auto-refresh. `0` = désactivé. |

---

## Architecture (ports & adapters)

L'app ne connaît qu'**un contrat** (le *port* `PrProvider`) et **un modèle de PR neutre**
(`PrView`). Tout le spécifique à un outil vit dans un *adapter*. La dépendance pointe toujours
vers le centre (le domaine), jamais l'inverse.

```
          ┌──────────────────────────────────────────────┐
          │                     UI                        │
          │  App · ConfigPanel · PrList · PrCard          │
          │  (ne connaît QUE PrView + PrProvider)         │
          └───────────────┬───────────────▲──────────────┘
                          │ getProvider()  │ FetchResult { PrView[] }
          ┌───────────────▼───────────────┴──────────────┐
          │            PORT : PrProvider                  │   src/providers/types.ts
          │   id · name · configFields                    │
          │   validateConfig() · fetchPullRequests()      │
          └───────────────▲───────────────▲──────────────┘
                          │               │  (implements)
              ┌───────────┴───┐   ┌───────┴───────────┐
              │  adapter ADO  │   │  adapter Jira…    │   src/providers/<outil>.ts
              │  providers/   │   │  (à écrire)       │
              │  ado.ts       │   └───────────────────┘
              └───────────────┘
```

- **Domaine neutre** : `src/types.ts` (`PrView`, `UpdateKind`, `Role`) — zéro trace d'un outil.
- **Port** : `src/providers/types.ts` (`PrProvider`, `FieldDef`, `FetchResult`).
- **Adapters** : `src/providers/<outil>.ts`.
- **Registre** : `src/providers/index.ts` (`PROVIDERS[]`, `getProvider()`).

---

## 🔌 Brancher un nouveau provider

Brancher un outil = **écrire un fichier** qui implémente le port `PrProvider`, puis
**l'ajouter au registre**. **Aucune modification de l'UI** n'est nécessaire : le sélecteur,
les champs de config et le rendu des cartes s'adaptent tout seuls.

### Étape 1 — écrire l'adapter

Crée `src/providers/<outil>.ts` et exporte un objet `PrProvider` :

```ts
import type { PrProvider } from './types'

export const jiraProvider: PrProvider = {
  id: 'jira',          // identifiant technique stable (stocké dans la config)
  name: 'Jira',        // nom affiché dans le sélecteur « Outil »

  // Champs de config affichés automatiquement par le panneau.
  configFields: [
    { key: 'baseUrl', label: 'URL Jira', type: 'text', required: true,
      placeholder: 'https://mon-org.atlassian.net' },
    { key: 'project', label: 'Projet', type: 'text', required: true },
    { key: 'token', label: 'API token', type: 'password' }, // 'password' ⇒ sessionStorage
  ],

  // Validation synchrone. null = OK, sinon un message d'erreur affiché à l'utilisateur.
  validateConfig(config) {
    if (!config.baseUrl) return "Renseigne l'URL Jira."
    if (!config.project) return 'Renseigne le projet.'
    return null
  },

  // Le cœur : appeler l'API de l'outil et traduire en PrView neutres.
  async fetchPullRequests(config) {
    // … appels HTTP … mapping vers PrView …
    return { creator: [], reviewer: [], warnings: [] }
  },
}
```

### Étape 2 — l'enregistrer

Ajoute-le au tableau du registre, `src/providers/index.ts` :

```ts
import { jiraProvider } from './jira'

export const PROVIDERS: PrProvider[] = [adoProvider, jiraProvider]
```

Il apparaît aussitôt dans le sélecteur « Outil ». **C'est tout.**

### Étape 3 — le proxy CORS (si besoin)

La plupart des API refusent les appels cross-origin depuis le navigateur. On les relaie via le
proxy de Vite. Ajoute une entrée dans `vite.config.ts`, sur le modèle de `/ado` :

```ts
server: {
  proxy: {
    '/ado': adoProxy,
    '/jira': {
      target: 'https://mon-org.atlassian.net',
      changeOrigin: true,
      secure: true,
      rewrite: (path) => path.replace(/^\/jira/, ''),
    },
  },
}
```

Puis, côté adapter, **préfixe tes URLs d'appel** avec `/jira/…` au lieu de l'URL absolue.
Si ton outil a besoin d'un secret injecté côté serveur (comme le Bearer Azure AD pour ADO),
inspire-toi du plugin `adoTokenPlugin` de `vite.config.ts`.

### Le modèle neutre `PrView`

C'est le **seul** type que l'UI comprend. Ton adapter traduit les objets de ton outil vers lui.

| Champ | Obligatoire | Rôle |
|---|:---:|---|
| `id` | ✅ | Identifiant **stable** (clé de liste + clé du suivi vu/pas-vu). |
| `title` | ✅ | Titre affiché. |
| `author` | ✅ | Nom affiché de l'auteur. |
| `group` | ✅ | Clé de regroupement dans la liste (dépôt, projet…). |
| `webUrl` | ✅ | URL d'ouverture dans l'outil d'origine. |
| `lastActivity` | ✅ | Date ISO de la **dernière activité pertinente** — voir l'invariant ci-dessous. |
| `updateKind` | ✅ | Catégorie d'activité → couleur de la carte. |
| `ref` | ⬜ | Référence courte affichée (ex. `!123`, `PROJ-45`). Défaut : `id`. |
| `source` / `target` | ⬜ | Branche source → cible (outils git). |
| `isDraft` | ⬜ | Affiche un badge « draft ». |

`fetchPullRequests` renvoie un **`FetchResult`** :

```ts
interface FetchResult {
  creator: PrView[]    // PR dont l'utilisateur est l'auteur
  reviewer: PrView[]   // PR où il est reviewer
  warnings?: string[]  // échecs partiels non bloquants (ex. "Projet X inaccessible")
}
```

> Un outil sans distinction auteur/reviewer peut renvoyer la même liste dans les deux, ou une
> liste vide pour le rôle non pertinent.

### L'invariant `lastActivity` (à lire absolument)

C'est **le** point qui fait ou casse l'expérience. Tout le suivi vu/pas-vu repose dessus :
une PR est « à regarder » tant que `lastActivity` est plus récent que la date à laquelle on l'a
marquée vue. Ton adapter **doit** donc :

1. **Porter la date de la dernière activité _pertinente_** — pas la date de création par défaut
   dès qu'une activité existe.
2. **Filtrer le bruit** : tes propres actions, les votes positifs (approve), les ajouts de
   reviewers, les mises à jour de build/statut… ne doivent **pas** faire clignoter la PR.
3. **Garantir la monotonie croissante par `id`** : pour une même PR, `lastActivity` ne doit
   jamais régresser d'un fetch à l'autre, sinon une PR déjà vue resurgirait à tort.

> 💡 Concrètement : récupère les événements de la PR, **jette** ceux qui ne te concernent pas,
> garde le plus récent des restants, et c'est sa date qui devient `lastActivity` (avec
> l'`updateKind` correspondant). Si rien ne reste → `updateKind: 'new'` + date de création.
> `src/providers/ado.ts` (fonction `analyzeActivity`) est l'implémentation de référence.

### `updateKind` — la couleur de la carte

Classe la dernière activité pertinente dans l'une de ces catégories (déclarées dans
`src/types.ts`, couleurs dans `src/updateKind.ts`) :

| `updateKind` | Sens | Couleur |
|---|---|---|
| `comment`  | commentaire d'une autre personne        | ambre (`warning`) |
| `rejected` | rejet / changement demandé              | rouge (`error`)   |
| `commits`  | nouveau code poussé par quelqu'un d'autre | bleu (`info`)   |
| `new`      | jamais consulté, sans activité          | vert (`success`)  |
| `updated`  | mise à jour générique (outils non-git)  | bleu (`info`)     |

> `updated` existe pour les outils où `commits` n'a pas de sens (un ticket Jira, p. ex.).
> Pour ajouter une catégorie : étends `UpdateKind` dans `src/types.ts`, puis `UPDATE_META` et
> `UPDATE_ORDER` dans `src/updateKind.ts`.

### Exemple complet : un provider GitHub

Un adapter minimal mais **complet**, qui respecte l'invariant `lastActivity` et remonte les
échecs partiels. À adapter à ton outil.

```ts
// src/providers/github.ts
import type { PrView, Role } from '../types'
import type { FetchResult, PrProvider } from './types'

interface GhPull {
  number: number
  title: string
  html_url: string
  user: { login: string } | null
  base: { repo: { full_name: string }; ref: string }
  head: { ref: string }
  draft: boolean
  created_at: string
  updated_at: string
}

// Passe par le proxy Vite (cf. étape 3) pour contourner le CORS.
async function ghGet<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`/github${path}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`GitHub ${res.status} sur ${path}`)
  return res.json() as Promise<T>
}

function toView(pr: GhPull): PrView {
  return {
    id: String(pr.number),
    ref: `#${pr.number}`,
    title: pr.title,
    author: pr.user?.login ?? 'Inconnu',
    group: pr.base.repo.full_name,
    source: pr.head.ref,
    target: pr.base.ref,
    isDraft: pr.draft,
    webUrl: pr.html_url,
    // ⚠️ Simplifié : ici on prend updated_at. Pour bien faire, analyser les events
    //    (commentaires/reviews/commits) et exclure SES propres actions — cf. l'invariant.
    lastActivity: pr.updated_at,
    updateKind: 'updated',
  }
}

export const githubProvider: PrProvider = {
  id: 'github',
  name: 'GitHub',
  configFields: [
    { key: 'owner', label: 'Organisation / utilisateur', type: 'text', required: true },
    { key: 'repos', label: 'Dépôt(s)', type: 'list', required: true,
      placeholder: 'repo-a, repo-b' },
    { key: 'token', label: 'Token GitHub', type: 'password', required: true },
  ],

  validateConfig(config) {
    if (!config.owner) return "Renseigne l'organisation ou l'utilisateur."
    if (!config.repos?.trim()) return 'Renseigne au moins un dépôt.'
    if (!config.token) return 'Un token GitHub est requis.'
    return null
  },

  async fetchPullRequests(config): Promise<FetchResult> {
    const repos = config.repos.split(',').map((r) => r.trim()).filter(Boolean)
    const warnings: string[] = []

    const results = await Promise.allSettled(
      repos.map((repo) =>
        ghGet<GhPull[]>(config.token, `/repos/${config.owner}/${repo}/pulls?state=open`),
      ),
    )

    const all: PrView[] = []
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') all.push(...r.value.map(toView))
      else warnings.push(`Dépôt « ${repos[i]} » inaccessible.`)
    })

    // GitHub ne sépare pas auteur/reviewer dans cet appel : on met tout côté reviewer.
    const empty: Record<Role, PrView[]> = { creator: [], reviewer: all }
    return { ...empty, warnings }
  },
}
```

Puis dans `src/providers/index.ts` :

```ts
import { githubProvider } from './github'
export const PROVIDERS: PrProvider[] = [adoProvider, githubProvider]
```

Et l'entrée proxy dans `vite.config.ts` :

```ts
'/github': { target: 'https://api.github.com', changeOrigin: true, secure: true,
             rewrite: (p) => p.replace(/^\/github/, '') },
```

---

## Stockage & sécurité

| Donnée | Emplacement | Persistance |
|---|---|---|
| Config non secrète (org, projets, intervalle…) | `localStorage` | persiste entre sessions |
| Champs `type: 'password'` (PAT, token…) | `sessionStorage` | **effacé à la fermeture de l'onglet** |
| Suivi vu/pas-vu | `localStorage` | persiste entre sessions |

- **Mode recommandé : sans secret stocké.** Pour Azure DevOps, laisse le PAT vide et utilise
  ton `az login` : le proxy injecte un jeton Azure AD **côté serveur**, il ne transite jamais
  par le bundle navigateur.
- Les secrets ne sont **jamais** réaffichés dans l'UI ni écrits dans les logs.
- Le schéma de config est **versionné** (`CONFIG_VERSION`) pour permettre des migrations propres.

---

## Scripts npm

| Script | Effet |
|---|---|
| `npm run dev` | Serveur de dev Vite + proxy (port **5180**). |
| `npm run build` | `tsc -b` (typecheck strict) puis build de production dans `dist/`. |
| `npm run preview` | Sert le build de production localement. |

---

## Structure du projet

```
src/
├── types.ts                 # modèle de domaine NEUTRE (PrView, UpdateKind, Role)
├── updateKind.ts            # libellés + couleurs des catégories d'activité
├── usePrViews.ts            # hook : fetch + auto-refresh + filtrage vu/pas-vu + compteurs
├── storage.ts               # config (localStorage), secrets (sessionStorage), suivi vu/pas-vu
├── providers/
│   ├── types.ts             # le PORT : PrProvider, FieldDef, FetchResult
│   ├── ado.ts               # adapter de référence Azure DevOps
│   └── index.ts             # registre des providers
├── components/
│   ├── ConfigPanel.tsx      # panneau de config piloté par le provider
│   ├── PrList.tsx           # regroupement + tri
│   └── PrCard.tsx           # carte d'une PR
└── App.tsx                  # orchestration + onglets
vite.config.ts               # proxy CORS + injection du jeton Azure AD côté serveur
```

---

## Publier / contribuer (QVL-ToolBox)

Ce projet a vocation à être **public dans QVL-ToolBox**. Pour proposer un nouvel outil :

1. **Fork / branche** dédiée : `feat/provider-<outil>`.
2. Ajoute `src/providers/<outil>.ts` (+ l'entrée proxy si nécessaire) et enregistre-le dans
   `src/providers/index.ts`.
3. Vérifie que **tout compile et build** :
   ```bash
   npm run build      # tsc -b && vite build, doit sortir sans erreur
   ```
4. Teste en réel : `npm run dev`, sélectionne ton outil, vérifie le suivi vu/pas-vu
   (l'invariant `lastActivity` est le piège classique).
5. Ouvre une PR. Garde l'adapter **autonome** : tout le spécifique à l'outil reste dans son
   fichier, le domaine et l'UI ne doivent pas bouger.

> **Avant publication publique**, pense à : retirer toute donnée d'organisation réelle des
> exemples, vérifier qu'aucun secret n'est commité, et ajouter une licence au dépôt.
