import type { WheelPrize } from '@goutatou/db/types'
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
import { createPrize, deletePrize, togglePrizeActive, updatePrize, updatePrizeImage } from './actions'

export function Prizes({ prizes }: { prizes: WheelPrize[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold">Lots de la roue</h2>
      <Card className="rounded-2xl p-4">
        {prizes.length > 0 && (
          <>
            {/* ≥ md : tableau shadcn inchangé. */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Libellé</TableHead>
                    <TableHead>Poids</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prizes.map((prize) => {
                    const updateFormId = `prize-update-${prize.id}`
                    return (
                      <TableRow key={prize.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {prize.imageUrl ? (
                              <img
                                src={prize.imageUrl}
                                alt={prize.label}
                                className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
                                —
                              </div>
                            )}
                            <form
                              action={updatePrizeImage.bind(null, prize.id)}
                              className="flex items-center gap-1"
                            >
                              <input
                                type="file"
                                name="image"
                                accept="image/*"
                                aria-label={`Image pour ${prize.label}`}
                                className="w-28 text-xs text-muted-foreground file:mr-1 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
                              />
                              <Button type="submit" size="sm" variant="outline">
                                OK
                              </Button>
                            </form>
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={prize.active ? '' : 'text-muted-foreground line-through'}>
                            {prize.label}
                          </span>
                          {!prize.active && <Badge variant="muted" className="ml-2">Désactivé</Badge>}
                        </TableCell>
                        <TableCell>
                          <Input
                            form={updateFormId}
                            name="weight"
                            type="number"
                            min="1"
                            defaultValue={prize.weight}
                            className="w-16"
                            aria-label="Poids"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            form={updateFormId}
                            name="stock"
                            type="number"
                            defaultValue={prize.stock}
                            className="w-20"
                            aria-label="Stock (-1 = illimité)"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          {/* Formulaire sans enfants visibles : les champs Poids/Stock et le bouton
                              Enregistrer s'y rattachent via l'attribut form=, pour rester chacun
                              dans leur propre colonne du tableau. */}
                          <form id={updateFormId} action={updatePrize.bind(null, prize.id)} />
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button type="submit" form={updateFormId} size="sm" variant="outline">
                              Enregistrer
                            </Button>
                            <form action={togglePrizeActive.bind(null, prize.id, !prize.active)}>
                              <Button type="submit" size="sm" variant="outline">
                                {prize.active ? 'Désactiver' : 'Activer'}
                              </Button>
                            </form>
                            <form action={deletePrize.bind(null, prize.id)}>
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

            {/* < md : une carte par lot. */}
            <div className="flex flex-col gap-3 md:hidden">
              {prizes.map((prize) => {
                const updateFormId = `prize-update-mobile-${prize.id}`
                return (
                  <div key={prize.id} className="rounded-2xl border border-border p-3">
                    <div className="flex items-center gap-2">
                      {prize.imageUrl ? (
                        <img
                          src={prize.imageUrl}
                          alt={prize.label}
                          className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
                        />
                      ) : (
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-dashed border-border text-[10px] text-muted-foreground">
                          —
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <span className={prize.active ? 'font-medium' : 'font-medium text-muted-foreground line-through'}>
                          {prize.label}
                        </span>
                        {!prize.active && <Badge variant="muted" className="ml-2">Désactivé</Badge>}
                      </div>
                    </div>

                    <form
                      action={updatePrizeImage.bind(null, prize.id)}
                      className="mt-3 flex items-center gap-1"
                    >
                      <input
                        type="file"
                        name="image"
                        accept="image/*"
                        aria-label={`Image pour ${prize.label}`}
                        className="w-full min-w-0 text-xs text-muted-foreground file:mr-1 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
                      />
                      <Button type="submit" size="sm" variant="outline">
                        OK
                      </Button>
                    </form>

                    <form id={updateFormId} action={updatePrize.bind(null, prize.id)} />
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`${updateFormId}-weight`} className="text-xs text-muted-foreground">
                          Poids
                        </Label>
                        <Input
                          id={`${updateFormId}-weight`}
                          form={updateFormId}
                          name="weight"
                          type="number"
                          min="1"
                          defaultValue={prize.weight}
                          aria-label="Poids"
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={`${updateFormId}-stock`} className="text-xs text-muted-foreground">
                          Stock
                        </Label>
                        <Input
                          id={`${updateFormId}-stock`}
                          form={updateFormId}
                          name="stock"
                          type="number"
                          defaultValue={prize.stock}
                          aria-label="Stock (-1 = illimité)"
                        />
                      </div>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="submit" form={updateFormId} size="sm" variant="outline">
                        Enregistrer
                      </Button>
                      <form action={togglePrizeActive.bind(null, prize.id, !prize.active)}>
                        <Button type="submit" size="sm" variant="outline">
                          {prize.active ? 'Désactiver' : 'Activer'}
                        </Button>
                      </form>
                      <form action={deletePrize.bind(null, prize.id)}>
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
        {prizes.length === 0 && <p className="text-sm text-muted-foreground">Aucun lot pour l’instant.</p>}

        <form action={createPrize} className="mt-4 grid gap-3 border-t pt-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5 sm:col-span-3">
            <Label htmlFor="new-prize-label">Nom du lot</Label>
            <Input id="new-prize-label" name="label" required placeholder="Nom du lot" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-prize-weight">Poids</Label>
            <Input id="new-prize-weight" name="weight" required type="number" min="1" defaultValue={1} placeholder="Poids" />
          </div>
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="new-prize-stock">Stock (-1 = illimité)</Label>
            <Input id="new-prize-stock" name="stock" required type="number" defaultValue={-1} placeholder="Stock (-1 = illimité)" />
          </div>
          <Button type="submit" className="sm:col-span-3">
            Ajouter le lot
          </Button>
        </form>
      </Card>
    </section>
  )
}
