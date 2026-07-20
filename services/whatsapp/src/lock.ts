/**
 * Mutex en mémoire par clé (sérialisation par client, cf. audit fiabilité — correctif 1) :
 * deux webhooks Whapi rapprochés du même client déclenchaient deux read-modify-write
 * concurrents sur `conversations` (loadConversation → … → saveConversation), écrasant le
 * panier et pouvant créer une double commande. `withLock('restaurantId:chatId', fn)` chaîne
 * chaque traitement sur la promesse du précédent de la MÊME clé — FIFO garanti (l'ordre
 * d'inscription dans la chaîne est l'ordre d'appel synchrone), clés indépendantes jamais
 * bloquées entre elles, et l'entrée de la Map est nettoyée dès que la chaîne est vide
 * (aucune fuite mémoire sur des millions de clients au fil des semaines).
 *
 * Limite assumée : verrou LOCAL au process (une seule instance du bot en prod). La défense
 * en profondeur inter-process est côté SQL (create_order rejette `duplicate_order` < 20 s,
 * cf. migration anti-double-commande + gestion dédiée dans le processor).
 */
export interface KeyedLock {
  <T>(key: string, fn: () => Promise<T>): Promise<T>
  /** Nombre de clés actuellement verrouillées/en attente (observabilité + tests). */
  size(): number
}

export function createKeyedLock(): KeyedLock {
  // Queue de chaque clé = promesse résolue quand TOUT ce qui est inscrit avant est terminé.
  // Les promesses stockées ne rejettent JAMAIS (résolues manuellement en finally) : un throw
  // dans fn remonte au seul appelant fautif sans casser la chaîne des suivants.
  const tails = new Map<string, Promise<void>>()

  const lock = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const prev = tails.get(key) ?? Promise.resolve()
    let release!: () => void
    const tail = new Promise<void>((resolve) => { release = resolve })
    // Inscription SYNCHRONE (avant tout await) : c'est elle qui garantit l'ordre FIFO.
    tails.set(key, tail)
    await prev
    try {
      return await fn()
    } finally {
      release()
      // Nettoyage : si personne ne s'est inscrit derrière nous, la chaîne est vide.
      if (tails.get(key) === tail) tails.delete(key)
    }
  }

  return Object.assign(lock, { size: () => tails.size })
}

/** Instance partagée du service (une seule par process — cf. limite assumée ci-dessus). */
export const withLock: KeyedLock = createKeyedLock()
