import type { ReactNode } from 'react'
import { MarketingTabs } from './marketing-tabs'

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pt-6">
      <div className="mx-auto max-w-3xl px-6">
        <MarketingTabs />
      </div>
      {children}
    </div>
  )
}
