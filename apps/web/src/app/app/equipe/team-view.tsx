'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TeamMember } from './team-data'
import { inviteStaff, removeStaff, resendStaffLink, setStaffRole } from './actions'

/** Date FR courte (ex. « 17 juil. 2026 ») ou « — » si absente. */
function formatDateFr(iso: string | null): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  )
}

type Feedback = { kind: 'ok' | 'err'; text: string; link?: string } | null

function InviteForm() {
  const [pending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<Feedback>(null)

  function onSubmit(formData: FormData) {
    setFeedback(null)
    startTransition(async () => {
      try {
        const result = await inviteStaff(formData)
        setFeedback(
          result.whatsappSent
            ? { kind: 'ok', text: 'Invitation envoyée par WhatsApp.' }
            : {
                kind: 'ok',
                text: "L'envoi WhatsApp a échoué — copiez le lien d'activation ci-dessous et transmettez-le à l'employé.",
                link: result.link,
              },
        )
      } catch (e) {
        setFeedback({ kind: 'err', text: e instanceof Error ? e.message : 'Invitation impossible — réessayez.' })
      }
    })
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4">
      <div>
        <h2 className="font-display text-lg font-semibold">Inviter un employé</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          L&apos;employé reçoit un lien d&apos;activation par WhatsApp, puis se connecte avec son numéro et
          son mot de passe.
        </p>
      </div>
      <form action={onSubmit} className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="staff-name">Nom</Label>
          <Input id="staff-name" name="name" placeholder="Nom de l'employé" className="min-h-11" />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="staff-phone">Numéro WhatsApp</Label>
          <Input
            id="staff-phone"
            name="phone"
            inputMode="tel"
            required
            placeholder="077000000"
            className="min-h-11"
          />
        </div>
        <Button type="submit" disabled={pending} className="min-h-11 sm:w-auto">
          {pending ? 'Envoi…' : 'Inviter'}
        </Button>
      </form>
      {feedback && (
        <div className={cn('text-sm', feedback.kind === 'ok' ? 'text-success' : 'text-destructive')}>
          <p>{feedback.text}</p>
          {feedback.link && (
            <p className="mt-1 break-all rounded-xl bg-accent p-2 font-mono text-xs text-foreground">
              {feedback.link}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

function MemberCard({ member, selfUserId }: { member: TeamMember; selfUserId: string }) {
  const [pending, startTransition] = useTransition()
  const [message, setMessage] = useState<Feedback>(null)

  const isSelf = member.userId === selfUserId
  const isOwner = member.role === 'owner'

  function run(fn: () => Promise<unknown>) {
    setMessage(null)
    startTransition(async () => {
      try {
        await fn()
      } catch (e) {
        setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Action impossible — réessayez.' })
      }
    })
  }

  function onResend() {
    setMessage(null)
    startTransition(async () => {
      try {
        const result = await resendStaffLink(member.userId)
        setMessage(
          result.whatsappSent
            ? { kind: 'ok', text: 'Lien renvoyé par WhatsApp.' }
            : { kind: 'ok', text: "L'envoi WhatsApp a échoué — copiez le lien ci-dessous.", link: result.link },
        )
      } catch (e) {
        setMessage({ kind: 'err', text: e instanceof Error ? e.message : 'Action impossible — réessayez.' })
      }
    })
  }

  function onRemove() {
    if (!window.confirm(`Retirer ${member.displayName || 'cet employé'} de l'équipe ?`)) return
    run(() => removeStaff(member.userId))
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 font-medium text-foreground">
            <span className="truncate">{member.displayName || 'Employé'}</span>
            {isSelf && <span className="text-xs text-muted-foreground">(vous)</span>}
          </p>
          {member.phone && <p className="truncate font-mono text-xs text-muted-foreground">{member.phone}</p>}
        </div>
        {isOwner ? (
          <Badge className="bg-primary/10 text-primary">Patron</Badge>
        ) : (
          <Badge variant="secondary">Employé</Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground">Ajouté le {formatDateFr(member.createdAt)}</p>

      {!isSelf && (
        <div className="flex flex-wrap gap-2">
          {!isOwner && (
            <>
              <Button type="button" variant="outline" size="sm" className="min-h-11" disabled={pending} onClick={onResend}>
                Renvoyer le lien
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-11"
                disabled={pending}
                onClick={() => run(() => setStaffRole(member.userId, 'owner'))}
              >
                Promouvoir en patron
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="min-h-11"
                disabled={pending}
                onClick={onRemove}
              >
                Retirer
              </Button>
            </>
          )}
          {isOwner && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="min-h-11"
              disabled={pending}
              onClick={() => run(() => setStaffRole(member.userId, 'staff'))}
            >
              Rétrograder en employé
            </Button>
          )}
        </div>
      )}

      {message && (
        <div className={cn('text-sm', message.kind === 'ok' ? 'text-success' : 'text-destructive')}>
          <p>{message.text}</p>
          {message.link && (
            <p className="mt-1 break-all rounded-xl bg-accent p-2 font-mono text-xs text-foreground">
              {message.link}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export function TeamView({ members, selfUserId }: { members: TeamMember[]; selfUserId: string }) {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="font-display text-2xl font-semibold">Équipe</h1>

      <InviteForm />

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold">Membres</h2>
        {members.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Aucun membre pour le moment.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li key={m.userId}>
                <MemberCard member={m} selfUserId={selfUserId} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
