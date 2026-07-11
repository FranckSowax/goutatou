# Menu Studio — Lot A (table + dnd + catégories + photos) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/app/menu` devient un studio en table : sections catégories réordonnables, lignes plats en drag & drop (intra et inter-catégories), édition en dialog, photos conservées.

**Architecture:** Nouvelles server actions de réordonnancement/édition (RLS membre, batch positions) + un composant client MenuStudio (dnd-kit sortable, optimistic + router.refresh) + helpers purs de calcul de positions testés. La LP lit déjà `position` : le dnd la pilote automatiquement.

**Tech Stack:** @dnd-kit/core + @dnd-kit/sortable (NOUVELLES deps — seules autorisées), shadcn existants (Dialog/Input/Select/Badge/Button), Vitest.

## Global Constraints

- Actions existantes (createCategory, createItem, deleteItem, toggleItemAvailable, upload photo) CONSERVÉES telles quelles — on AJOUTE.
- RLS membre (createSupabaseServer) comme les actions menu existantes ; aucun client admin ; aucune migration.
- Réordonnancement : positions réécrites 0..n-1 en batch ; `moveItem` met à jour category_id + positions des DEUX catégories.
- deleteCategory REFUSE (throw FR) si la catégorie contient des plats.
- dnd tactile OK (dnd-kit sensors pointer+touch), poignées explicites (pas de drag sur toute la ligne — les toggles/boutons doivent rester cliquables).
- Optimistic local pendant le drag ; échec action → rollback état serveur + message FR (pattern redeem-form: état local simple).
- Tokens/FR/light+dark ; gate par tâche `pnpm --filter @goutatou/web typecheck && test && build` (73+N verts) ; jamais de build pendant une preview. Branche `feature/menu-studio-a`.

---

### Task 1: Helpers réordonnancement purs + server actions

**Files:** Create `apps/web/src/lib/reorder.ts`, `apps/web/test/reorder.test.ts` ; Modify `apps/web/src/app/app/menu/actions.ts` (AJOUTS uniquement)

**Interfaces — Produces:**
```ts
// lib/reorder.ts (pur, testé)
export function arrayMove<T>(arr: T[], from: number, to: number): T[]          // nouvelle instance, bornes clampées
export function positionUpdates(orderedIds: string[]): { id: string; position: number }[] // 0-based
// actions.ts (chacune: auth membre via le pattern existant du fichier, revalidatePath('/app/menu'))
updateItem(id: string, formData: FormData)            // name, price, description, category_id — mêmes règles que createItem
reorderItems(categoryId: string, orderedIds: string[])
moveItem(itemId: string, toCategoryId: string, orderedTargetIds: string[]) // orderedTargetIds inclut itemId à sa place
renameCategory(id: string, name: string)
deleteCategory(id: string)                            // throw 'Déplacez d'abord les plats de cette catégorie.' si non vide
reorderCategories(orderedIds: string[])
```
- [ ] **Step 1: tests reorder.ts d'abord** (arrayMove immuable/bornes, positionUpdates 0-based). Fail → implémenter → pass.
- [ ] **Step 2: actions** — lire actions.ts existant et répliquer exactement son pattern d'auth/erreurs ; updates positions en boucle `Promise.all` ; sécurité : chaque update filtré par id ET restaurant du membre (RLS couvre, mais vérifier que les updates passent par le client RLS). Gate.
- [ ] **Step 3: commit** `feat(web): actions menu studio (édition, réordonnancement, déplacement, catégories)`

---

### Task 2: deps dnd-kit + composant MenuStudio (dnd)

**Files:** `pnpm --filter @goutatou/web add @dnd-kit/core @dnd-kit/sortable` ; Create `apps/web/src/app/app/menu/menu-studio.tsx` (client)

**Interfaces:** `<MenuStudio categories={CategoryWithItems[]} />` où CategoryWithItems = { id, name, position, items: { id, name, price, description, photo_url, available, position }[] } — fourni par page.tsx (T3).
- DndContext + sensors (Pointer, Touch, activationConstraint distance 6) ; SortableContext par catégorie (items) + un SortableContext catégories (sections).
- Poignée `GripVertical` (lucide) seule draggable ; drop intra-catégorie → reorderItems ; drop sur autre catégorie (ou sa liste) → moveItem ; drag section → reorderCategories.
- Ligne : poignée · vignette (img 40px rounded-lg object-cover / placeholder bg-muted) · nom (font-medium) · prix (font-bold text-primary, formatFcfa) · toggle dispo (form action existante toggleItemAvailable, stopPropagation) · bouton Éditer (ouvre dialog T3) · Supprimer (dialog existant conservé).
- En-tête section : poignée · nom (édition inline : clic crayon → input + Enter/blur → renameCategory) · badge compteur · bouton supprimer (disabled + tooltip si items>0 ; action deleteCategory).
- État optimistic : useState local des catégories, réordonné au drop AVANT l'appel action ; catch → reset depuis props + message destructive.

- [ ] Implémenter ; gate (build incl.) ; commit `feat(web): MenuStudio — table drag & drop (plats, déplacements, catégories)`

---

### Task 3: Dialog Éditer + assemblage page

**Files:** Create `apps/web/src/app/app/menu/edit-item-dialog.tsx` ; Modify `apps/web/src/app/app/menu/page.tsx`

- page.tsx : requête existante enrichie si besoin (categories + items ordonnés par position asc), construit CategoryWithItems, rend : en-tête page + formulaires création existants (catégorie / plat — repris tels quels, éventuellement repliés dans des Dialog « Nouvelle catégorie » / « Nouveau plat » pour alléger) + `<MenuStudio/>`. La grille de cartes DISPARAÎT.
- edit-item-dialog.tsx (client) : Dialog shadcn — champs name/price/description (mêmes names que createItem), Select catégorie (submit → updateItem ; si catégorie changée l'action gère category_id... non : updateItem écrit category_id directement, position en fin de catégorie cible — préciser dans l'action T1 : si category_id change, position = count(cible)), upload photo = form action existante réutilisée DANS le dialog (input file + bouton, inchangé côté serveur).
- [ ] Implémenter ; gate ; commit `feat(web): menu studio — dialog édition + page assemblée`

---

### Task 4: QA + revue finale + deploy

- [ ] Contrôleur : page mock avec données riches (3 catégories, 8 plats, photos mix) → **tester le dnd au pointeur réel en preview** (drag intra, inter-catégories, sections), light+dark, 375px (poignées tactiles ≥44px de zone), édition inline nom catégorie, dialogs. Supprimer la page mock.
- [ ] Revue finale opus (optimistic/rollback, sécurité actions batch, a11y poignées aria, régression LP = zéro changement de lecture) → fix wave unique → merge ff main → push (Netlify). Ledger + mémoire.
