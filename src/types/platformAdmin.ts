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
