'use client'

import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { createReward, deleteReward, reorderRewards, toggleReward, updateReward } from './actions'

export interface LoyaltyReward {
  id: string
  threshold: number
  label: string
  active: boolean
  position: number
}

/**
 * Onglet « Paliers » : CRUD des paliers de la carte de fidélité (seuil de commandes → lot).
 * Modèle de prizes.tsx, mais sans poids / stock / image. Le composant importe ses actions
 * serveur — jamais de fonction reçue en prop d'un Server Component.
 */
export function Rewards({ rewards }: { rewards: LoyaltyReward[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold">Paliers</h2>
      <Card className="rounded-2xl p-4">
        {rewards.length > 0 && (
          <>
            {/* ≥ md : tableau. */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ordre</TableHead>
                    <TableHead>Seuil</TableHead>
                    <TableHead>Lot</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rewards.map((reward, idx) => {
                    const updateFormId = `reward-update-${reward.id}`
                    return (
                      <TableRow key={reward.id}>
                        <TableCell>
                          <div className="flex gap-1">
                            <form action={reorderRewards.bind(null, reward.id, 'up')}>
                              <Button type="submit" size="sm" variant="outline" disabled={idx === 0} aria-label="Monter">
                                ↑
                              </Button>
                            </form>
                            <form action={reorderRewards.bind(null, reward.id, 'down')}>
                              <Button
                                type="submit"
                                size="sm"
                                variant="outline"
                                disabled={idx === rewards.length - 1}
                                aria-label="Descendre"
                              >
                                ↓
                              </Button>
                            </form>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Input
                              form={updateFormId}
                              name="threshold"
                              type="number"
                              min="1"
                              defaultValue={reward.threshold}
                              className="w-20"
                              aria-label="Seuil (commandes)"
                            />
                            <span className="whitespace-nowrap">commandes → lot</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Input
                            form={updateFormId}
                            name="label"
                            defaultValue={reward.label}
                            className={reward.active ? '' : 'line-through'}
                            aria-label="Libellé du lot"
                          />
                          {!reward.active && <Badge variant="muted" className="ml-2">Désactivé</Badge>}
                        </TableCell>
                        <TableCell className="text-right">
                          <form id={updateFormId} action={updateReward.bind(null, reward.id)} />
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button type="submit" form={updateFormId} size="sm" variant="outline">
                              Enregistrer
                            </Button>
                            <form action={toggleReward.bind(null, reward.id, !reward.active)}>
                              <Button type="submit" size="sm" variant="outline">
                                {reward.active ? 'Désactiver' : 'Activer'}
                              </Button>
                            </form>
                            <form action={deleteReward.bind(null, reward.id)}>
                              <Button type="submit" size="sm" variant="outline">
                                Suppr.
                              </Button>
                            </form>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* < md : une carte par palier. */}
            <div className="flex flex-col gap-3 md:hidden">
              {rewards.map((reward, idx) => {
                const updateFormId = `reward-update-mobile-${reward.id}`
                return (
                  <div key={reward.id} className="rounded-2xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className={reward.active ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>
                        {reward.threshold} commandes → {reward.label}
                      </span>
                      <div className="flex gap-1">
                        <form action={reorderRewards.bind(null, reward.id, 'up')}>
                          <Button type="submit" size="sm" variant="outline" disabled={idx === 0} aria-label="Monter">
                            ↑
                          </Button>
                        </form>
                        <form action={reorderRewards.bind(null, reward.id, 'down')}>
                          <Button
                            type="submit"
                            size="sm"
                            variant="outline"
                            disabled={idx === rewards.length - 1}
                            aria-label="Descendre"
                          >
                            ↓
                          </Button>
                        </form>
                      </div>
                    </div>
                    {!reward.active && <Badge variant="muted" className="mt-1">Désactivé</Badge>}

                    <form id={updateFormId} action={updateReward.bind(null, reward.id)} />
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`${updateFormId}-threshold`} className="text-xs text-muted-foreground">
                          Seuil
                        </Label>
                        <Input
                          id={`${updateFormId}-threshold`}
                          form={updateFormId}
                          name="threshold"
                          type="number"
                          min="1"
                          defaultValue={reward.threshold}
                          aria-label="Seuil (commandes)"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`${updateFormId}-label`} className="text-xs text-muted-foreground">
                          Lot
                        </Label>
                        <Input
                          id={`${updateFormId}-label`}
                          form={updateFormId}
                          name="label"
                          defaultValue={reward.label}
                          aria-label="Libellé du lot"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="submit" form={updateFormId} size="sm" variant="outline">
                        Enregistrer
                      </Button>
                      <form action={toggleReward.bind(null, reward.id, !reward.active)}>
                        <Button type="submit" size="sm" variant="outline">
                          {reward.active ? 'Désactiver' : 'Activer'}
                        </Button>
                      </form>
                      <form action={deleteReward.bind(null, reward.id)}>
                        <Button type="submit" size="sm" variant="outline">
                          Suppr.
                        </Button>
                      </form>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
        {rewards.length === 0 && <p className="text-sm text-muted-foreground">Aucun palier pour l’instant.</p>}

        <form action={createReward} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-reward-threshold">Seuil (commandes)</Label>
            <Input
              id="new-reward-threshold"
              name="threshold"
              required
              type="number"
              min="1"
              defaultValue={10}
              placeholder="10"
            />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="new-reward-label">Lot</Label>
            <Input id="new-reward-label" name="label" required placeholder="Un plat offert" />
          </div>
          <Button type="submit" className="sm:col-span-3">
            Ajouter le palier
          </Button>
        </form>
      </Card>
    </section>
  )
}
