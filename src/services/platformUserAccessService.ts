import { supabase } from '../lib/supabase'
import { currentUserIsSystemOwner } from './platformAdminService'
import type {
  CurrentOperationalAccess,
  GrantPlatformUserAccessInput,
  OperationalWorkspace,
  PlatformUserAccess,
  UpdatePlatformUserAccessInput,
} from '../types/platformUserAccess'

export class PlatformUserAccessConflictError extends Error {
  constructor() {
    super('تم تعديل هذه الصلاحية من مستخدم آخر، تم تحديث البيانات، أعد المحاولة.')
    this.name = 'PlatformUserAccessConflictError'
  }
}

function mapAccess(row: Record<string, unknown>): PlatformUserAccess {
  return {
    id: String(row.id), userId: String(row.user_id), email: String(row.email ?? ''),
    fullName: String(row.full_name ?? ''), workspaceId: String(row.workspace_id),
    workspaceCode: String(row.workspace_code), workspaceName: String(row.workspace_name),
    moduleId: typeof row.module_id === 'string' ? row.module_id : null,
    organizationId: String(row.organization_id), organizationNameAr: String(row.organization_name_ar),
    roleCode: row.role_code as PlatformUserAccess['roleCode'],
    accessScope: row.access_scope as PlatformUserAccess['accessScope'],
    status: row.status as PlatformUserAccess['status'], startsAt: String(row.starts_at),
    endsAt: typeof row.ends_at === 'string' ? row.ends_at : null,
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    lockVersion: Number(row.lock_version),
  }
}

function mapCurrent(row: Record<string, unknown>): CurrentOperationalAccess {
  return {
    workspaceId: String(row.workspace_id), workspaceCode: String(row.workspace_code),
    workspaceName: String(row.workspace_name),
    organizationId: typeof row.organization_id === 'string' ? row.organization_id : null,
    roleCode: String(row.role_code),
    accessScope: row.access_scope as CurrentOperationalAccess['accessScope'],
    source: row.source as CurrentOperationalAccess['source'],
  }
}

async function requireOwner() {
  if (!await currentUserIsSystemOwner()) throw new Error('لا تملك صلاحية مالك النظام لتنفيذ هذه العملية.')
}

function throwRpcError(error: { code?: string; message?: string } | null, fallback: string): never {
  if (error?.code === '40001') throw new PlatformUserAccessConflictError()
  throw new Error(error?.message || fallback)
}

export async function listPlatformUserAccess(): Promise<PlatformUserAccess[]> {
  await requireOwner()
  const { data, error } = await supabase.rpc('platform_list_user_access')
  if (error) throwRpcError(error, 'تعذر تحميل الصلاحيات التشغيلية.')
  return (Array.isArray(data) ? data : []).map((row) => mapAccess(row as Record<string, unknown>))
}

export async function listOperationalWorkspaces(): Promise<OperationalWorkspace[]> {
  await requireOwner()
  const { data, error } = await supabase.rpc('platform_list_operational_workspaces')
  if (error) throwRpcError(error, 'تعذر تحميل مساحات العمل المتاحة.')
  return (Array.isArray(data) ? data : []).map((row) => {
    const value = row as Record<string, unknown>
    return { id: String(value.id), code: String(value.code), name: String(value.name), status: String(value.status) }
  })
}

export async function listCurrentOperationalAccess(): Promise<CurrentOperationalAccess[]> {
  const { data, error } = await supabase.rpc('platform_current_user_operational_access')
  if (error) throwRpcError(error, 'تعذر التحقق من الصلاحيات التشغيلية.')
  return (Array.isArray(data) ? data : []).map((row) => mapCurrent(row as Record<string, unknown>))
}

export async function grantPlatformUserAccess(input: GrantPlatformUserAccessInput) {
  await requireOwner()
  const { data, error } = await supabase.rpc('platform_grant_user_access', {
    p_user_id: input.userId, p_workspace_id: input.workspaceId,
    p_organization_id: input.organizationId, p_role_code: input.roleCode,
    p_access_scope: input.accessScope,
    p_starts_at: input.startsAt || null, p_ends_at: input.endsAt || null,
  })
  if (error) throwRpcError(error, 'تعذر منح الصلاحية التشغيلية.')
  return data
}
export async function updatePlatformUserAccess(input: UpdatePlatformUserAccessInput) {
  await requireOwner()
  const { data, error } = await supabase.rpc('platform_update_user_access', {
    p_access_id: input.accessId, p_role_code: input.roleCode,
    p_access_scope: input.accessScope, p_starts_at: input.startsAt,
    p_ends_at: input.endsAt || null, p_expected_lock_version: input.expectedLockVersion,
  })
  if (error) throwRpcError(error, 'تعذر تحديث الصلاحية التشغيلية.')
  return data
}

export async function revokePlatformUserAccess(accessId: string, reason: string, expectedLockVersion: number) {
  await requireOwner()
  const { data, error } = await supabase.rpc('platform_revoke_user_access', {
    p_access_id: accessId, p_reason: reason, p_expected_lock_version: expectedLockVersion,
  })
  if (error) throwRpcError(error, 'تعذر سحب الصلاحية التشغيلية.')
  return data
}
