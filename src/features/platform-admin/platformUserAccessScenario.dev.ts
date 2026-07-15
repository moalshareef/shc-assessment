import { validateAccessForm } from './platformUserAccessModel'

if (import.meta.env.DEV) {
  const valid = validateAccessForm({
    userId: 'user', organizationId: 'organization', workspaceId: 'workspace',
    roleCode: 'financial_control_employee', accessScope: 'assigned_records',
    startsAt: '2026-07-16T10:00', endsAt: '2026-08-16T10:00',
  })
  const invalid = validateAccessForm({
    userId: '', organizationId: '', workspaceId: '', roleCode: 'owner', accessScope: 'everything',
    startsAt: '2026-08-16T10:00', endsAt: '2026-07-16T10:00',
  })
  console.assert(Object.keys(valid).length === 0, 'Valid operational access should pass local validation.')
  console.assert(Boolean(invalid.userId && invalid.roleCode && invalid.accessScope && invalid.endsAt), 'Invalid access must be rejected locally.')
}
