import { supabase } from '../lib/supabase'
import { createPlatformUsersApi } from '../features/platform-admin/platformUsersApi'
import { currentUserIsSystemOwner } from './platformAdminService'

const api = createPlatformUsersApi(
  async (body) => {
    const { data, error } = await supabase.functions.invoke('platform-user-admin', { body })
    return { data, error }
  },
  currentUserIsSystemOwner,
)

export const listPlatformUsers = api.listUsers
export const createPlatformUser = api.createUser
export const resetPlatformUserPassword = api.resetUserPassword
export const invitePlatformUser = api.inviteUser
export const suspendPlatformUser = api.suspendUser
export const activatePlatformUser = api.activateUser

export async function currentProfileAccessState() {
  const { data, error } = await supabase.rpc('platform_current_user_access_state')
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return { isActive: row?.is_active === true, mustChangePassword: row?.must_change_password === true }
}

export async function changeOwnTemporaryPassword(newPassword: string) {
  const { data, error } = await supabase.functions.invoke('platform-user-admin', {
    body: { action: 'change_own_password', new_password: newPassword },
  })
  if (error) {
    const context = error.context as { json?: () => Promise<{ message?: string }> } | undefined
    const message = context?.json ? await context.json().then((body) => body.message || error.message).catch(() => error.message) : error.message
    throw new Error(message)
  }
  return data
}
