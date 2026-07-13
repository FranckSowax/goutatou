# Ajustements Statuts + Carte chaîne — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development.

**Goal:** Carte menu par upload (chaîne), fix upload image statut (direct upload), composer 2 colonnes égales + aperçu agrandi, historique statuts réagencé. Spec : `docs/superpowers/specs/2026-07-13-statuts-chaine-ajustements-design.md`.

## Global Constraints

- Aucune migration, aucun changement bot. Web uniquement. Uploads fichiers = direct navigateur→storage (jamais Server Action). Token décrypté dans les actions serveur. FR, tokens light+dark, no server→client handlers. Gates (web 176+). Branche `feature/statuts-chaine-ajustements`.

---

### Task AJ1: Statuts — fix upload image (direct) + layout 2 colonnes + aperçu agrandi + historique

**Files:** Modify `apps/web/src/app/app/marketing/statuts/{composer.tsx, actions.ts, board.tsx, page.tsx, shared.ts}`

- LIRE composer.tsx (onVideoUpload = direct upload navigateur→storage ; onImageUpload = Server Action uploadStatusMedia à REMPLACER par le même direct upload : bucket status-media, path `${restaurantId}/${uuid}.<ext>`, ≤8 Mo, image/*, retourne le chemin ; la carte porte `mediaPath` comme la vidéo). actions.ts : supprimer uploadStatusMedia ; createStatus/createStatusBatch acceptent le chemin image validé `${restaurantId}/` (aligner sur le traitement vidéo, résolution URL publique côté action). Garder createStatus rétrocompatible.
- Layout : `lg:grid-cols-[1fr_auto]` → `lg:grid-cols-2` ; l'aperçu (StatusPreview) agrandi dans sa colonne (`w-full max-w-sm mx-auto`, ratio 9:16 conservé). Mobile empilé.
- board.tsx (historique) : dropdown filtre par état (Tous/Brouillon/Programmé/Publié/Échec) + pagination boutons (8/page, client-side sur les données chargées) ; clic sur une carte → StatusPreview large en Dialog (réutiliser status-preview). Helper de pagination pur dans shared.ts + test.
- [ ] Gate web complet (typecheck+test+build). Commit `feat(web): statuts — upload image direct, aperçu 2 colonnes, historique filtré paginé`.

---

### Task AJ2: Chaîne — « Carte menu » par upload (remplace l'album série)

**Files:** Modify `apps/web/src/app/app/marketing/chaine/{composer.tsx, actions.ts, shared.ts}`

- Composer : le type « Album/Carte » devient « Carte menu » = upload d'UNE image (direct navigateur→storage, bucket status-media, path `${restaurantId}/`, ≤8 Mo, image/*) + légende optionnelle. Retirer le bouton « Publier ma carte » série.
- actions.ts : supprimer postChannelCatalog ; ajouter postChannelMenuCard(formData: media_path + caption?) — myChannel guard, validateVideoPath-style pour image (préfixe + extension image), résout URL publique, décrypte token, sendNewsletterImage(waChannelId, url, caption || '📋 Notre carte — commandez sur WhatsApp !'). FR fixes.
- [ ] Gate web complet. Commit `feat(web): chaîne — carte menu par upload (remplace l'album de photos)`.

---

### Task AJ3: Revue + deploy

- [ ] Revue inline contrôleur (upload path validation, token flow, non-régression composer). Merge ff main + push (Netlify). Railway up par sûreté (whapi inchangé mais bot dépend du paquet — en fait aucun changement whapi/bot ici → SKIP railway, noter). Test réel Franck. Ledger + mémoire.
