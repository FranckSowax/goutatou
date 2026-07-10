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
import { createPrize, deletePrize, togglePrizeActive, updatePrize } from './actions'

export function Prizes({ prizes }: { prizes: WheelPrize[] }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold">Lots de la roue</h2>
      <Card className="rounded-2xl p-4">
        {prizes.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
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
