'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { addLivreur, updateLivreur, toggleLivreurActive } from './actions'

export type Livreur = { id: string; name: string; phone: string; active: boolean }

export function LivreursForm({ livreurs }: { livreurs: Livreur[] }) {
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)

  function run(fn: () => Promise<void>, onDone?: () => void) {
    setError(null)
    startTransition(async () => {
      try {
        await fn()
        onDone?.()
      } catch {
        setError('Action impossible — vérifiez le nom et le numéro (ex. 077000000).')
      }
    })
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Ajout */}
      <form
        action={(fd) => run(() => addLivreur(fd), () => (document.getElementById('livreur-add') as HTMLFormElement)?.reset())}
        id="livreur-add"
        className="flex flex-col gap-2 sm:flex-row"
      >
        <Input name="name" placeholder="Nom du livreur" required className="min-h-11 flex-1" />
        <Input name="phone" placeholder="Numéro WhatsApp" inputMode="tel" required className="min-h-11 flex-1" />
        <Button type="submit" disabled={pending} className="min-h-11">Ajouter</Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Liste */}
      {livreurs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun livreur enregistré pour le moment.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {livreurs.map((l) =>
            editing === l.id ? (
              <li key={l.id} className="p-3">
                <form
                  action={(fd) => run(() => updateLivreur(l.id, fd), () => setEditing(null))}
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <Input name="name" defaultValue={l.name} required className="min-h-11 flex-1" />
                  <Input name="phone" defaultValue={l.phone} inputMode="tel" required className="min-h-11 flex-1" />
                  <div className="flex gap-2">
                    <Button type="submit" disabled={pending} className="min-h-11">Enregistrer</Button>
                    <Button type="button" variant="ghost" className="min-h-11" onClick={() => setEditing(null)}>
                      Annuler
                    </Button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 truncate font-medium">
                    {l.name}
                    {!l.active && <Badge variant="secondary">Inactif</Badge>}
                  </p>
                  <p className="truncate font-mono text-xs text-muted-foreground">{l.phone}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" className="min-h-11" onClick={() => setEditing(l.id)}>
                    Modifier
                  </Button>
                  <Button
                    variant={l.active ? 'ghost' : 'default'}
                    className="min-h-11"
                    disabled={pending}
                    onClick={() => run(() => toggleLivreurActive(l.id, !l.active))}
                  >
                    {l.active ? 'Désactiver' : 'Activer'}
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}
