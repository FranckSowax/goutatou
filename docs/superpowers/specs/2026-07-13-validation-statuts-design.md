# Validation des statuts auto (gérant / groupe) — Design

Date : 2026-07-13
Statut : validé (Franck : les 2 modes configurables ; sans réponse = ne pas publier)

## Intention

Avant chaque publication automatique de statut, une **validation humaine** :
soit un **gérant unique** (boutons Valider/Refuser sur son WhatsApp), soit un
**vote du groupe staff** (sondage Oui/Non). 2 h avant le créneau. Sans validation
à l'heure du créneau → **non publié** (sécurité). Sur refus → **régénérer** un
autre contenu ou **annuler**.

## Modèle (migration 0025)

- Enum `status_state` : ajouter `'pending_approval'`. (`canceled` existe déjà —
  réutilisé pour refus/non-validé-à-temps, avec `error` explicatif FR.)
- `statuses` : `approval_message_id text` (message boutons gérant OU sondage
  groupe), `approval_requested_at timestamptz`, `auto_generated boolean not null
  default false` (distingue les statuts auto des manuels).
- `restaurants` : `auto_status_validation text not null default 'none'
  check (in ('none','manager','group'))`, `auto_status_manager_phone text`.
- Fenêtre : `AUTO_STATUS_LEAD_MIN` = 120 (constante bot ; la génération se fait
  quand `now >= créneau - 120 min`, la publication reste au créneau).

## Flux

1. **auto-status worker** (déclencheur avancé) : quand un créneau approche
   (now ≥ slot − 120 min, claim par slotKey inchangé), génère les
   `auto_status_count` statuts (rotation menu, captions) → :
   - validation `'none'` → état `scheduled`, scheduled_at = heure du créneau
     (comportement actuel, aucune régression).
   - `'manager'` → état `pending_approval`, scheduled_at = créneau ; envoie au
     numéro gérant (auto_status_manager_phone, défaut = contact_phone) : pour
     CHAQUE statut, l'image + la légende (sendImage) PUIS un message boutons
     « Publier ce statut ? » [✅ Valider `stapp:<id>`] [❌ Refuser `strej:<id>`]
     (sendQuickReplies) ; stocke approval_message_id + approval_requested_at.
     Numéro gérant absent → failed FR « Renseignez le numéro du gérant
     validateur. ».
   - `'group'` → état pending_approval ; groupe staff requis (staff_group_id ;
     absent → failed FR « Créez d'abord le groupe Cuisine. ») ; envoie l'image
     de chaque statut au groupe PUIS UN sondage récapitulatif « 📸 Publier les
     N statuts du jour ? » options [Oui] [Non] (sendPoll) ; stocke
     approval_message_id = id du sondage.

2. **Réponse gérant (mode manager)** — processor intercepte les réponses boutons
   dont l'id commence par `stapp:` / `strej:` AVANT le flux machine (comme
   l'opt-out) :
   - `stapp:<id>` → status → `scheduled` (sera publié au créneau) ; confirme
     « ✅ Statut validé, publication à l'heure prévue. ».
   - `strej:<id>` → renvoie 2 boutons « Que faire ? » [🔄 Régénérer `streg:<id>`]
     [🚫 Annuler `stcan:<id>`].
   - `streg:<id>` → régénère le contenu (plat suivant du cursor + nouvelle
     caption), reste pending_approval, renvoie l'image + boutons Valider/Refuser.
   - `stcan:<id>` → status → `canceled` (error « Refusé par le gérant. »).

3. **Décision groupe (mode group)** — un **worker de décision** (poll sur les
   statuts pending_approval group dont le créneau est atteint) lit les votes du
   sondage (whapi readPollVotes/getMessage) : Oui > Non ET ≥1 Oui → tous les
   statuts du lot → `scheduled` (publiés immédiatement, créneau atteint) ; sinon
   → `canceled` (« Non validé par le groupe. »). Fenêtre de vote = jusqu'au
   créneau.

4. **status worker (publication)** : ne publie QUE les `scheduled` dont
   scheduled_at ≤ now (inchangé). Tout `pending_approval` mode manager encore en
   attente à l'heure du créneau (now ≥ scheduled_at) → `canceled` (« Non validé
   à temps — non publié. ») : c'est la règle « sans réponse = ne pas publier ».

## whapi

- readPollVotes(messageId) → { yes: number, no: number } (GET /messages/{id} ou
  endpoint votes — vérifier manifest getMessage ; parsing défensif des compteurs
  par nom d'option). sendQuickReplies/sendPoll/sendImage existent déjà.

## Web (/app/marketing/statuts, section Statuts Auto premium — étendue)

- Sélecteur « Validation avant publication » : Aucune / Gérant / Groupe staff.
- Si Gérant : champ « Numéro du gérant validateur » (défaut = téléphone de
  contact, format E.164 permissif). Si Groupe : note « Le groupe Cuisine votera
  (créez-le d'abord si absent) ».
- Action updateAutoStatus étendue (garde membre+premium, validation serveur).

## Hors scope / backlog

Seuils de vote configurables, rappel de relance si pas de réponse, validation
des statuts MANUELS (seuls les auto sont concernés).

## Vérification

pgTAP migration ; tests whapi (readPollVotes) ; bot TDD (worker : lead 120,
états par mode, dispatch manager/group ; processor : interception stapp/strej/
streg/stcan → transitions ; decision worker : Oui>Non/égalité/0 vote ; status
worker : pending non publié + canceled). Web (sélecteur, champ, gating). Revue
OPUS (workflow d'approbation = surface sensible : rien ne doit publier sans OK).
Prod + smoke réel Chez Demo (mode manager sur le numéro de Franck).
