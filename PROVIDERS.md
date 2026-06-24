# Ajouter un provider

Le guide complet pour brancher un nouvel outil (Jira, GitHub, GitLab…) vit désormais
dans le **[README](./README.md#-brancher-un-nouveau-provider)** :

- les 3 étapes (écrire l'adapter → l'enregistrer → proxy CORS),
- le modèle neutre `PrView` et l'invariant `lastActivity`,
- le tableau des couleurs `updateKind`,
- les règles de stockage config / secrets,
- un **exemple complet** de provider GitHub.

Référence d'implémentation : `src/providers/ado.ts`.
