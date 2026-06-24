// Modèle de domaine NEUTRE, indépendant de tout outil (Azure DevOps, Jira, GitHub…).
// Chaque provider traduit ses objets propres vers ces types.

export type Role = 'creator' | 'reviewer'

/**
 * Catégorie de la dernière activité *pertinente* d'une PR (celle qui la fait
 * réapparaître). Sert à colorer la carte.
 *   - comment  : commentaire d'une autre personne
 *   - rejected : rejet / changement demandé par un reviewer
 *   - commits  : nouveau code poussé par quelqu'un d'autre que moi
 *   - new      : élément jamais consulté, sans activité pertinente
 *   - updated  : mise à jour générique (providers non-git, sans notion de commits)
 */
export type UpdateKind = 'comment' | 'rejected' | 'commits' | 'new' | 'updated'

/**
 * Vue neutre d'une PR / merge request / pull request, telle que consommée par l'UI.
 * Un provider DOIT remplir id, title, author, group, webUrl, lastActivity, updateKind.
 * Les autres champs sont optionnels (tous les outils n'ont pas la notion de branche).
 */
export interface PrView {
  /** Identifiant stable, utilisé comme clé et pour le suivi « vu / pas vu ». */
  id: string
  /** Référence courte affichée (ex: "123", "PROJ-45"). Défaut : id. */
  ref?: string
  title: string
  /** Nom affiché de l'auteur. */
  author: string
  /** Clé de regroupement dans la liste (dépôt, projet…). */
  group: string
  /** Branche source → cible, si l'outil est basé sur git. */
  source?: string
  target?: string
  isDraft?: boolean
  /** URL d'ouverture dans l'outil d'origine. */
  webUrl: string
  /**
   * Date ISO de la dernière activité *pertinente* — INVARIANT central.
   *
   * Ce champ pilote tout le suivi vu / pas-vu : une PR est « à regarder »
   * tant que `lastActivity` est plus récent que la date à laquelle on l'a
   * marquée vue. Le provider DOIT donc :
   *   - porter ici la date de la dernière activité pertinente, et NON la
   *     date de création par défaut dès qu'une activité existe ;
   *   - filtrer lui-même le bruit (ses propres actions, votes positifs,
   *     mises à jour de build/statut…) pour ne pas faire « clignoter » une
   *     PR sur une activité non significative ;
   *   - garantir la monotonie croissante par élément : pour un même `id`,
   *     `lastActivity` ne doit jamais régresser d'un fetch à l'autre, sinon
   *     une PR déjà vue resurgirait à tort.
   */
  lastActivity: string
  updateKind: UpdateKind
}
