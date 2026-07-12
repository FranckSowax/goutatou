'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { updatePlan, updateRestaurantProfile } from './actions'

export type GeneralTabRestaurant = {
  id: string
  name: string
  address: string | null
  contact_phone: string | null
  hours_text: string | null
  delivery_info: string | null
  drive_enabled: boolean
  location_lat: number | null
  location_lng: number | null
}

export type GeneralTabSubscription = {
  plan: string
  status: string
}

function errorMessage(_e: unknown, fallback: string): string {
  // Next redige les messages d'erreur des Server Actions en prod (texte
  // anglais générique) : on affiche TOUJOURS le message FR fixe.
  return fallback
}

export function GeneralTab({
  restaurant,
  subscription,
}: {
  restaurant: GeneralTabRestaurant
  subscription: GeneralTabSubscription
}) {
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileSaved, setProfileSaved] = useState(false)

  const gpsDefaultValue =
    restaurant.location_lat != null && restaurant.location_lng != null
      ? `${restaurant.location_lat}, ${restaurant.location_lng}`
      : ''

  const [planError, setPlanError] = useState<string | null>(null)
  const [planSaving, setPlanSaving] = useState(false)
  const [planSaved, setPlanSaved] = useState(false)

  async function handleProfileSubmit(formData: FormData) {
    setProfileSaving(true)
    setProfileError(null)
    setProfileSaved(false)
    try {
      await updateRestaurantProfile(restaurant.id, formData)
      setProfileSaved(true)
    } catch (e) {
      setProfileError(errorMessage(e, "Impossible d'enregistrer la fiche du restaurant."))
    } finally {
      setProfileSaving(false)
    }
  }

  async function handlePlanSubmit(formData: FormData) {
    setPlanSaving(true)
    setPlanError(null)
    setPlanSaved(false)
    try {
      await updatePlan(restaurant.id, formData)
      setPlanSaved(true)
    } catch (e) {
      setPlanError(errorMessage(e, "Impossible de mettre à jour l'abonnement."))
    } finally {
      setPlanSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Card className="rounded-2xl p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="font-display text-base">Fiche pratique</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {profileError && (
            <div
              role="alert"
              className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {profileError}
            </div>
          )}
          <form action={handleProfileSubmit} className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="gen-name">Nom du restaurant</Label>
              <Input id="gen-name" name="name" required defaultValue={restaurant.name} />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="gen-address">Adresse</Label>
              <Input id="gen-address" name="address" defaultValue={restaurant.address ?? ''} placeholder="Adresse" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-phone">Téléphone</Label>
              <Input
                id="gen-phone"
                name="contact_phone"
                defaultValue={restaurant.contact_phone ?? ''}
                placeholder="Téléphone"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-hours">Horaires</Label>
              <Input id="gen-hours" name="hours_text" defaultValue={restaurant.hours_text ?? ''} placeholder="Horaires" />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="gen-delivery">Livraison</Label>
              <Textarea
                id="gen-delivery"
                name="delivery_info"
                defaultValue={restaurant.delivery_info ?? ''}
                placeholder="Zones et frais de livraison"
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="gen-gps">Position GPS (lat, lng)</Label>
              <Input
                id="gen-gps"
                name="location_gps"
                defaultValue={gpsDefaultValue}
                placeholder="0.3901, 9.4544"
              />
              <p className="text-xs text-muted-foreground">
                Sur Google Maps : clic droit sur le restaurant → copier les coordonnées, puis
                collez ici.
              </p>
            </div>
            <Label className="flex w-fit items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                name="drive_enabled"
                defaultChecked={restaurant.drive_enabled}
                className="size-4 accent-primary"
              />
              Retrait sur place (drive) activé
            </Label>
            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={profileSaving}>
                {profileSaving ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
              {profileSaved && !profileSaving && (
                <span className="text-sm text-muted-foreground">Enregistré.</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="rounded-2xl p-4">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="font-display text-base">Abonnement</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {planError && (
            <div
              role="alert"
              className="mb-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {planError}
            </div>
          )}
          <form action={handlePlanSubmit} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-plan">Plan</Label>
              <Select name="plan" defaultValue={subscription.plan}>
                <SelectTrigger id="gen-plan" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="starter">Starter</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                  <SelectItem value="premium">Premium</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gen-status">Statut</Label>
              <Select name="status" defaultValue={subscription.status}>
                <SelectTrigger id="gen-status" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Actif</SelectItem>
                  <SelectItem value="past_due">Impayé</SelectItem>
                  <SelectItem value="canceled">Résilié</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={planSaving}>
              {planSaving ? 'Enregistrement…' : 'Mettre à jour'}
            </Button>
            {planSaved && !planSaving && (
              <span className="text-sm text-muted-foreground">Enregistré.</span>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
