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

export interface SupabasePillar {
  id: string
  name: string
  code: string | null
  description: string | null
  sort_order: number | null
  workspace_id: string | null
}

export interface PillarDetailData {
  subPillars: Array<{ id: string; name: string; code: string | null; description: string | null; source_page: string | null }>
  questions: Array<{ id: string; sub_pillar_id: string; question_text: string; code: string | null; source_page: string | null }>
  requirements: Array<{ id: string; question_id: string; code: string | null; canonical_code: string | null; title: string | null; official_text: string | null; source_page: string | null; status: string | null; progress: number | null; due_date: string | null; evidence_status: string | null }>
}
