import {
  createPlatformModuleManagementApi,
  PlatformModuleConflictError,
  type PlatformAdminRpcCaller,
} from './platformModulesApi'
import { nextModuleStatus, validateModuleCode, validateModuleStatusChange } from './platformModulesModel'

interface ScenarioResult {
  check: string
  passed: boolean
}

function assert(condition: boolean, check: string, results: ScenarioResult[]) {
  if (!condition) throw new Error(`فشل اختبار إدارة الموديلات: ${check}`)
  results.push({ check, passed: true })
}

const sampleModule = {
  id: '00000000-0000-0000-0000-000000000001',
  module_code: 'risk-management',
  module_name_ar: 'إدارة المخاطر',
  description: 'وصف تجريبي داخل الذاكرة فقط',
  module_status: 'draft',
  created_at: '2026-07-15T10:00:00Z',
  updated_at: '2026-07-15T10:00:00Z',
  lock_version: 1,
  disabled_reason: null,
}

export async function runDevelopmentPlatformModulesScenario(): Promise<ScenarioResult[]> {
  const results: ScenarioResult[] = []
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  let conflict = false

  const rpc: PlatformAdminRpcCaller = async (name, args) => {
    calls.push({ name, args })
    if (conflict) return { data: null, error: { code: '40001', message: 'conflict' } }
    return { data: sampleModule, error: null }
  }
  const ownerApi = createPlatformModuleManagementApi(rpc, async () => true)
  const normalUserApi = createPlatformModuleManagementApi(rpc, async () => false)

  assert(validateModuleCode('Risk Management') !== null, 'رفض الرمز غير الصحيح.', results)
  assert(validateModuleCode('risk-management') === null, 'قبول الرمز الصحيح.', results)
  assert(nextModuleStatus('draft') === 'active', 'السماح من مسودة إلى فعال.', results)
  assert(nextModuleStatus('active') === 'disabled', 'السماح من فعال إلى معطل.', results)
  assert(nextModuleStatus('disabled') === 'active', 'السماح من معطل إلى فعال.', results)
  assert(validateModuleStatusChange('active', 'disabled') === 'سبب التعطيل إلزامي.', 'إلزام سبب التعطيل.', results)
  assert(validateModuleStatusChange('active', 'draft') !== null, 'رفض الرجوع إلى مسودة.', results)

  await ownerApi.createModule({ moduleCode: 'risk-management', moduleNameAr: 'إدارة المخاطر' })
  assert(calls[calls.length - 1]?.name === 'platform_create_module', 'استخدام RPC الإنشاء فقط.', results)
  assert(calls[calls.length - 1]?.args.p_module_status === 'draft', 'فرض حالة مسودة عند الإنشاء.', results)

  await ownerApi.updateModule({
    moduleId: sampleModule.id,
    moduleCode: sampleModule.module_code,
    moduleNameAr: 'إدارة المخاطر المؤسسية',
    expectedLockVersion: 1,
  })
  assert(calls[calls.length - 1]?.name === 'platform_update_module', 'استخدام RPC التحديث فقط.', results)
  assert(calls[calls.length - 1]?.args.p_expected_lock_version === 1, 'تمرير lock_version في التحديث.', results)

  await ownerApi.changeModuleStatus({ moduleId: sampleModule.id, newStatus: 'active', expectedLockVersion: 1 })
  assert(calls[calls.length - 1]?.name === 'platform_change_module_status', 'استخدام RPC الحالة فقط.', results)

  const callsBeforeDeniedUser = calls.length
  try {
    await normalUserApi.createModule({ moduleCode: 'denied-module', moduleNameAr: 'مرفوض' })
  } catch {
    // الرفض متوقع قبل أي استدعاء كتابة.
  }
  assert(calls.length === callsBeforeDeniedUser, 'منع المستخدم غير المالك قبل استدعاء RPC الإدارة.', results)

  conflict = true
  let conflictHandled = false
  try {
    await ownerApi.updateModule({
      moduleId: sampleModule.id,
      moduleCode: sampleModule.module_code,
      moduleNameAr: 'تعارض',
      expectedLockVersion: 1,
    })
  } catch (error) {
    conflictHandled = error instanceof PlatformModuleConflictError
  }
  assert(conflictHandled, 'تحويل 40001 إلى رسالة تعارض مخصصة.', results)
  assert(calls.every((call) => call.name.startsWith('platform_')), 'عدم وجود INSERT أو UPDATE أو DELETE مباشر.', results)

  return results
}

if (import.meta.env.DEV) {
  void runDevelopmentPlatformModulesScenario().then((results) => {
    console.info('[platform-admin] Development-only module management mock scenario passed.', results)
  })
}
