export type PillarStatus = 'لم يبدأ' | 'قيد التنفيذ' | 'مكتمل' | 'متأخر' | 'متوقف'

export type EvidenceStatus = 'غير مطلوب' | 'غير مرفوع' | 'مرفوع' | 'تحت المراجعة' | 'معتمد' | 'مرفوض'

export interface SpendingRequirement {
  id: string
  pillarId: string
  code: string
  title: string
  description: string
  responsibleDepartment: string
  responsiblePerson: string
  status: PillarStatus
  progress: number
  startDate: string
  dueDate: string
  lastUpdate: string
  notes: string
  evidenceStatus: EvidenceStatus
}

export interface SpendingPillar {
  id: string
  code: string
  name: string
  description: string
  ownerDepartment: string
  ownerName: string
  status: PillarStatus
  progress: number
  totalRequirements: number
  completedRequirements: number
  dueDate: string
  lastUpdate: string
  requirements: SpendingRequirement[]
}
