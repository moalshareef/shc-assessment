import type {
  ChangePlatformModuleStatusInput,
  CreatePlatformModuleInput,
  PlatformModule,
  PlatformModuleStatus,
  UpdatePlatformModuleInput,
} from '../../types/platformAdmin'

interface RpcErrorLike {
  code?: string
  message: string
}

interface RpcResult {
  data: unknown
  error: RpcErrorLike | null
}

export type PlatformAdminRpcCaller = (functionName: string, args: Record<string, unknown>) => Promise<RpcResult>

export class PlatformModuleConflictError extends Error {
  constructor() {
    super('تم تعديل هذا الموديل من مستخدم آخر، تم تحديث البيانات، أعد المحاولة.')
    this.name = 'PlatformModuleConflictError'
  }
}

export function mapPlatformModule(value: unknown): PlatformModule {
  const row = (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null
  if (!row || typeof row.id !== 'string') throw new Error('تعذّر قراءة بيانات الموديل من الخادم.')

  return {
    id: row.id,
    moduleCode: String(row.module_code ?? ''),
    moduleNameAr: String(row.module_name_ar ?? ''),
    description: typeof row.description === 'string' ? row.description : null,
    moduleStatus: row.module_status as PlatformModuleStatus,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    lockVersion: Number(row.lock_version ?? 0),
    disabledReason: typeof row.disabled_reason === 'string' ? row.disabled_reason : null,
  }
}

function throwRpcError(error: RpcErrorLike) {
  if (error.code === '40001') throw new PlatformModuleConflictError()
  if (error.code === '42501') throw new Error('لا تملك صلاحية مالك النظام لتنفيذ هذه العملية.')
  if (error.code === '23505') throw new Error('رمز الموديل مستخدم مسبقًا. اختر رمزًا آخر.')
  throw new Error(error.message || 'تعذّر تنفيذ العملية. حاول مرة أخرى.')
}

export function createPlatformModuleManagementApi(
  rpcCaller: PlatformAdminRpcCaller,
  verifySystemOwner: () => Promise<boolean>,
) {
  async function callAuthorized(functionName: string, args: Record<string, unknown>) {
    if (!await verifySystemOwner()) throw new Error('لا تملك صلاحية مالك النظام لتنفيذ هذه العملية.')
    const result = await rpcCaller(functionName, args)
    if (result.error) throwRpcError(result.error)
    return mapPlatformModule(result.data)
  }

  return {
    createModule(input: CreatePlatformModuleInput) {
      return callAuthorized('platform_create_module', {
        p_module_code: input.moduleCode,
        p_module_name_ar: input.moduleNameAr,
        p_description: input.description?.trim() || null,
        p_module_status: 'draft',
      })
    },
    updateModule(input: UpdatePlatformModuleInput) {
      return callAuthorized('platform_update_module', {
        p_module_id: input.moduleId,
        p_module_code: input.moduleCode,
        p_module_name_ar: input.moduleNameAr,
        p_description: input.description?.trim() || null,
        p_expected_lock_version: input.expectedLockVersion,
      })
    },
    changeModuleStatus(input: ChangePlatformModuleStatusInput) {
      return callAuthorized('platform_change_module_status', {
        p_module_id: input.moduleId,
        p_new_status: input.newStatus,
        p_disabled_reason: input.disabledReason?.trim() || null,
        p_expected_lock_version: input.expectedLockVersion,
      })
    },
  }
}
