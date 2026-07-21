import type {
  FinancialControlFinding,
  FinancialControlFollowUp,
  FinancialControlOrganization,
  FinancialControlProfile,
} from '../../types/financialControl'

export const followUpTypeLabels = {
  reminder: 'تذكير الإدارة',
  employee_direction: 'توجيه الموظف',
} as const

export const followUpStatusLabels = {
  open: 'مفتوحة',
  completed: 'منجزة',
  cancelled: 'ملغاة',
} as const

export const followUpPriorityLabels = {
  normal: 'عادية',
  urgent: 'عاجلة',
} as const

export interface UpcomingFollowUpItem {
  followUp: FinancialControlFollowUp
  organizationLabel: string
  findingLabel: string
  responsibleLabel: string
}

export function buildUpcomingFollowUps(
  followUps: FinancialControlFollowUp[],
  findings: Array<Pick<FinancialControlFinding, 'id' | 'reference_code' | 'title' | 'official_owner_label'>>,
  profiles: FinancialControlProfile[],
  organizations: FinancialControlOrganization[],
): UpcomingFollowUpItem[] {
  const findingsById = new Map(findings.map((finding) => [finding.id, finding]))
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile.full_name]))
  const organizationsById = new Map(organizations.map((organization) => [organization.id, organization.organization_name_ar]))

  return followUps
    .filter((followUp) => followUp.status === 'open')
    .map((followUp) => {
      const finding = findingsById.get(followUp.finding_id)
      return {
        followUp,
        organizationLabel: followUp.target_organization_id
          ? organizationsById.get(followUp.target_organization_id) ?? finding?.official_owner_label ?? 'غير متاح'
          : finding?.official_owner_label ?? 'غير متاح',
        findingLabel: finding ? `${finding.reference_code} — ${finding.title}` : 'ملاحظة غير متاحة',
        responsibleLabel: followUp.target_user_id
          ? profilesById.get(followUp.target_user_id) ?? 'مستخدم مسجل'
          : profilesById.get(followUp.created_by) ?? 'المدير المنشئ',
      }
    })
    .sort((first, second) => {
      if (!first.followUp.due_at && !second.followUp.due_at) return Date.parse(first.followUp.created_at) - Date.parse(second.followUp.created_at)
      if (!first.followUp.due_at) return 1
      if (!second.followUp.due_at) return -1
      return Date.parse(first.followUp.due_at) - Date.parse(second.followUp.due_at)
    })
}

export function reminderSummary(followUps: FinancialControlFollowUp[]) {
  const reminders = followUps
    .filter((followUp) => followUp.follow_up_type === 'reminder')
    .sort((first, second) => Date.parse(second.created_at) - Date.parse(first.created_at))
  return { count: reminders.length, latest: reminders[0] ?? null }
}

export function employeeDirectionsForUser(
  followUps: FinancialControlFollowUp[],
  userId: string | null,
) {
  if (!userId) return []
  return followUps
    .filter((followUp) => followUp.follow_up_type === 'employee_direction' && followUp.target_user_id === userId)
    .sort((first, second) => Date.parse(second.created_at) - Date.parse(first.created_at))
}
