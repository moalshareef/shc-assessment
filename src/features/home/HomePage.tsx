import { FinancialControlPage } from '../financial-control/FinancialControlPage'

interface HomePageProps {
  onOpenWorkspace: () => void
}

export function HomePage({ onOpenWorkspace }: HomePageProps) {
  return <FinancialControlPage onOpenWorkspace={onOpenWorkspace} />
}

