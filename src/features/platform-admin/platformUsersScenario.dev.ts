import { createPlatformUsersApi, type PlatformUserAdminInvoker } from './platformUsersApi'
import { validatePlatformUserEmail, validatePlatformUserName, validatePrimaryOrganization, validateSuspensionReason } from './platformUsersModel'

interface Result { check: string; passed: boolean }
function assert(value: boolean, check: string, results: Result[]) {
  if (!value) throw new Error(`فشل اختبار إدارة المستخدمين: ${check}`)
  results.push({ check, passed: true })
}

export async function runDevelopmentPlatformUsersScenario() {
  const results: Result[] = []
  const calls: Record<string, unknown>[] = []
  const invoke: PlatformUserAdminInvoker = async (body) => {
    calls.push(body)
    if (body.action === 'list_users') return { data: { users: [] }, error: null }
    return { data: { result: { user_id: 'mock-user' } }, error: null }
  }
  const owner = createPlatformUsersApi(invoke, async () => true)
  const normal = createPlatformUsersApi(invoke, async () => false)

  assert(validatePlatformUserEmail('invalid') !== null, 'رفض البريد غير الصحيح.', results)
  assert(validatePlatformUserEmail('user@example.com') === null, 'قبول البريد الصحيح.', results)
  assert(validatePlatformUserName('') !== null, 'إلزام الاسم الكامل.', results)
  assert(validatePrimaryOrganization('') !== null, 'إلزام الجهة الأساسية.', results)
  assert(validateSuspensionReason('') !== null, 'إلزام سبب الإيقاف.', results)

  await owner.listUsers()
  assert(calls[calls.length - 1]?.action === 'list_users', 'القراءة عبر Edge Function.', results)
  await owner.inviteUser({ email: ' USER@EXAMPLE.COM ', fullName: ' مستخدم ', primaryOrganizationId: 'org-1' })
  assert(calls[calls.length - 1]?.action === 'invite_user', 'الدعوة عبر Edge Function.', results)
  assert(calls[calls.length - 1]?.email === 'user@example.com', 'تطبيع البريد.', results)
  assert(!('platform_role' in calls[calls.length - 1]), 'عدم منح دور تلقائي.', results)
  await owner.suspendUser('user-1', 'سبب معتمد')
  assert(calls[calls.length - 1]?.action === 'suspend_user', 'الإيقاف دون حذف.', results)
  await owner.activateUser('user-1')
  assert(calls[calls.length - 1]?.action === 'activate_user', 'إعادة التفعيل.', results)

  const before = calls.length
  let denied = false
  try { await normal.listUsers() } catch { denied = true }
  assert(denied && calls.length === before, 'رفض المستخدم غير المالك قبل استدعاء الوظيفة.', results)
  assert(calls.every((call) => ['list_users', 'invite_user', 'suspend_user', 'activate_user'].includes(String(call.action))), 'عدم وجود Auth Admin أو كتابة جدول مباشرة من الواجهة.', results)
  return results
}

if (import.meta.env.DEV) {
  void runDevelopmentPlatformUsersScenario().then((results) => console.info('[platform-admin] Development-only user admin mock scenario passed.', results))
}
