import { supabase } from '@/lib/supabase';

export type Space = 'client' | 'merchant' | 'courier';

export async function fetchAccountSpace(): Promise<Space | null> {
  const { data, error } = await supabase.rpc('get_my_account_space');
  if (error) throw error;
  return data as Space | null;
}

export async function claimAccountSpace(space: Space): Promise<Space> {
  const { data, error } = await supabase.rpc('claim_account_space', { p_space: space });
  if (error) throw error;
  return data as Space;
}
