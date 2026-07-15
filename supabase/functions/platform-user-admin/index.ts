import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.110.3'

type Action = 'list_users' | 'create_user' | 'invite_user' | 'suspend_user' | 'activate_user' | 'change_own_password'

const DEFAULT_ORIGINS = [
  'https://vhoho.github.io',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]

function allowedOrigins() {
  const configured = Deno.env.get('PLATFORM_ADMIN_ALLOWED_ORIGINS')
  return configured ? configured.split(',').map((value) => value.trim()).filter(Boolean) : DEFAULT_ORIGINS
}

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
  if (origin && allowedOrigins().includes(origin)) headers['Access-Control-Allow-Origin'] = origin
  return headers
}

function json(origin: string | null, status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  })
}

function secretKey() {
  const current = Deno.env.get('SUPABASE_SECRET_KEYS')
  if (current) return JSON.parse(current).default as string
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!legacy) throw new Error('Server secret is not configured.')
  return legacy
}

async function authenticatedUser(admin: SupabaseClient, token: string) {
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  if (authError || !authData.user) throw Object.assign(new Error('انتهت الجلسة أو أنها غير صالحة.'), { status: 401 })
  return authData.user
}

async function assertSystemOwner(admin: SupabaseClient, actor: User) {
  const now = new Date().toISOString()
  // user_id is the intended relationship: platform_role_assignments_user_id_fkey.
  // Keep profile state in a separate query to avoid ambiguous PostgREST embeds.
  const { data: assignments, error: assignmentError } = await admin
    .from('platform_role_assignments')
    .select('id')
    .eq('user_id', actor.id)
    .eq('platform_role', 'system_owner')
    .eq('status', 'active')
    .is('revoked_at', null)
    .or(`starts_at.is.null,starts_at.lte.${now}`)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .limit(1)
  if (assignmentError) throw assignmentError
  if (!assignments?.length) throw Object.assign(new Error('لا تملك صلاحية مالك النظام.'), { status: 403 })

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('is_active')
    .eq('id', actor.id)
    .maybeSingle()
  if (profileError) throw profileError
  if (!profile?.is_active) throw Object.assign(new Error('الحساب غير فعال.'), { status: 403 })
  return actor
}

function validateStrongPassword(password: string) {
  return password.length >= 12
    && /[a-z]/.test(password)
    && /[A-Z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password)
}

async function listAllAuthUsers(admin: SupabaseClient) {
  const users: User[] = []
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    users.push(...data.users)
    if (data.users.length < 1000) break
  }
  return users
}

async function listUsers(admin: SupabaseClient) {
  const authUsers = await listAllAuthUsers(admin)
  const ids = authUsers.map((user) => user.id)
  const now = new Date().toISOString()
  const [profilesResult, membershipsResult, invitationsResult, rolesResult] = await Promise.all([
    ids.length ? admin.from('profiles').select('id, full_name, is_active, created_at').in('id', ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? admin.from('user_organizations').select('user_id, organization_id, organizations(organization_name_ar)').in('user_id', ids).eq('is_primary', true).eq('status', 'active') : Promise.resolve({ data: [], error: null }),
    admin.from('user_invitations').select('email_normalized, status, sent_at, auth_invited_user_id, platform_sync_status').order('created_at', { ascending: false }),
    ids.length ? admin.from('platform_role_assignments').select('user_id, platform_role').in('user_id', ids).eq('status', 'active').is('revoked_at', null).or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gt.${now}`) : Promise.resolve({ data: [], error: null }),
  ])
  if (profilesResult.error) throw profilesResult.error
  if (membershipsResult.error) throw membershipsResult.error
  if (invitationsResult.error) throw invitationsResult.error
  if (rolesResult.error) throw rolesResult.error

  const profiles = new Map((profilesResult.data ?? []).map((row) => [row.id, row]))
  const memberships = new Map((membershipsResult.data ?? []).map((row) => [row.user_id, row]))
  const invitations = new Map((invitationsResult.data ?? []).map((row) => [row.auth_invited_user_id || row.email_normalized, row]))
  const roles = new Map<string, string[]>()
  for (const row of rolesResult.data ?? []) {
    const current = roles.get(row.user_id) ?? []
    if (!current.includes(row.platform_role)) current.push(row.platform_role)
    roles.set(row.user_id, current)
  }

  return authUsers.map((user) => {
    const profile = profiles.get(user.id)
    const membership = memberships.get(user.id) as { organization_id?: string; organizations?: { organization_name_ar?: string } | Array<{ organization_name_ar?: string }> } | undefined
    const organization = Array.isArray(membership?.organizations) ? membership.organizations[0] : membership?.organizations
    const invitation = invitations.get(user.id) ?? invitations.get((user.email ?? '').toLowerCase())
    return {
      user_id: user.id,
      email: user.email ?? '',
      full_name: profile?.full_name ?? '',
      profile_status: profile?.is_active === false ? 'suspended' : 'active',
      email_confirmed: Boolean(user.email_confirmed_at),
      invited_at: user.invited_at ?? invitation?.sent_at ?? null,
      invitation_status: invitation?.status ?? null,
      invitation_sync_status: invitation?.platform_sync_status ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
      primary_organization_id: membership?.organization_id ?? null,
      primary_organization_name: organization?.organization_name_ar ?? null,
      platform_roles: roles.get(user.id) ?? [],
      created_at: user.created_at,
    }
  })
}

async function auditProfile(admin: SupabaseClient, actorId: string, userId: string, oldActive: boolean, newActive: boolean, reason: string | null) {
  const { error } = await admin.from('audit_logs').insert({
    actor_user_id: actorId,
    table_name: 'profiles',
    record_id: userId,
    action: 'UPDATE',
    old_data: { is_active: oldActive },
    new_data: { is_active: newActive, reason },
  })
  if (error) throw error
}

async function validateNewUser(admin: SupabaseClient, payload: Record<string, unknown>) {
  const email = String(payload.email ?? '').trim().toLowerCase()
  const fullName = String(payload.full_name ?? '').trim()
  const organizationId = String(payload.primary_organization_id ?? '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw Object.assign(new Error('البريد الإلكتروني غير صحيح.'), { status: 400 })
  if (!fullName) throw Object.assign(new Error('الاسم الكامل إلزامي.'), { status: 400 })
  if (!organizationId) throw Object.assign(new Error('الجهة الأساسية إلزامية.'), { status: 400 })

  const { data: organization, error: organizationError } = await admin.from('organizations').select('id').eq('id', organizationId).eq('status', 'active').maybeSingle()
  if (organizationError) throw organizationError
  if (!organization) throw Object.assign(new Error('الجهة المحددة غير فعالة.'), { status: 400 })
  const existing = (await listAllAuthUsers(admin)).some((user) => user.email?.toLowerCase() === email)
  if (existing) throw Object.assign(new Error('البريد الإلكتروني مسجل مسبقًا.'), { status: 409 })
  return { email, fullName, organizationId }
}

async function createUser(admin: SupabaseClient, actor: User, payload: Record<string, unknown>) {
  const { email, fullName, organizationId } = await validateNewUser(admin, payload)
  const temporaryPassword = String(payload.temporary_password ?? '')
  if (!validateStrongPassword(temporaryPassword)) {
    throw Object.assign(new Error('كلمة المرور المؤقتة يجب أن تتكون من 12 حرفًا على الأقل وتتضمن حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا خاصًا.'), { status: 400 })
  }

  const { data: created, error: authError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (authError || !created.user) throw Object.assign(new Error(authError?.message || 'تعذر إنشاء حساب المصادقة.'), { status: authError?.status === 422 ? 409 : 502 })

  const user = created.user
  try {
    const { error: profileError } = await admin.from('profiles').upsert({
      id: user.id,
      full_name: fullName,
      is_active: true,
      must_change_password: true,
      password_changed_at: null,
    }, { onConflict: 'id' })
    if (profileError) throw profileError

    const { error: membershipError } = await admin.from('user_organizations').insert({
      user_id: user.id,
      organization_id: organizationId,
      is_primary: true,
      status: 'active',
      created_by: actor.id,
      updated_by: actor.id,
    })
    if (membershipError) throw membershipError

    const { error: auditError } = await admin.from('audit_logs').insert({
      actor_user_id: actor.id,
      table_name: 'auth.users',
      record_id: user.id,
      action: 'INSERT',
      old_data: null,
      new_data: { email, email_confirmed: true, profile_active: true, must_change_password: true, primary_organization_id: organizationId },
    })
    if (auditError) throw auditError
  } catch (error) {
    await admin.from('profiles').update({ is_active: false }).eq('id', user.id)
    await admin.auth.admin.updateUserById(user.id, { ban_duration: '876000h' })
    throw Object.assign(new Error('أُنشئ حساب المصادقة لكن تعذر إكمال بيانات المنصة؛ أوقف الحساب تلقائيًا للمراجعة.'), { status: 500, partial: true, cause: error })
  }

  return { user_id: user.id, profile_status: 'active', status: 'created' }
}

async function changeOwnPassword(admin: SupabaseClient, actor: User, payload: Record<string, unknown>) {
  const password = String(payload.new_password ?? '')
  if (!validateStrongPassword(password)) {
    throw Object.assign(new Error('كلمة المرور الجديدة يجب أن تتكون من 12 حرفًا على الأقل وتتضمن حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا خاصًا.'), { status: 400 })
  }

  const { data: profile, error: profileError } = await admin.from('profiles').select('is_active, must_change_password').eq('id', actor.id).maybeSingle()
  if (profileError) throw profileError
  if (!profile?.is_active) throw Object.assign(new Error('الحساب غير فعال.'), { status: 403 })
  if (!profile.must_change_password) throw Object.assign(new Error('لا يوجد تغيير إلزامي لكلمة المرور على هذا الحساب.'), { status: 409 })

  const { error: authError } = await admin.auth.admin.updateUserById(actor.id, { password })
  if (authError) throw Object.assign(new Error('تعذر تحديث كلمة المرور.'), { status: 502 })

  const changedAt = new Date().toISOString()
  const { error: updateError } = await admin.from('profiles').update({ must_change_password: false, password_changed_at: changedAt }).eq('id', actor.id).eq('must_change_password', true)
  if (updateError) throw Object.assign(new Error('تم تحديث كلمة المرور لكن تعذر فتح الوصول إلى المنصة؛ أعد المحاولة.'), { status: 500, partial: true })
  const { error: auditError } = await admin.from('audit_logs').insert({
    actor_user_id: actor.id,
    table_name: 'profiles',
    record_id: actor.id,
    action: 'UPDATE',
    old_data: { must_change_password: true },
    new_data: { must_change_password: false, password_changed_at: changedAt },
  })
  if (auditError) throw auditError
  return { user_id: actor.id, status: 'password_changed' }
}

async function inviteUser(admin: SupabaseClient, actor: User, payload: Record<string, unknown>) {
  const { email, fullName, organizationId } = await validateNewUser(admin, payload)

  const { data: invitation, error: invitationError } = await admin.from('user_invitations').insert({
    email_normalized: email,
    display_name: fullName,
    primary_organization_id: organizationId,
    status: 'draft',
    platform_sync_status: 'pending',
    created_by: actor.id,
  }).select('id').single()
  if (invitationError) throw invitationError

  const redirectTo = Deno.env.get('PLATFORM_INVITE_REDIRECT_URL') ?? 'https://vhoho.github.io/shc-assessment/'
  const { data: inviteData, error: authInviteError } = await admin.auth.admin.inviteUserByEmail(email, { data: { full_name: fullName }, redirectTo })
  if (authInviteError || !inviteData.user) {
    await admin.from('user_invitations').update({ status: 'cancelled', platform_sync_status: 'failed', cancelled_at: new Date().toISOString(), cancel_reason: 'تعذر إرسال دعوة Auth.', cancelled_by: actor.id, processing_error: 'auth_invite_failed' }).eq('id', invitation.id)
    throw Object.assign(new Error('تعذر إرسال الدعوة عبر خدمة المصادقة.'), { status: 502 })
  }

  const invitedUser = inviteData.user
  try {
    const { error: profileError } = await admin.from('profiles').upsert({ id: invitedUser.id, full_name: fullName, is_active: true }, { onConflict: 'id' })
    if (profileError) throw profileError
    const { error: membershipError } = await admin.from('user_organizations').insert({ user_id: invitedUser.id, organization_id: organizationId, is_primary: true, status: 'active', created_by: actor.id, updated_by: actor.id })
    if (membershipError) throw membershipError
    const { error: finalError } = await admin.from('user_invitations').update({ status: 'sent', platform_sync_status: 'complete', auth_invited_user_id: invitedUser.id, provider_invitation_reference: invitedUser.id, sent_at: new Date().toISOString(), sent_by: actor.id, processing_error: null }).eq('id', invitation.id)
    if (finalError) throw finalError
  } catch (error) {
    await admin.from('user_invitations').update({ status: 'sent', platform_sync_status: 'failed', auth_invited_user_id: invitedUser.id, provider_invitation_reference: invitedUser.id, sent_at: new Date().toISOString(), sent_by: actor.id, processing_error: 'platform_sync_failed' }).eq('id', invitation.id)
    throw Object.assign(new Error('أُرسلت دعوة Auth لكن تعذر إكمال بيانات المنصة؛ سُجلت الحالة للمراجعة.'), { status: 500, partial: true, cause: error })
  }
  return { user_id: invitedUser.id, invitation_id: invitation.id, status: 'sent' }
}

async function changeUserActivation(admin: SupabaseClient, actor: User, payload: Record<string, unknown>, activate: boolean) {
  const userId = String(payload.user_id ?? '')
  const reason = activate ? null : String(payload.reason ?? '').trim()
  if (!userId) throw Object.assign(new Error('معرف المستخدم إلزامي.'), { status: 400 })
  if (!activate && !reason) throw Object.assign(new Error('سبب الإيقاف إلزامي.'), { status: 400 })
  const { data: profile, error: profileError } = await admin.from('profiles').select('id, is_active').eq('id', userId).maybeSingle()
  if (profileError) throw profileError
  if (!profile) throw Object.assign(new Error('المستخدم غير موجود.'), { status: 404 })

  if (!activate) {
    const now = new Date().toISOString()
    const { count, error: ownerError } = await admin.from('platform_role_assignments').select('id', { count: 'exact', head: true }).eq('platform_role', 'system_owner').eq('status', 'active').is('revoked_at', null).or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gt.${now}`)
    if (ownerError) throw ownerError
    const { count: targetOwnerCount, error: targetError } = await admin.from('platform_role_assignments').select('id', { count: 'exact', head: true }).eq('user_id', userId).eq('platform_role', 'system_owner').eq('status', 'active').is('revoked_at', null).or(`starts_at.is.null,starts_at.lte.${now}`).or(`ends_at.is.null,ends_at.gt.${now}`)
    if (targetError) throw targetError
    if ((targetOwnerCount ?? 0) > 0 && (count ?? 0) <= 1) throw Object.assign(new Error('لا يمكن إيقاف آخر مالك نظام فعال.'), { status: 409 })
  }

  const { error: authError } = await admin.auth.admin.updateUserById(userId, { ban_duration: activate ? 'none' : '876000h' })
  if (authError) throw authError
  const { error: updateError } = await admin.from('profiles').update({ is_active: activate }).eq('id', userId)
  if (updateError) {
    await admin.auth.admin.updateUserById(userId, { ban_duration: activate ? '876000h' : 'none' })
    throw updateError
  }
  await auditProfile(admin, actor.id, userId, profile.is_active, activate, reason)
  return { user_id: userId, profile_status: activate ? 'active' : 'suspended' }
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin')
  if (origin && !allowedOrigins().includes(origin)) return json(origin, 403, { error: 'origin_not_allowed', message: 'النطاق غير مسموح.' })
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (request.method !== 'POST') return json(origin, 405, { error: 'method_not_allowed', message: 'الطريقة غير مسموحة.' })

  try {
    const authorization = request.headers.get('Authorization')
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : ''
    if (!token) return json(origin, 401, { error: 'missing_session', message: 'الجلسة مطلوبة.' })
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', secretKey(), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
    const actor = await authenticatedUser(admin, token)
    const body = await request.json() as Record<string, unknown>
    const action = String(body.action ?? '') as Action

    if (action === 'change_own_password') return json(origin, 200, { result: await changeOwnPassword(admin, actor, body) })
    await assertSystemOwner(admin, actor)
    if (action === 'list_users') return json(origin, 200, { users: await listUsers(admin) })
    if (action === 'create_user') return json(origin, 200, { result: await createUser(admin, actor, body) })
    if (action === 'invite_user') return json(origin, 200, { result: await inviteUser(admin, actor, body) })
    if (action === 'suspend_user') return json(origin, 200, { result: await changeUserActivation(admin, actor, body, false) })
    if (action === 'activate_user') return json(origin, 200, { result: await changeUserActivation(admin, actor, body, true) })
    return json(origin, 400, { error: 'invalid_action', message: 'العملية غير معتمدة.' })
  } catch (error) {
    const value = error as Error & { status?: number; partial?: boolean }
    return json(origin, value.status ?? 500, { error: 'platform_user_admin_error', message: value.message || 'تعذر تنفيذ العملية.', partial: value.partial === true })
  }
})
