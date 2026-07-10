import { redirect } from 'next/navigation'

// Pas de page d'accueil produit : l'entrée est le login (les LP publiques
// vivent sur /r/<slug> ou leur sous-domaine via le middleware).
export default function Home() {
  redirect('/login')
}
