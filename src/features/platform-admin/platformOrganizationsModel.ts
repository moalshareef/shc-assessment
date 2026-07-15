import type { PlatformOrganizationStatus, PlatformOrganizationType } from '../../types/platformAdmin'

export const platformOrganizationStatusLabels: Record<PlatformOrganizationStatus, string> = {
  draft: 'مسودة',
  active: 'فعالة',
  disabled: 'معطلة',
}

export const platformOrganizationTypeLabels: Record<PlatformOrganizationType, string> = {
  secretariat: 'أمانة عامة',
  center: 'مركز',
  department: 'إدارة',
  other: 'أخرى',
}

export const PLATFORM_ORGANIZATION_CODE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

export function validateOrganizationCode(value: string) {
  if (!value.trim()) return 'رمز الجهة إلزامي.'
  if (value !== value.trim() || !PLATFORM_ORGANIZATION_CODE_PATTERN.test(value)) {
    return 'استخدم حروفًا إنجليزية صغيرة وأرقامًا وشرطات مفردة فقط، مثل: center-01.'
  }
  return null
}

export function validateOrganizationName(value: string) {
  return value.trim() ? null : 'اسم الجهة بالعربية إلزامي.'
}

export function validateOrganizationType(value: string): value is PlatformOrganizationType {
  return value in platformOrganizationTypeLabels
}

export function nextOrganizationStatus(status: PlatformOrganizationStatus): PlatformOrganizationStatus | null {
  if (status === 'draft' || status === 'disabled') return 'active'
  if (status === 'active') return 'disabled'
  return null
}

export function organizationStatusActionLabel(status: PlatformOrganizationStatus) {
  return status === 'active' ? 'تعطيل الجهة' : 'تفعيل الجهة'
}

export function validateOrganizationStatusChange(
  currentStatus: PlatformOrganizationStatus,
  newStatus: PlatformOrganizationStatus,
  disabledReason = '',
) {
  if (nextOrganizationStatus(currentStatus) !== newStatus) return 'انتقال حالة الجهة غير مسموح.'
  if (newStatus === 'disabled' && !disabledReason.trim()) return 'سبب التعطيل إلزامي.'
  return null
}
