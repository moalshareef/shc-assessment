import type { User } from '@supabase/supabase-js'
import type { ViewName } from '../../app/types'
import type { CurrentOperationalAccess } from '../../types/platformUserAccess'

export interface UserIdentity {
  fullName: string
  email: string
  roleLabel: string
  workspaceLabel: string
  initials: string
}

export function userIdentityContextLabel(identity: Pick<UserIdentity, 'roleLabel' | 'workspaceLabel'>) {
  return `${identity.roleLabel} · ${identity.workspaceLabel}`
}

interface BuildUserIdentityInput {
  user: User
  activeView: ViewName
  operationalAccess: CurrentOperationalAccess[]
  isSystemOwner: boolean
}

function workspaceCodeForView(activeView: ViewName) {
  if (activeView === 'home') return 'financial-control'
  if (activeView === 'pillars' || activeView === 'pillarDetail') return 'spending-efficiency'
  return null
}

export function operationalRoleLabel(roleCode: string | null, workspaceCode: string | null) {
  if (['financial_control_manager', 'manager'].includes(roleCode ?? '')) return 'مدير الرقابة'
  if (['financial_control_employee', 'action_owner', 'specialist', 'employee'].includes(roleCode ?? '')) return 'موظف متابعة'
  if (roleCode === 'owner') return 'مالك مساحة العمل'
  if (workspaceCode === 'spending-efficiency' && roleCode?.includes('manager')) return 'مدير مساحة العمل'
  if (workspaceCode === 'spending-efficiency' && roleCode) return 'موظف مساحة العمل'
  return 'مستخدم مصرح'
}

function displayName(user: User) {
  const metadata = user.user_metadata as Record<string, unknown>
  const candidate = [metadata.full_name, metadata.name, metadata.display_name]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
  return candidate?.trim() || user.email?.split('@')[0] || 'مستخدم المنصة'
}

function initialsFor(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return words.slice(0, 2).map((word) => word[0]).join('') || 'م'
}

export function buildUserIdentity({ user, activeView, operationalAccess, isSystemOwner }: BuildUserIdentityInput): UserIdentity {
  const requestedWorkspaceCode = workspaceCodeForView(activeView)
  const currentAccess = requestedWorkspaceCode
    ? operationalAccess.find((access) => access.workspaceCode === requestedWorkspaceCode) ?? null
    : operationalAccess.length === 1 ? operationalAccess[0] : null
  const fullName = displayName(user)
  const workspaceLabel = activeView === 'platformAdmin'
    ? 'الإدارة المركزية'
    : activeView === 'workspace' || (activeView === 'home' && !currentAccess)
      ? 'مساحات العمل'
      : currentAccess?.workspaceName
        || (requestedWorkspaceCode === 'spending-efficiency' ? 'ركائز كفاءة الإنفاق' : 'تقرير الكفاءة الرقابية')

  return {
    fullName,
    email: user.email ?? 'غير متاح',
    roleLabel: isSystemOwner ? 'مالك النظام' : operationalRoleLabel(currentAccess?.roleCode ?? null, currentAccess?.workspaceCode ?? requestedWorkspaceCode),
    workspaceLabel,
    initials: initialsFor(fullName),
  }
}
