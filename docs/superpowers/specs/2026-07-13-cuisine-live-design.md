# Spec — Cuisine Live (overlay + carillon, arrivée Drive)

Date : 2026-07-13. Branche : `feature/cuisine-live`. Migration `20260713000030`.

## Origine

Portage de 3 workflows d'un dashboard temps réel de référence. **Étape 0 (inventaire) faite** : deux
workflows sur trois existent déjà chez Goutatou, et une partie du prompt d'origine casserait l'app.
Ce document acte ce qu'on porte, ce qu'on adapte, et **ce qu'on rejette avec la raison**.

### Table de correspondance (design — la palette de référence n'entre JAMAIS)

| Rôle sémantique | Référence | → Token Goutatou |
|---|---|---|
| Surface / fond | `#0B0805` | `--background` |
| Texte principal | `#F4EDE0` | `--foreground` |
| Accent primaire | `#E8912D` | `--primary` (émeraude) |
| Succès / nouvelle commande | `#2ECC71` | `--primary` + `--tint-mint` |
| État « arrivée » | `#3D8BFF` | `--tint-sky` |
| Alerte / destructif | `#ff9d7a` | `--destructive` |
| Titres | Be Vietnam Pro 900 | `--font-display` (Outfit) |
| Data / labels | IBM Plex Mono | `--font-sans` (Jakarta) + `tabular-nums` |
| Rayon | 14–24px | `--radius` |

### Correspondance métier

- ⟦entité⟧ = **commande** (`orders`) · code humain = **`order_number`**
- ⟦arrivée⟧ = **Drive** (`order_mode='drive'`, `drive_slots`) — le mode existe **déjà**
- ⟦catalogue⟧ = **menu** (Menu Studio) — existe **déjà**

## Décisions (validées par Franck)

1. **Transport : Supabase Realtime existant. Le SSE du prompt est REJETÉ.**
   Raison technique dure : le SSE de référence suppose un **serveur long-vivant** avec un `Set` en
   mémoire des clients. Le web Goutatou tourne sur **Netlify serverless** : invocations isolées, pas
   de mémoire partagée, timeout d'exécution → **broadcast structurellement impossible**. Et Supabase
   Realtime (websockets managés) est déjà branché à **5 endroits** (`commandes/board.tsx`,
   `home-refresh.tsx`, `conversations/inbox.tsx`, `campagnes/board.tsx`, `campagnes/[id]/detail.tsx`).
   → On garde **le comportement** (overlay, minutages, idempotence, son) et on change **le transport**.
2. **Son toujours actif, pas de bascule.** ⚠️ Contrainte navigateur non négociable : l'audio est bloqué
   tant qu'il n'y a pas eu **un geste utilisateur** → `ensureAudio()` au 1er clic (`document.addEventListener('click', …)`).
   **Conséquence assumée et documentée** : une commande arrivant avant tout clic affiche l'overlay mais
   **ne sonne pas**. C'est une règle du navigateur, pas un défaut d'implémentation.
3. **Catalogue : rien à faire** (Menu Studio couvre le CRUD/catégories/prix/images/actif).
   `/api/menu/public` en CORS `*` **REJETÉ** : la LP est servie par le même Next et lit Supabase côté
   serveur → aucun besoin cross-domaine ; ce serait **de la surface d'attaque en plus pour zéro gain**.
4. **Ligne secondaire traduite (vietnamien) : retirée** — le prompt d'origine dit lui-même de la
   supprimer si non pertinente. Non pertinente ici.

## Workflow 1 — Overlay plein écran + carillon

**But** : en cuisine le téléphone est loin et les mains occupées → une nouvelle commande (ou une
arrivée Drive) doit être **impossible à rater**.

**Où** : dans le shell `/app` (pas seulement `/app/commandes`) → le gérant est alerté quelle que soit la
page ouverte. Composant client monté dans `apps/web/src/app/app/layout.tsx`.

**Comportement (porté à l'identique, habillé Goutatou)** :
- Deux overlays `fixed inset-0 z-[100]`, cachés par défaut, `role="alert"` :
  1. **Nouvelle commande** → teinte `--tint-mint` : « NOUVELLE COMMANDE », **`#order_number` en très
     grand** + total `formatFcfa`, ligne « toucher pour fermer ».
  2. **Client arrivé** → teinte `--tint-sky` : « CLIENT ARRIVÉ — À REMETTRE », `#order_number` + le
     détail d'arrivée.
- **Fermeture** : tap n'importe où **OU** auto — **10 s** (commande) / **15 s** (arrivée).
- **Ré-armement** si un 2e événement arrive pendant l'affichage : `remove('on')` → reflow
  (`void el.offsetWidth`) → `add('on')`.
- **Idempotence** : `Set` des ids déjà vus côté client (le Realtime peut redélivrer).
- **`prefers-reduced-motion`** : pas de clignotement — apparition/disparition simples. Le son reste.

**Source des événements** : canal Supabase Realtime sur `orders` (déjà utilisé) :
- `INSERT` → overlay « nouvelle commande » ;
- `UPDATE` dont `arrived_at` passe de `null` à non-null → overlay « client arrivé ».
Le composant filtre par `restaurant_id` du membre (RLS s'applique déjà au canal).

**Carillon (module générique, indépendant du design — porté tel quel)** : Web Audio, 2 notes sinus
(880 Hz + 1174,66 Hz à +0,15 s), enveloppe exponentielle ~0,9 s, **5 rappels espacés de 2 s** puis
silence. Aucun fichier audio (CSP-safe). `stopAlert()` à la fermeture de l'overlay.

## Workflow 2 — Arrivée Drive (« je suis arrivé »)

**Existant** : `order_mode='drive'`, `drive_slots`, `orders.drive_slot_id`, `restaurants.drive_enabled`.
**Manquant** : le signal d'arrivée (grep : zéro résultat).

**Migration 0030** :
```sql
alter table orders add column if not exists arrived_at timestamptz;
alter table orders add column if not exists arrival_note text;
notify pgrst, 'reload schema';
```

**Machine à états (bot)** — le point critique souligné par le prompt d'origine : **le flux ne s'active
que si l'état l'attend**, sinon il avalerait les messages normaux (support, nouvelle commande…).
1. Commande créée en mode `drive` → le notifier envoie au client, **en plus du message de statut
   existant**, un bouton **« ✅ Je suis arrivé »** (`sendQuickReplies`, id `arr:<orderId>`).
2. Tap → le processor intercepte le préfixe `arr:` **avant le flux machine** (même emplacement que
   `stapp:`/`chapp:` — pattern établi), **réutilise `matchButtonInput`** pour le cas où l'id ne
   revient pas (round-trip non fiable — leçon déjà apprise, cf. mémoire).
3. `markArrived(orderId, note)` : `update orders set arrived_at = now() where id = ? and arrived_at is null`
   (**idempotent** : un double-tap ne fait rien) → le Realtime propage l'UPDATE → **overlay sky en cuisine**.
4. Réponse FR au client : « C'est noté, on vous apporte votre commande ! ».
5. **Garde** : n'accepter `arr:` que si la commande existe, appartient au resto du canal, est en mode
   `drive` et n'est pas déjà `recuperee`/`annulee`. Sinon → message FR neutre.

**Détail d'arrivée** (« Toyota blanche ») : v1 = le client peut **répondre par un texte** juste après
le tap → stocké dans `arrival_note`. Hors périmètre si ça complexifie la machine : le bouton seul
suffit à déclencher l'alerte. **L'implémenteur tranchera et documentera.**

**Badge cuisine** : sur le Kanban, une commande drive affiche « 🚗 Drive » (teinte sky atténuée) et,
une fois `arrived_at` posé, « 🚗 ARRIVÉ » (sky plein) avec `arrival_note` en `title`.

## Workflow 3 — Langage d'interaction

Porté **en structure**, mappé sur les tokens Goutatou :
- **Pastille live** : passe à `--primary` quand le canal Realtime est `SUBSCRIBED`.
- **Badges d'état** : pilule compacte, majuscules, `letter-spacing` — **un badge = un rôle sémantique**
  (payé→primary, sur place→accent, arrivée→sky, annulé→destructive). Jamais de couleur en dur.
- **Montants** en `tabular-nums` (déjà partiellement fait).
- **Ligne fraîche** : pulse ~2,4 s à l'insertion (respecte `prefers-reduced-motion`).
- **Dropdown « Outils »** : range les actions techniques hors du flux principal, ferme au clic extérieur.

## Rejeté (et pourquoi)

| Élément du prompt | Décision | Raison |
|---|---|---|
| Transport SSE + `Set` de clients | **Rejeté** | Netlify serverless : broadcast impossible. Realtime existe et marche. |
| `/api/menu/public` CORS `*` | **Rejeté** | LP servie par le même Next, lecture serveur. Surface d'attaque pour zéro gain. |
| CRUD catalogue | **Rejeté** | Menu Studio le fait déjà (catégories, prix, images, actif, dnd). |
| Ligne secondaire vietnamienne | **Retirée** | Non pertinente (le prompt le prévoit). |
| Bascule 🔔 | **Retirée** | Choix de Franck : son toujours actif. Le déblocage au 1er clic reste (navigateur). |

## Tests

- Helpers purs testés : idempotence (`Set` des ids vus), choix de l'overlay selon l'événement, garde
  d'acceptation `arr:` (commande drive, non terminée, bon resto).
- Bot : `markArrived` idempotent (2e appel = no-op), garde de mode/état, réponse FR.
- Le carillon et les overlays ne sont pas testables unitairement (Web Audio/DOM) → vérif au smoke.

## Sécurité

- Aucun nouvel endpoint public. Le Realtime passe par la RLS existante.
- `arr:` gardé par resto + mode + état ; `markArrived` idempotent et conditionnel en SQL.
- Aucun secret côté client.

## Smoke (Franck)

Deux onglets `/app` → passer une commande drive depuis WhatsApp → **overlay mint + carillon** ;
taper « ✅ Je suis arrivé » → **overlay sky + carillon** + badge « ARRIVÉ » sur le Kanban ; vérifier la
fermeture au tap et l'auto-fermeture ; vérifier qu'un double-tap ne réalerte pas.
