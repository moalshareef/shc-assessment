export type OperationalRoleCode = 'financial_control_employee' | 'financial_control_manager'
export type OperationalAccessScope = 'assigned_records' | 'organization_records' | 'all_records'
export type OperationalAccessStatus = 'scheduled' | 'active' | 'expired' | 'revoked'

export interface PlatformUserAccess {
  id: string
  userId: string
  email: string
  fullName: string
  workspaceId: string
  workspaceCode: string
  workspaceName: string
  moduleId: string | null
  organizationId: string
  organizationNameAr: string
  roleCode: OperationalRoleCode
  accessScope: OperationalAccessScope
  status: OperationalAccessStatus
  startsAt: string
  endsAt: string | null
  createdAt: string
  updatedAt: string
  lockVersion: number
}

export interface OperationalWorkspace {
  id: string
  code: string
  name: string
  status: string
}

export interface CurrentOperationalAccess {
  workspaceId: string
  workspaceCode: string
  workspaceName: string
  organizationId: string | null
  roleCode: string
  accessScope: OperationalAccessScope
  source: 'central' | 'legacy_financial_control' | 'legacy_workspace'
}

export interface GrantPlatformUserAccessInput {
  userId: string
  workspaceId: string
  organizationId: string
  roleCode: OperationalRoleCode
  accessScope: OperationalAccessScope
  startsAt?: string
  endsAt?: string
}

export interface UpdatePlatformUserAccessInput {
  accessId: string
  roleCode: OperationalRoleCode
  accessScope: OperationalAccessScope
  startsAt: string
  endsAt?: string
  expectedLockVersion: number
}
