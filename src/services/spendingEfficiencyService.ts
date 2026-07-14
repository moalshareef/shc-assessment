import { supabase } from '../lib/supabase'

export async function getWorkspaces() {
  const { data, error } = await supabase.from('workspaces').select('*')
  if (error) throw error
  return data
}

export async function getPillars() {
  const { data, error } = await supabase.from('pillars').select('*')
  if (error) throw error
  return data
}

export async function getRequirementsByPillar(pillarId: string) {
  const { data, error } = await supabase.from('requirements').select('*').eq('pillar_id', pillarId)
  if (error) throw error
  return data
}

export async function getPillarsSorted() {
  const { data, error } = await supabase
    .from('pillars')
    .select('id, name, code, description, sort_order, workspace_id')
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data as Array<{ id: string; name: string; code: string | null; description: string | null; sort_order: number | null; workspace_id: string | null }>
}

export async function getPillarDetails(pillarId: string) {
  const { data: subPillars, error: spError } = await supabase
    .from('sub_pillars')
    .select('id, name, code, description, source_page')
    .eq('pillar_id', pillarId)
  if (spError) throw spError

  const ids = (subPillars ?? []).map((sp: { id: string }) => sp.id)
  let questions: Array<{ id: string; sub_pillar_id: string; question_text: string; code: string | null; source_page: string | null }> = []
  if (ids.length > 0) {
    const { data: qData, error: qError } = await supabase
      .from('assessment_questions')
      .select('id, sub_pillar_id, question_text, code, source_page')
      .in('sub_pillar_id', ids)
    if (qError) throw qError
    questions = (qData ?? []) as typeof questions
  }

  type Req = { id: string; question_id: string; code: string | null; canonical_code: string | null; title: string | null; official_text: string | null; source_page: string | null; status: string | null; progress: number | null; due_date: string | null; evidence_status: string | null }
  let requirements: Req[] = []
  const qIds = questions.map((q) => q.id)
  if (qIds.length > 0) {
    const { data: rData, error: rError } = await supabase
      .from('requirements')
      .select('id, question_id, code, canonical_code, title, official_text, source_page, status, progress, due_date, evidence_status')
      .in('question_id', qIds)
    if (rError) throw rError
    requirements = (rData ?? []) as Req[]
  }

  return {
    subPillars: (subPillars ?? []) as Array<{ id: string; name: string; code: string | null; description: string | null; source_page: string | null }>,
    questions,
    requirements,
  }
}
