# LP Motion v2 — hero scroll-scrub avec extraction de frames — Design

Date : 2026-07-11
Statut : validé (Franck a choisi la « voie 1 » : séquence de frames + canvas, extraction automatique côté Railway)

## Problème / intention

La LP publique joue aujourd'hui la vidéo hero en autoplay : le scroll ne pilote pas
l'image. Franck veut l'effet scrollytelling du pipeline motion-website (style Apple) :
la vidéo découpée en frames, scrubbée image par image par le scroll. Contrainte
multi-tenant : chaque resto uploade sa vidéo → l'extraction doit être **automatique**
(pas de ffmpeg possible sur Netlify → le job vit sur le bot Railway, qui a déjà le
pattern des workers à poll).

## Architecture

### 1. État dans `lp_config.hero.frames` (jsonb, pas de migration)

```
hero.frames = {
  status: 'pending' | 'ready' | 'failed',
  sourceUrl: string,   // le hero.mediaUrl traité (clé d'idempotence)
  baseUrl: string,     // URL publique du dossier frames (bucket lp-media)
  count: number,       // nb de frames
  width: number, height: number
}
```
- `parseLpConfig` étendu (null-safe, rétrocompatible : frames absent = pas de scrub).
- Idempotence : le worker ne traite que si `hero.mediaType === 'video'` ET
  (`frames` absent OU `frames.sourceUrl !== hero.mediaUrl`). Un `failed` sur le même
  `sourceUrl` n'est PAS retenté en boucle (skip tant que la vidéo ne change pas).

### 2. Worker d'extraction (bot Railway)

- `services/whatsapp/src/lpframes/{repo.ts, worker.ts, ffmpeg.ts}` — même pattern que
  campaign/status workers : poll `LP_FRAMES_POLL_MS` (défaut 60 000 ms), try/catch,
  log `[lpframes-worker] démarré`.
- Cycle : repo liste les restos candidats (service role) → pour chacun :
  1. marque `frames.status='pending'` (+ sourceUrl) ;
  2. télécharge la vidéo (fetch → fichier temp) ;
  3. extrait via ffmpeg : `fps=6`, `scale=960:-2`, WebP qualité ~70 →
     ~90 frames pour 15 s (~2-3 Mo au total, adapté au mobile CEMAC) ;
  4. uploade les frames dans `lp-media` sous `${restaurantId}/frames/${hash(sourceUrl)}/f-0001.webp…`
     (bucket public existant, policies inchangées — écrit en service role) ;
  5. écrit `frames.status='ready'` + baseUrl/count/dimensions.
  Échec (téléchargement, ffmpeg, upload) → `frames.status='failed'` sans throw hors du poll.
- **Dockerfile** : ajout de `ffmpeg` (apt) à l'image node:22-slim.
- Helpers purs testables : construction des args ffmpeg, nommage des frames,
  décision `needsExtraction(config)`, hash de sourceUrl.

### 3. LP : composant HeroScrub (client)

- Si `frames.status === 'ready'` : le hero devient une **section épinglée (~250 vh)**
  — canvas plein écran, ScrollTrigger scrub → `frame = round(progress × (count-1))`,
  dessin cover ; préchargement progressif (1 frame sur 4 d'abord, puis le reste) ;
  titre/sous-titre/CTA en overlay comme aujourd'hui.
- Sinon (pas de frames, pending, failed, ou média image) : **fallback = hero actuel**
  (vidéo autoplay ou image). Zéro régression pour les restos sans vidéo.
- `prefers-reduced-motion` : pas de pin ni scrub — première frame statique.
- GSAP/ScrollTrigger déjà présents côté LP (aucune dépendance nouvelle côté web).

### 4. Ce qui ne change pas

Éditeur LP, upload direct navigateur (chantier précédent), checkout/commande,
rate-limiting, dashboard. Aucune migration SQL. Aucune nouvelle policy storage
(écritures worker en service role ; lecture publique par URL comme aujourd'hui).

## Hors scope (YAGNI)

Sections épinglées supplémentaires, parallax des plats, ré-encodage HD du clip,
file d'attente dédiée (le poll suffit à cette échelle), nettoyage des anciennes
séquences de frames (noté en suivi).

## Vérification

- Tests unitaires : helpers ffmpeg/nommage/needsExtraction (bot), parseLpConfig
  frames (web), suites existantes vertes (42 web + 51 bot + autres).
- Test d'intégration manuel contrôleur : extraction réelle du clip Chez Demo en
  local (ffmpeg installé) OU après déploiement Railway ; puis vérif visuelle du
  scrub sur /r/chez-demo (desktop + mobile + reduced-motion).
- Déploiement : merge main → Netlify auto ; bot → `railway up --detach --service whatsapp-bot`.
