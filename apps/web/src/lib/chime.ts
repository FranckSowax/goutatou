// Cuisine Live — carillon Web Audio, générique et indépendant du design (aucune couleur, aucun DOM).
// Porté tel quel depuis la spec (docs/superpowers/specs/2026-07-13-cuisine-live-design.md).
// Aucun fichier audio chargé : tout est synthétisé, donc CSP-safe.
//
// Contrainte navigateur : un `AudioContext` démarre en `suspended` tant qu'aucun geste utilisateur
// n'a eu lieu sur la page. `ensureAudio` gère la reprise, mais c'est à l'appelant (CL2) de la
// déclencher sur un geste (ex. `document.addEventListener('click', ensureAudio)`) — ce module ne
// touche jamais au DOM lui-même.

type AudioContextCtor = typeof AudioContext

function getAudioContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  return (window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext) ?? null
}

let sharedCtx: AudioContext | null = null

/** Crée (ou reprend) l'AudioContext partagé. Ne casse jamais la page : retourne `null` si Web Audio
 *  est indisponible ou si quoi que ce soit échoue. */
export function ensureAudio(): AudioContext | null {
  try {
    const Ctor = getAudioContextCtor()
    if (!Ctor) return null
    if (!sharedCtx) sharedCtx = new Ctor()
    if (sharedCtx.state === 'suspended') {
      void sharedCtx.resume().catch(() => {})
    }
    return sharedCtx
  } catch {
    return null
  }
}

/** Joue une note double (carillon) : 880 Hz puis 1174,66 Hz (+0,15 s), enveloppe exponentielle
 *  d'environ 0,9 s. `t0` est un temps `AudioContext.currentTime`. */
export function chime(ctx: AudioContext, t0: number): void {
  try {
    const notes: Array<[frequency: number, start: number]> = [
      [880, t0],
      [1174.66, t0 + 0.15],
    ]
    for (const [frequency, start] of notes) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(0.16, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start)
      osc.stop(start + 0.95)
    }
  } catch {
    // Un navigateur/contexte défaillant ne doit jamais casser la page.
  }
}

let alertTimer: ReturnType<typeof setTimeout> | null = null

/** Déclenche 5 rappels du carillon espacés de 2 s, puis s'arrête seule. Idempotent : un appel
 *  annule d'abord tout rappel en cours (`stopAlert`). */
export function startAlert(): void {
  stopAlert()
  const ctx = ensureAudio()
  if (!ctx) return

  let count = 0
  const ring = () => {
    try {
      chime(ctx, ctx.currentTime)
    } catch {
      // idem : jamais bloquant.
    }
    count += 1
    if (count < 5) {
      alertTimer = setTimeout(ring, 2000)
    } else {
      alertTimer = null
    }
  }
  ring()
}

/** Annule le timer de rappels en cours (appelé à la fermeture de l'overlay). */
export function stopAlert(): void {
  if (alertTimer) {
    clearTimeout(alertTimer)
    alertTimer = null
  }
}
