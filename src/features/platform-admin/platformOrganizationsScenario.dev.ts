import {
  createPlatformOrganizationManagementApi,
  PlatformOrganizationConflictError,
} from './platformOrganizationsApi'
import type { PlatformAdminRpcCaller } from './platformModulesApi'
import {
  nextOrganizationStatus,
  validateOrganizationCode,
  validateOrganizationStatusChange,
  validateOrganizationType,
} from './platformOrganizationsModel'

interface Result { check: string; passed: boolean }

function assert(condition: boolean, check: string, results: Result[]) {
  if (!condition) throw new Error(`فشل اختبار إدارة الجهات: ${check}`)
  results.push({ check, passed: true })
}

const sample = {
  id: '00000000-0000-0000-0000-000000000101',
  organization_code: 'test-center-01',
  organization_name_ar: 'جهة اختبار محلية',
  organization_type: 'center',
  description: 'بيانات داخل الذاكرة فقط',
  status: 'draft',
  disabled_reason: null,
  created_at: '2026-07-15T10:00:00Z',
  updated_at: '2026-07-15T10:00:00Z',
  created_by: '00000000-0000-0000-0000-000000000001',
  updated_by: '00000000-0000-0000-0000-000000000001',
  lock_version: 1,
}

export async function runDevelopmentPlatformOrganizationsScenario(): Promise<Result[]> {
  const results: Result[] = []
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  let conflict = false
  const rpc: PlatformAdminRpcCaller = async (name, args) => {
    calls.push({ name, args })
    if (conflict) return { data: null, error: { code: '40001', message: 'conflict' } }
    if (name === 'platform_list_organizations') return { data: [sample], error: null }
    return { data: sample, error: null }
  }
  const ownerApi = createPlatformOrganizationManagementApi(rpc, async () => true)
  const normalUserApi = createPlatformOrganizationManagementApi(rpc, async () => false)

  assert(validateOrganizationCode('Center 01') !== null, 'رفض الرمز غير الصحيح.', results)
  assert(validateOrganizationCode('center-01') === null, 'قبول الرمز الصحيح.', results)
  assert(validateOrganizationType('center'), 'قبول النوع المعتمد.', results)
  assert(!validateOrganizationType('ministry'), 'رفض النوع غير المعتمد.', results)
  assert(nextOrganizationStatus('draft') === 'active', 'مسودة إلى فعالة.', results)
  assert(nextOrganizationStatus('active') === 'disabled', 'فعالة إلى معطلة.', results)
  assert(nextOrganizationStatus('disabled') === 'active', 'معطلة إلى فعالة.', results)
  assert(validateOrganizationStatusChange('active', 'disabled') !== null, 'إلزام سبب التعطيل.', results)
  assert(validateOrganizationStatusChange('active', 'draft') !== null, 'منع الرجوع إلى مسودة.', results)

  const listed = await ownerApi.listOrganizations()
  assert(listed.length === 1 && calls[calls.length - 1]?.name === 'platform_list_organizations', 'القراءة عبر RPC الإداري فقط.', results)

  await ownerApi.createOrganization({ organizationCode: 'center-01', organizationNameAr: 'مركز اختبار', organizationType: 'center' })
  assert(calls[calls.length - 1]?.name === 'platform_create_organization', 'الإنشاء عبر RPC فقط.', results)
  assert(calls[calls.length - 1]?.args.p_organization_status === 'draft', 'فرض حالة المسودة عند الإنشاء.', results)

  await ownerApi.updateOrganization({ organizationId: sample.id, organizationCode: sample.organization_code, organizationNameAr: 'مركز محدث', organizationType: 'department', description: 'تحديث', expectedLockVersion: 1 })
  assert(calls[calls.length - 1]?.name === 'platform_update_organization', 'التعديل عبر RPC فقط.', results)
  assert(calls[calls.length - 1]?.args.p_organization_code === sample.organization_code, 'بقاء الرمز الحالي للقراءة فقط.', results)
  assert(calls[calls.length - 1]?.args.p_expected_lock_version === 1, 'تمرير lock_version في التعديل.', results)

  await ownerApi.changeOrganizationStatus({ organizationId: sample.id, newStatus: 'active', expectedLockVersion: 1 })
  assert(calls[calls.length - 1]?.name === 'platform_change_organization_status', 'تغيير الحالة عبر RPC فقط.', results)

  const beforeDenied = calls.length
  let denied = false
  try { await normalUserApi.listOrganizations() } catch { denied = true }
  assert(denied && calls.length === beforeDenied, 'رفض غير المالك قبل استدعاء RPC.', results)

  conflict = true
  let conflictHandled = false
  try {
    await ownerApi.updateOrganization({ organizationId: sample.id, organizationCode: sample.organization_code, organizationNameAr: 'تعارض', organizationType: 'center', expectedLockVersion: 1 })
  } catch (error) { conflictHandled = error instanceof PlatformOrganizationConflictError }
  assert(conflictHandled, 'معالجة تعارض 40001.', results)

  const allowed = new Set(['platform_list_organizations', 'platform_create_organization', 'platform_update_organization', 'platform_change_organization_status'])
  assert(calls.every((call) => allowed.has(call.name)), 'عدم وجود INSERT أو UPDATE أو DELETE مباشر.', results)
  return results
}

if (import.meta.env.DEV) {
  void runDevelopmentPlatformOrganizationsScenario().then((results) => {
    console.info('[platform-admin] Development-only organization management mock scenario passed.', results)
  })
}
