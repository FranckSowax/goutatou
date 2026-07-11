'use client'

import { useState, useTransition } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { updateMyRestaurantProfile } from './actions'

type PracticalInfoFormProps = {
  address: string | null
  contactPhone: string | null
  hoursText: string | null
  deliveryInfo: string | null
}

export function PracticalInfoForm({ address, contactPhone, hoursText, deliveryInfo }: PracticalInfoFormProps) {
  const [pending, startTransition] = useTransition()
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null)

  function handleSubmit(formData: FormData) {
    setResult(null)
    startTransition(async () => {
      try {
        await updateMyRestaurantProfile(formData)
        setResult({ ok: true, message: 'Fiche enregistrée.' })
      } catch {
        // Next redige les messages d'erreur des Server Actions en prod (texte
        // anglais générique) : on affiche TOUJOURS le message FR fixe.
        setResult({ ok: false, message: 'Enregistrement impossible.' })
      }
    })
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="address">Adresse</Label>
        <Input id="address" name="address" defaultValue={address ?? ''} placeholder="Adresse du restaurant" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contact_phone">Téléphone de contact</Label>
        <Input id="contact_phone" name="contact_phone" defaultValue={contactPhone ?? ''} placeholder="Téléphone de contact" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="hours_text">Horaires</Label>
        <Textarea id="hours_text" name="hours_text" defaultValue={hoursText ?? ''} placeholder="Lun-Ven : 11h-22h…" />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="delivery_info">Livraison</Label>
        <Textarea id="delivery_info" name="delivery_info" defaultValue={deliveryInfo ?? ''} placeholder="Zones, frais, délais…" />
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="w-fit">
          Enregistrer
        </Button>
        {result && <Badge variant={result.ok ? 'success' : 'destructive'}>{result.message}</Badge>}
      </div>
    </form>
  )
}
