export interface PlatformAdminAccount {
  email: string
  fullName: string
  isActive: boolean
}

export interface PlatformAdminCounts {
  modules: number
  organizations: number
  roleAssignments: number
}

export interface PlatformAdminOverview {
  account: PlatformAdminAccount
  counts: PlatformAdminCounts
  modules: PlatformModule[]
  organizations: PlatformOrganization[]
}

export type PlatformModuleStatus = 'draft' | 'active' | 'disabled'

export interface PlatformModule {
  id: string
  moduleCode: string
  moduleNameAr: string
  description: string | null
  moduleStatus: PlatformModuleStatus
  createdAt: string
  updatedAt: string
  lockVersion: number
  disabledReason: string | null
}

export interface CreatePlatformModuleInput {
  moduleCode: string
  moduleNameAr: string
  description?: string
}

export interface UpdatePlatformModuleInput {
  moduleId: string
  moduleCode: string
  moduleNameAr: string
  description?: string
  expectedLockVersion: number
}

export interface ChangePlatformModuleStatusInput {
  moduleId: string
  newStatus: PlatformModuleStatus
  disabledReason?: string
  expectedLockVersion: number
}

export type PlatformOrganizationStatus = 'draft' | 'active' | 'disabled'
export type PlatformOrganizationType = 'secretariat' | 'center' | 'department' | 'other'

export interface PlatformOrganization {
  id: string
  organizationCode: string
  organizationNameAr: string
  organizationType: PlatformOrganizationType
  description: string | null
  status: PlatformOrganizationStatus
  disabledReason: string | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
  lockVersion: number
}

export interface CreatePlatformOrganizationInput {
  organizationCode: string
  organizationNameAr: string
  organizationType: PlatformOrganizationType
  description?: string
}

export interface UpdatePlatformOrganizationInput {
  organizationId: string
  organizationCode: string
  organizationNameAr: string
  organizationType: PlatformOrganizationType
  description?: string
  expectedLockVersion: number
}

export interface ChangePlatformOrganizationStatusInput {
  organizationId: string
  newStatus: PlatformOrganizationStatus
  disabledReason?: string
  expectedLockVersion: number
}
