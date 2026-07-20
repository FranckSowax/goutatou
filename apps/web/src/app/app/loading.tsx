// Squelette de navigation du tableau de bord : spinner discret centré, tokens du thème.
export default function AppLoading() {
  return (
    <div role="status" aria-label="Chargement" className="flex min-h-[50vh] items-center justify-center">
      <span className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}
