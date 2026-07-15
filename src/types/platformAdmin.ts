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
}
