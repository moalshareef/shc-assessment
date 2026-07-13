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
