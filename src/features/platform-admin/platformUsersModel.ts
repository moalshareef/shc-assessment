export const PLATFORM_USER_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validatePlatformUserEmail(value: string) {
  if (!value.trim()) return 'البريد الإلكتروني إلزامي.'
  if (!PLATFORM_USER_EMAIL_PATTERN.test(value.trim())) return 'أدخل بريدًا إلكترونيًا صحيحًا.'
  return null
}

export function validatePlatformUserName(value: string) {
  return value.trim() ? null : 'الاسم الكامل إلزامي.'
}

export function validatePrimaryOrganization(value: string) {
  return value ? null : 'الجهة الأساسية إلزامية.'
}

export function validateTemporaryPassword(value: string) {
  if (value.length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
    return 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل، وتحتوي على حرف ورقم.'
  }
  return null
}

export function validateSuspensionReason(value: string) {
  return value.trim() ? null : 'سبب الإيقاف إلزامي.'
}

export const invitationStatusLabels: Record<string, string> = {
  draft: 'مسودة', sent: 'مرسلة', accepted: 'مقبولة', active: 'مكتملة', expired: 'منتهية', cancelled: 'ملغاة',
}
