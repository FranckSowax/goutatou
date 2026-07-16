/**
 * Arrivée Drive (« ✅ Je suis arrivé ») — logique PURE (parsing de l'id de bouton + copies FR),
 * cf. docs/superpowers/plans/2026-07-13-cuisine-live.md § Task CL3, mirror
 * autostatus/approval.ts. Aucun effet de bord ici : le processor (impur) orchestre la lecture/
 * écriture repo et l'envoi Whapi ; ce module ne fait que décider quoi dire.
 *
 * Repli existe désormais (v2 annoncée par le commentaire de `parseArrivalButton` ci-dessous) :
 * `isArrivalText` reconnaît le TITRE du bouton même quand l'id `arr:<orderId>` ne revient pas
 * (tap renvoyé en `text` ou en `reply` sans id — round-trip WhatsApp non garanti, cf. bug
 * suppléments/`matchButtonInput` dans bot/buttons.ts). Le processor résout alors l'orderId par
 * CONTEXTE (dernière commande Drive en attente du client, cf. arrival-repo.ts
 * `findPendingDriveOrder`) plutôt que de renoncer silencieusement.
 */

/** Convention id bouton client (cf. notifier.ts handleOrderUpdate) : préfixe court + uuid commande. */
const PREFIX = 'arr:'

/**
 * Parse un id de bouton entrant en orderId. `null` si l'id ne commence pas par le préfixe `arr:`
 * (pas un bouton d'arrivée — le processor doit retomber sur le flux machine normal) ou si
 * l'orderId est vide.
 *
 * Round-trip de l'id : contrairement aux ids `in:<x>` de la machine à états (cf. bot/buttons.ts
 * matchButtonInput), ce bouton porte une donnée PAR COMMANDE (l'orderId) qu'aucun texte de titre
 * générique ne permet de reconstituer si l'id ne revient pas — `matchButtonInput` retraduit un
 * TITRE vers un choix fermé connu à l'avance (numéro, "oui"…), il n'a rien à retraduire ici sans
 * connaître la commande visée. Décision documentée (cf. plan CL3) : on se fie à `replyId`
 * uniquement ; si l'id ne revient jamais pour ce bouton précis en production, ce sera visible aux
 * logs `[buttons] reply payload` déjà en place et traité en v2 (ex. résolution par dernière
 * commande Drive active du client).
 */
export function parseArrivalButton(id: string): string | null {
  if (!id.startsWith(PREFIX)) return null
  const orderId = id.slice(PREFIX.length)
  return orderId.length > 0 ? orderId : null
}

/**
 * Normalise agressivement un texte entrant pour le matching tolérant de `isArrivalText` :
 * minuscules, retrait des accents (NFD + suppression des marques diacritiques), retrait de
 * tout ce qui n'est ni lettre ni chiffre ni espace (emoji, ponctuation, sélecteurs de variation
 * — remplacés par un espace pour ne pas recoller deux mots), espaces multiples réduits à un
 * seul, trim.
 */
function normalizeArrivalText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Vrai si le texte entrant correspond au titre du bouton d'arrivée (tolérant : casse, accents,
 * espaces, emoji éventuellement absent/présent, accord masculin/féminin « arrivé »/« arrivée »,
 * ponctuation). Match STRICT sur la phrase complète normalisée (pas de correspondance
 * partielle) — un message qui contient d'autres mots ("je suis arrivé au parking") ne matche
 * pas, pour éviter d'avaler un message qui n'est pas réellement le tap d'arrivée.
 */
export function isArrivalText(body: string): boolean {
  return /^je suis arrivee?$/.test(normalizeArrivalText(body))
}

/** Copies FR figées (cf. plan CL3 § Processor). */
export const ARRIVAL_COPY = {
  /** Garde échouée (commande inconnue/autre resto/mode≠drive/déjà terminée) OU double-tap
   *  (markArrived idempotent renvoie 0 ligne) — même message neutre dans les deux cas. */
  notPending: "Cette commande n'est plus en attente.",
  confirmed: 'C\'est noté, on vous apporte votre commande !',
} as const
