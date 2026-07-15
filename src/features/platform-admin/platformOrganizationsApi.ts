import type {
  ChangePlatformOrganizationStatusInput,
  CreatePlatformOrganizationInput,
  PlatformOrganization,
  PlatformOrganizationStatus,
  PlatformOrganizationType,
  UpdatePlatformOrganizationInput,
} from '../../types/platformAdmin'
import type { PlatformAdminRpcCaller } from './platformModulesApi'

export class PlatformOrganizationConflictError extends Error {
  constructor() {
    super('تم تعديل هذه الجهة من مستخدم آخر، تم تحديث البيانات، أعد المحاولة.')
    this.name = 'PlatformOrganizationConflictError'
  }
}

export function mapPlatformOrganization(value: unknown): PlatformOrganization {
  const row = value as Record<string, unknown> | null
  if (!row || typeof row.id !== 'string') throw new Error('تعذّر قراءة بيانات الجهة من الخادم.')

  return {
    id: row.id,
    organizationCode: String(row.organization_code ?? ''),
    organizationNameAr: String(row.organization_name_ar ?? ''),
    organizationType: row.organization_type as PlatformOrganizationType,
    description: typeof row.description === 'string' ? row.description : null,
    status: row.status as PlatformOrganizationStatus,
    disabledReason: typeof row.disabled_reason === 'string' ? row.disabled_reason : null,
    createdAt: String(row.created_at ?? ''),
    updatedAt: String(row.updated_at ?? ''),
    createdBy: typeof row.created_by === 'string' ? row.created_by : null,
    updatedBy: typeof row.updated_by === 'string' ? row.updated_by : null,
    lockVersion: Number(row.lock_version ?? 0),
  }
}

function throwOrganizationRpcError(error: { code?: string; message: string }) {
  if (error.code === '40001') throw new PlatformOrganizationConflictError()
  if (error.code === '42501') throw new Error('لا تملك صلاحية مالك النظام لتنفيذ هذه العملية.')
  if (error.code === '23505') throw new Error('رمز الجهة مستخدم مسبقًا. اختر رمزًا آخر.')
  throw new Error(error.message || 'تعذّر تنفيذ العملية. حاول مرة أخرى.')
}

export function createPlatformOrganizationManagementApi(
  rpcCaller: PlatformAdminRpcCaller,
  verifySystemOwner: () => Promise<boolean>,
) {
  async function callAuthorized(functionName: string, args: Record<string, unknown> = {}) {
    if (!await verifySystemOwner()) throw new Error('لا تملك صلاحية مالك النظام لتنفيذ هذه العملية.')
    const result = await rpcCaller(functionName, args)
    if (result.error) throwOrganizationRpcError(result.error)
    return result.data
  }

  return {
    async listOrganizations() {
      const data = await callAuthorized('platform_list_organizations')
      if (!Array.isArray(data)) return []
      return data.map(mapPlatformOrganization)
    },
    async createOrganization(input: CreatePlatformOrganizationInput) {
      const data = await callAuthorized('platform_create_organization', {
        p_organization_code: input.organizationCode,
        p_organization_name_ar: input.organizationNameAr,
        p_organization_type: input.organizationType,
        p_description: input.description?.trim() || null,
        p_organization_status: 'draft',
      })
      return mapPlatformOrganization(Array.isArray(data) ? data[0] : data)
    },
    async updateOrganization(input: UpdatePlatformOrganizationInput) {
      const data = await callAuthorized('platform_update_organization', {
        p_organization_id: input.organizationId,
        p_organization_code: input.organizationCode,
        p_organization_name_ar: input.organizationNameAr,
        p_organization_type: input.organizationType,
        p_description: input.description?.trim() || null,
        p_expected_lock_version: input.expectedLockVersion,
      })
      return mapPlatformOrganization(Array.isArray(data) ? data[0] : data)
    },
    async changeOrganizationStatus(input: ChangePlatformOrganizationStatusInput) {
      const data = await callAuthorized('platform_change_organization_status', {
        p_organization_id: input.organizationId,
        p_new_status: input.newStatus,
        p_disabled_reason: input.disabledReason?.trim() || null,
        p_expected_lock_version: input.expectedLockVersion,
      })
      return mapPlatformOrganization(Array.isArray(data) ? data[0] : data)
    },
  }
}
