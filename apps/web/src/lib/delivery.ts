import { formatFcfa } from '@goutatou/db/types'
import { orderItemsSummary } from './orders'

/** Coordonnées `lat,lng` détectées dans une adresse (lien maps du bot ou saisie brute), sinon null. */
function extractCoords(address: string): string | null {
  // Lien posé par le bot pour un partage de position : https://maps.google.com/?q=LAT,LNG
  const q = address.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
  if (q) return `${q[1]},${q[2]}`
  // Adresse déjà sous forme "LAT,LNG" brute.
  const bare = address.trim().match(/^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/)
  if (bare) return `${bare[1]},${bare[2]}`
  return null
}

/**
 * Liens profonds d'itinéraire vers le client, pour Google Maps ET Waze. Si l'adresse contient des
 * coordonnées (partage de position GPS via le bot), on route en `lat,lng` ; sinon on encode l'adresse
 * texte en requête (les deep links Maps/Waze acceptent une chaîne libre — pas de géocodage requis).
 * `restaurantGps` optionnel ajoute l'origine (départ depuis le resto) au lien Maps.
 */
export function deliveryLinks(
  address: string,
  restaurantGps?: { lat: number; lng: number } | null,
): { maps: string; waze: string } {
  const coords = extractCoords(address)
  const originParam = restaurantGps
    ? `&origin=${encodeURIComponent(`${restaurantGps.lat},${restaurantGps.lng}`)}`
    : ''

  if (coords) {
    const enc = encodeURIComponent(coords)
    return {
      maps: `https://www.google.com/maps/dir/?api=1&destination=${enc}${originParam}`,
      waze: `https://waze.com/ul?ll=${enc}&navigate=yes`,
    }
  }
  const enc = encodeURIComponent(address)
  return {
    maps: `https://www.google.com/maps/dir/?api=1&destination=${enc}${originParam}`,
    waze: `https://waze.com/ul?q=${enc}&navigate=yes`,
  }
}

/** Message FR envoyé au livreur : détail commande + itinéraire (liens cliquables ouvrant Maps/Waze). */
export function buildDeliveryMessage(
  o: {
    order_number: number
    customer_name: string | null
    customer_phone: string
    delivery_address: string | null
    total: number
    items: { name: string; qty: number }[]
  },
  links: { maps: string; waze: string },
): string {
  const client = o.customer_name?.trim() || 'Client'
  const articles = orderItemsSummary(o.items)
  const adresse = o.delivery_address?.trim() || 'Adresse non précisée'
  return (
    `🛵 *Nouvelle livraison — commande n°${o.order_number}*\n\n` +
    `👤 ${client} · ${o.customer_phone}\n` +
    `📦 ${articles}\n` +
    `📍 ${adresse}\n` +
    `💰 ${formatFcfa(o.total)}\n\n` +
    `🗺️ Google Maps : ${links.maps}\n` +
    `🚗 Waze : ${links.waze}`
  )
}
