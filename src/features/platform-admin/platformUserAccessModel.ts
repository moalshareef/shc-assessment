import type { OperationalAccessScope, OperationalRoleCode } from '../../types/platformUserAccess'

export const operationalRoleLabels: Record<OperationalRoleCode, string> = {
  financial_control_employee: 'موظف مختص',
  financial_control_manager: 'مدير معتمد',
}

export const operationalScopeLabels: Record<OperationalAccessScope, string> = {
  assigned_records: 'السجلات المسندة فقط',
  organization_records: 'سجلات الجهة',
  all_records: 'جميع السجلات',
}

export function validateAccessForm(input: {
  userId: string; organizationId: string; workspaceId: string; roleCode: string;
  accessScope: string; startsAt: string; endsAt: string
}) {
  const errors: Record<string, string> = {}
  if (!input.userId) errors.userId = 'اختر المستخدم.'
  if (!input.organizationId) errors.organizationId = 'اختر الجهة.'
  if (!input.workspaceId) errors.workspaceId = 'اختر مساحة العمل.'
  if (!Object.prototype.hasOwnProperty.call(operationalRoleLabels, input.roleCode)) errors.roleCode = 'اختر دورًا تشغيليًا معتمدًا.'
  if (!Object.prototype.hasOwnProperty.call(operationalScopeLabels, input.accessScope)) errors.accessScope = 'اختر نطاق وصول معتمدًا.'
  if (!input.startsAt) errors.startsAt = 'حدد تاريخ بداية الصلاحية.'
  if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) errors.endsAt = 'يجب أن يكون تاريخ الانتهاء بعد تاريخ البداية.'
  return errors
}
