import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Cadre commun d'une page outil Marketing : lien retour vers le hub, en-tête standard
 * (titre + description + action optionnelle), largeur homogène. Remplace les `<h1>` et
 * wrappers ad hoc de chaque page pour un agencement cohérent partout.
 */
export function MarketingFrame({
  title,
  description,
  action,
  backHref = '/app/marketing',
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  backHref?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Link
          href={backHref}
          className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Marketing
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-semibold">{title}</h1>
            {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      </div>
      {children}
    </div>
  )
}
