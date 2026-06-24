// Le PORT : contrat qu'un provider doit implémenter pour brancher un outil
// (Azure DevOps, Jira, GitHub, GitLab…). L'app ne connaît que ce contrat.

import type { PrView } from '../types'

/** Valeurs de configuration saisies par l'utilisateur (clé → valeur). */
export type ProviderConfig = Record<string, string>

/**
 * Résultat d'un fetch : les PR regroupées par rôle, plus d'éventuels
 * avertissements non bloquants (ex: un projet inaccessible alors que les
 * autres ont répondu). `warnings` permet de remonter ces échecs partiels
 * jusqu'à l'UI sans faire échouer tout le rafraîchissement.
 */
export interface FetchResult {
  creator: PrView[]
  reviewer: PrView[]
  warnings?: string[]
}

/** Définition déclarative d'un champ de configuration, rendu par le ConfigPanel. */
export interface FieldDef {
  key: string
  label: string
  /** 'list' = saisie texte séparée par des virgules, transmise comme une seule chaîne. */
  type: 'text' | 'password' | 'list'
  placeholder?: string
  helperText?: string
  required?: boolean
}

export interface PrProvider {
  /** Identifiant technique stable (ex: 'ado'). Stocké dans la config. */
  id: string
  /** Nom affiché dans le sélecteur (ex: 'Azure DevOps'). */
  name: string
  /** Champs de configuration à afficher. Pilote le panneau de config. */
  configFields: FieldDef[]
  /** Valide la config saisie. Renvoie un message d'erreur, ou null si OK. */
  validateConfig(config: ProviderConfig): string | null
  /**
   * Récupère les PR de l'utilisateur, regroupées par rôle.
   * Un outil sans distinction auteur/reviewer peut renvoyer la même liste
   * dans les deux, ou une liste vide pour le rôle non pertinent.
   *
   * INVARIANT à respecter pour chaque `PrView` renvoyée : `lastActivity` doit
   * porter la date de la *dernière activité pertinente* (et non la date de
   * création par défaut), être monotone croissante par `id` d'un fetch à
   * l'autre, et exclure le bruit (actions de l'utilisateur courant, votes
   * positifs, mises à jour de build…). C'est elle qui pilote le suivi
   * vu / pas-vu : un provider qui la renseigne mal fera clignoter ou
   * disparaître des PR à tort. Voir la doc de `PrView.lastActivity`.
   *
   * Les échecs partiels (un projet inaccessible parmi plusieurs) ne doivent
   * pas faire échouer tout l'appel : remonter les PR récupérées et signaler
   * les sources en erreur via `FetchResult.warnings`.
   */
  fetchPullRequests(config: ProviderConfig): Promise<FetchResult>
}
