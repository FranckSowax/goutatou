# Analytics v1 — stats resto + dashboard admin plateforme — Design

Date : 2026-07-11
Statut : validé (Franck : page /app/stats dédiée ; admin = KPIs globaux + courbe 14 j + activité premium ; table restos enrichie écartée)

## Intention

Deux surfaces de pilotage, une même infrastructure :
1. **Restaurateur — `/app/stats`** (nouvelle entrée sidebar « Statistiques ») : comprendre
   son activité au-delà du jour (tendance CA, volumes, top plats, modes, heures de pointe).
2. **Plateforme — `/admin`** (section dashboard au-dessus de la table restos) : santé du
   parc (restos actifs, volume global, plans, canaux) + usage des fonctions premium
   (argument de vente des upgrades).

## Règles dataviz (skill dataviz, gravées pour toute la feature)

- **Une seule teinte** (émeraude, tokens `--primary`/dérivés) : toutes les mesures sont
  des magnitudes mono-série → pas de palette catégorielle, pas de légende (le titre nomme
  la série). Grille/axes discrets (`--border`/`--muted-foreground`).
- Formes : tendance → **aire/ligne** ; volumes par jour/heure → **barres fines** (coins
  4px côté données, base carrée) ; classements (top plats, modes, plans) → **barres
  horizontales avec labels directs** (petits jeux de données).
- **Texte en tokens texte**, jamais en couleur de série. Chiffres `tabular-nums`,
  FCFA via `formatFcfa`.
- Survol v1 : `<title>` SVG natif par marque (tooltip navigateur) + labels directs —
  tooltips riches (crosshair) = suivi v2 explicite.
- Jamais de double axe. Dark mode automatique via tokens (vérif visuelle dédiée).
- Fuseau **Africa/Libreville** pour tout regroupement par jour/heure.

## Architecture

### 1. Primitives charts (SVG serveur, zéro JS client, zéro dépendance)

`apps/web/src/components/charts/` :
- `AreaChart` — série [{label, value}], aire dégradée primaire + ligne 2px, ticks x
  clairsemés, min-height fixe (pas de CLS).
- `BarChart` — barres verticales fines, gap 2px, valeur max labellisée.
- `HBarList` — lignes {label, value, display?} avec barre proportionnelle + valeur à
  droite (top plats, modes, plans).
Chaque marque porte un `<title>` (« 08/07 · 42 500 FCFA »). Helpers purs extraits et
testés : `scaleLinear`, `buildAreaPath`, `sparseTicks` (édge cases : série vide, un
point, valeurs nulles, max=0).

### 2. Agrégations pures (`apps/web/src/lib/stats.ts`, TDD)

Entrées = lignes brutes (orders / order_items / campaigns / statuses) ; sorties :
- `dailySeries(orders, days, now)` → [{label 'JJ/MM', ca, count}] (jours vides = 0,
  annulées exclues, TZ Libreville).
- `topItems(orderItems, limit)` → [{name, qty, ca}] trié qty desc.
- `modeSplit(orders)` → [{mode, count}] ordre fixe sur_place/drive/livraison.
- `hourHistogram(orders)` → 24 seaux (annulées exclues).
- `planSplit(subscriptions)` / compteurs premium (campagnes sent, statuts posted).

### 3. Page `/app/stats` (server, RLS, force-dynamic)

Requêtes : orders 30 j (id, status, mode, total, created_at) + order_items des commandes
non annulées 30 j (name, qty, unit_price via jointure orders pour le fenêtrage).
Sections : bandeau 3 stat-tiles (CA 30 j, commandes 30 j, panier moyen 30 j) →
AreaChart CA 14 j → BarChart commandes/jour 14 j → deux colonnes : HBarList top 5 plats
(30 j) + HBarList modes (30 j) → BarChart heures de pointe (7 j). États vides gérés
(« Pas encore de données » + invitation). Nav : « Statistiques » (icône ChartColumn)
après Commandes. Realtime non requis (page d'analyse, pas d'opérations).

### 4. Dashboard `/admin` (service role, au-dessus de la table restos)

- 5 stat-tiles : restos onboardés, restos actifs (≥1 commande 7 j), commandes
  aujourd'hui (global), canaux actifs / total, répartition plans (mini HBarList).
- AreaChart commandes/jour global 14 j.
- **Activité premium** : petite table par resto (campagnes envoyées 30 j — somme
  sent_count des campagnes sent ; statuts publiés 30 j) triée par usage desc — repérer
  qui exploite (ou pas) son plan payant.
Volume : agrégation JS sur selects fenêtrés (échelle actuelle) ; bascule en vues SQL
notée comme suivi quand le parc grossira.

## Hors scope (YAGNI)

Tooltips riches/crosshair, export CSV, sélecteur de période custom, comparaisons
période N-1, vues SQL matérialisées, stats temps réel, table restos enrichie.

## Vérification

Tests : helpers charts + stats (TDD, TZ frontière incluse comme home-kpis). Suites
vertes. Passe visuelle contrôleur light+dark+375px avec données démo réelles (Chez
Demo : 8 commandes, campagne sent, statuts). Revue finale opus → merge → Netlify
(bot non concerné, aucune migration).
