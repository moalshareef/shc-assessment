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
export const invitePlatformUser = api.inviteUser
export const suspendPlatformUser = api.suspendUser
export const activatePlatformUser = api.activateUser

export async function currentProfileIsActive() {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return false
  const { data, error } = await supabase.from('profiles').select('is_active').eq('id', userData.user.id).single()
  if (error) throw error
  return data.is_active === true
}
