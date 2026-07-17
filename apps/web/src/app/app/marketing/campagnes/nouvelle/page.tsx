import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Zone Campagnes masquée en attendant son redesign (cf. campagnes/page.tsx). Le formulaire
// reste dans `form.tsx` pour le futur redesign ; l'accès direct est renvoyé vers Statuts.
export default async function NouvelleCampagnePage() {
  redirect('/app/marketing/statuts')
}
