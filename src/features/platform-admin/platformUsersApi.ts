import type { InvitePlatformUserInput, PlatformAdminUser, PlatformUserAdminResult } from '../../types/platformUserAdmin'

export interface PlatformUserAdminInvoker {
  (body: Record<string, unknown>): Promise<{ data: unknown; error: { message: string; context?: unknown } | null }>
}

function mapUser(value: unknown): PlatformAdminUser {
  const row = value as Record<string, unknown>
  return {
    userId: String(row.user_id ?? ''), email: String(row.email ?? ''), fullName: String(row.full_name ?? ''),
    profileStatus: row.profile_status === 'suspended' ? 'suspended' : 'active',
    emailConfirmed: row.email_confirmed === true,
    invitedAt: typeof row.invited_at === 'string' ? row.invited_at : null,
    invitationStatus: typeof row.invitation_status === 'string' ? row.invitation_status as PlatformAdminUser['invitationStatus'] : null,
    invitationSyncStatus: typeof row.invitation_sync_status === 'string' ? row.invitation_sync_status as PlatformAdminUser['invitationSyncStatus'] : null,
    lastSignInAt: typeof row.last_sign_in_at === 'string' ? row.last_sign_in_at : null,
    primaryOrganizationId: typeof row.primary_organization_id === 'string' ? row.primary_organization_id : null,
    primaryOrganizationName: typeof row.primary_organization_name === 'string' ? row.primary_organization_name : null,
    createdAt: String(row.created_at ?? ''),
  }
}

function messageFromError(error: { message: string; context?: unknown }) {
  const context = error.context as { json?: () => Promise<{ message?: string }> } | undefined
  return context?.json ? context.json().then((body) => body.message || error.message).catch(() => error.message) : Promise.resolve(error.message)
}

export function createPlatformUsersApi(invoke: PlatformUserAdminInvoker, verifyOwner: () => Promise<boolean>) {
  async function call(body: Record<string, unknown>) {
    if (!await verifyOwner()) throw new Error('لا تملك صلاحية مالك النظام لتنفيذ هذه العملية.')
    const { data, error } = await invoke(body)
    if (error) throw new Error(await messageFromError(error))
    return data as Record<string, unknown>
  }
  return {
    async listUsers() {
      const data = await call({ action: 'list_users' })
      return Array.isArray(data.users) ? data.users.map(mapUser) : []
    },
    async inviteUser(input: InvitePlatformUserInput) {
      const data = await call({ action: 'invite_user', email: input.email.trim().toLowerCase(), full_name: input.fullName.trim(), primary_organization_id: input.primaryOrganizationId })
      return data.result as PlatformUserAdminResult
    },
    async suspendUser(userId: string, reason: string) {
      const data = await call({ action: 'suspend_user', user_id: userId, reason: reason.trim() })
      return data.result as PlatformUserAdminResult
    },
    async activateUser(userId: string) {
      const data = await call({ action: 'activate_user', user_id: userId })
      return data.result as PlatformUserAdminResult
    },
  }
}
