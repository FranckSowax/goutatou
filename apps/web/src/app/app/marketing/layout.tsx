import type { ReactNode } from 'react'
import { MarketingTabs } from './marketing-tabs'

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <MarketingTabs />
      {children}
    </div>
  )
}
