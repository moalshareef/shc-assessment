import { supabase } from '../lib/supabase'
import type {
  PlatformAdminOverview,
  PlatformModule,
} from '../types/platformAdmin'
import {
  createPlatformModuleManagementApi,
  mapPlatformModule,
  type PlatformAdminRpcCaller,
} from '../features/platform-admin/platformModulesApi'

export { PlatformModuleConflictError } from '../features/platform-admin/platformModulesApi'

export class PlatformAdminSessionExpiredError extends Error {
  constructor() {
    super('انتهت جلسة المستخدم. يرجى تسجيل الدخول مرة أخرى.')
    this.name = 'PlatformAdminSessionExpiredError'
  }
}

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser()

  if (error || !data.user) {
    throw new PlatformAdminSessionExpiredError()
  }

  return data.user
}

const supabaseRpc: PlatformAdminRpcCaller = async (functionName, args) => {
  const { data, error } = await supabase.rpc(functionName, args)
  return { data, error }
}

export async function currentUserIsSystemOwner(): Promise<boolean> {
  await getCurrentUser()

  const { data, error } = await supabase.rpc('platform_current_user_has_role', {
    p_roles: ['system_owner'],
  })

  if (error) throw error
  return data === true
}

async function getVisibleRowCount(table: 'organizations' | 'platform_role_assignments') {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })

  if (error) throw error
  return count ?? 0
}

async function getVisibleModules(): Promise<PlatformModule[]> {
  const { data, error } = await supabase
    .from('platform_modules')
    .select('id, module_code, module_name_ar, description, module_status, created_at, updated_at, lock_version, disabled_reason')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map(mapPlatformModule)
}

export async function getPlatformAdminOverview(): Promise<PlatformAdminOverview | null> {
  const user = await getCurrentUser()

  const { data: hasRole, error: roleError } = await supabase.rpc('platform_current_user_has_role', {
    p_roles: ['system_owner'],
  })

  if (roleError) throw roleError
  if (hasRole !== true) return null

  const [profileResult, modules, organizations, roleAssignments] = await Promise.all([
    supabase
      .from('profiles')
      .select('full_name, is_active')
      .eq('id', user.id)
      .single(),
    getVisibleModules(),
    getVisibleRowCount('organizations'),
    getVisibleRowCount('platform_role_assignments'),
  ])

  if (profileResult.error) throw profileResult.error

  return {
    account: {
      email: user.email ?? 'غير متاح',
      fullName: profileResult.data.full_name || 'مالك النظام الرئيسي',
      isActive: profileResult.data.is_active === true,
    },
    counts: {
      modules: modules.length,
      organizations,
      roleAssignments,
    },
    modules,
  }
}

const platformModuleManagementApi = createPlatformModuleManagementApi(supabaseRpc, currentUserIsSystemOwner)

export const createPlatformModule = platformModuleManagementApi.createModule
export const updatePlatformModule = platformModuleManagementApi.updateModule
export const changePlatformModuleStatus = platformModuleManagementApi.changeModuleStatus
