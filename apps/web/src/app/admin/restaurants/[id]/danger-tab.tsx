'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { deleteRestaurant } from './actions'

function errorMessage(_e: unknown, fallback: string): string {
  // Next redige les messages d'erreur des Server Actions en prod (texte
  // anglais générique) : on affiche TOUJOURS le message FR fixe.
  return fallback
}

export function DangerTab({ restaurantId, restaurantName }: { restaurantId: string; restaurantName: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)

  const canDelete = confirmName.trim() === restaurantName

  async function handleDelete() {
    if (!canDelete) return
    setDeleting(true)
    setError(null)
    try {
      await deleteRestaurant(restaurantId)
      router.push('/admin/restaurants')
    } catch (e) {
      setError(errorMessage(e, 'Impossible de supprimer le restaurant.'))
      setDeleting(false)
    }
  }

  return (
    <Card className="rounded-2xl border-destructive/40 p-4">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="font-display text-base text-destructive">Zone de danger</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 px-0">
        <p className="text-sm text-muted-foreground">
          Supprime définitivement <strong>{restaurantName}</strong> et toutes ses données (menu, commandes,
          canal WhatsApp, landing page, fidélité). Cette action est irréversible.
        </p>

        <Dialog
          open={open}
          onOpenChange={(next) => {
            setOpen(next)
            if (!next) {
              setConfirmName('')
              setError(null)
            }
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="destructive" className="self-start">
              Supprimer ce restaurant
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Supprimer {restaurantName} ?</DialogTitle>
              <DialogDescription>
                Cette action supprime définitivement le restaurant et toutes ses données. Tapez{' '}
                <strong>{restaurantName}</strong> pour confirmer.
              </DialogDescription>
            </DialogHeader>

            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirm-delete-name">Nom du restaurant</Label>
              <Input
                id="confirm-delete-name"
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                placeholder={restaurantName}
                autoFocus
              />
            </div>

            <Button type="button" variant="destructive" disabled={!canDelete || deleting} onClick={handleDelete}>
              {deleting ? 'Suppression…' : 'Supprimer définitivement'}
            </Button>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  )
}
