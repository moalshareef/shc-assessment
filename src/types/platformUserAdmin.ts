export type PlatformUserProfileStatus = 'active' | 'suspended'
export type PlatformInvitationStatus = 'draft' | 'sent' | 'accepted' | 'active' | 'expired' | 'cancelled' | null

export interface PlatformAdminUser {
  userId: string
  email: string
  fullName: string
  profileStatus: PlatformUserProfileStatus
  emailConfirmed: boolean
  invitedAt: string | null
  invitationStatus: PlatformInvitationStatus
  invitationSyncStatus: 'pending' | 'complete' | 'failed' | null
  lastSignInAt: string | null
  primaryOrganizationId: string | null
  primaryOrganizationName: string | null
  createdAt: string
}

export interface InvitePlatformUserInput {
  email: string
  fullName: string
  primaryOrganizationId: string
}

export interface PlatformUserAdminResult {
  userId: string
  profileStatus?: PlatformUserProfileStatus
  invitationId?: string
  status?: string
}
