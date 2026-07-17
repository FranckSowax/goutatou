import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

// Zone Campagnes masquée en attendant son redesign (cf. campagnes/page.tsx). Le détail reste
// dans `detail.tsx` pour le futur redesign ; l'accès direct est renvoyé vers Statuts.
export default async function CampagneDetailPage() {
  redirect('/app/marketing/statuts')
}
