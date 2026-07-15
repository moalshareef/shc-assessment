import type { PlatformModuleStatus } from '../../types/platformAdmin'

export const platformModuleStatusLabels: Record<PlatformModuleStatus, string> = {
  draft: 'مسودة',
  active: 'فعال',
  disabled: 'معطل',
}

export const PLATFORM_MODULE_CODE_PATTERN = /^[a-z]+(?:-[a-z]+)*$/

export function validateModuleCode(value: string) {
  if (!value.trim()) return 'رمز الموديل إلزامي.'
  if (value !== value.trim() || !PLATFORM_MODULE_CODE_PATTERN.test(value)) {
    return 'استخدم حروفًا إنجليزية صغيرة وشرطات مفردة فقط، مثل: risk-management.'
  }
  return null
}

export function validateModuleName(value: string) {
  return value.trim() ? null : 'الاسم العربي للموديل إلزامي.'
}

export function nextModuleStatus(status: PlatformModuleStatus): PlatformModuleStatus | null {
  if (status === 'draft' || status === 'disabled') return 'active'
  if (status === 'active') return 'disabled'
  return null
}

export function moduleStatusActionLabel(status: PlatformModuleStatus) {
  return status === 'active' ? 'تعطيل الموديل' : 'تفعيل الموديل'
}

export function validateModuleStatusChange(
  currentStatus: PlatformModuleStatus,
  newStatus: PlatformModuleStatus,
  disabledReason = '',
) {
  if (nextModuleStatus(currentStatus) !== newStatus) return 'انتقال حالة الموديل غير مسموح.'
  if (newStatus === 'disabled' && !disabledReason.trim()) return 'سبب التعطيل إلزامي.'
  return null
}
