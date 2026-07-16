/**
 * URL publique du site web (Netlify). Il n'existe pas de variable d'env dédiée pour ça
 * (vérifié : seule `WHEEL_BASE_URL` existe, réservée à la signature des liens de roue par le
 * bot — usage différent) : le repo construit déjà ses liens absolus vers le site avec cette
 * même chaîne en dur (cf. `admin/restaurants/[id]/page.tsx` et `admin/lp/[restaurantId]/page.tsx`,
 * lien `/r/{slug}`). Centralisé ici pour les liens d'invitation/récupération du mot de passe.
 */
export const SITE_BASE_URL = 'https://goutatou.netlify.app'
