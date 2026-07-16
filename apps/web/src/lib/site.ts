/**
 * URL publique du site web (Netlify). Utilisée uniquement côté serveur (routes API, server
 * actions admin) pour construire les liens d'invitation/récupération du mot de passe — pas de
 * préfixe `NEXT_PUBLIC_` nécessaire (même pattern que `WHEEL_BASE_URL`, server-only, cf.
 * `app/fidelite/page.tsx`). Lue depuis `SITE_BASE_URL` avec repli sur la valeur historique en
 * dur pour ne rien casser tant que la var n'est pas configurée (dev/preview/Netlify actuel, qui
 * construit déjà ses liens absolus vers le site avec cette même chaîne, cf.
 * `admin/restaurants/[id]/page.tsx` et `admin/lp/[restaurantId]/page.tsx`, lien `/r/{slug}`).
 */
export const SITE_BASE_URL = process.env.SITE_BASE_URL ?? 'https://goutatou.netlify.app'
