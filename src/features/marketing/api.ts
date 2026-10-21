import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';

export type Campaign = Database['public']['Tables']['marketing_campaigns']['Row'];
export type Publication = Database['public']['Tables']['marketing_publications']['Row'];
export type CampaignWithHistory = Campaign & { marketing_publications: Publication[] };
export type AdminCampaign =
  Database['public']['Functions']['admin_list_campaigns']['Returns'][number];
export type CampaignStatus = Campaign['status'];

/** Campagnes de l'établissement (la sécurité par ligne limite déjà aux siennes) avec leur historique. */
export async function fetchMyCampaigns(merchantId: string): Promise<CampaignWithHistory[]> {
  const { data, error } = await supabase
    .from('marketing_campaigns')
    .select('*, marketing_publications(*)')
    .eq('merchant_id', merchantId)
    .order('cycle_start', { ascending: false })
    .limit(24);
  if (error) throw error;
  return data as unknown as CampaignWithHistory[];
}

export async function updateCaption(id: string, caption: string) {
  const { error } = await supabase.rpc('update_campaign_caption', { p_id: id, p_caption: caption });
  if (error) throw error;
}

export async function isPlatformAdmin() {
  const { data, error } = await supabase.rpc('is_platform_admin');
  if (error) throw error;
  return data;
}

export async function listAdminCampaigns(status?: CampaignStatus) {
  const { data, error } = await supabase.rpc(
    'admin_list_campaigns',
    status ? { p_status: status } : {},
  );
  if (error) throw error;
  return data;
}

export async function reviewCampaign(input: {
  id: string;
  approve: boolean;
  scheduledFor?: string;
  caption?: string;
}) {
  const { error } = await supabase.rpc('admin_review_campaign', {
    p_id: input.id,
    p_approve: input.approve,
    p_scheduled_for: input.scheduledFor,
    p_caption: input.caption,
  });
  if (error) throw error;
}

export async function recordPublication(input: {
  id: string;
  platform: string;
  ok: boolean;
  postUrl?: string;
  error?: string;
}) {
  const { error } = await supabase.rpc('admin_record_publication', {
    p_id: input.id,
    p_platform: input.platform,
    p_ok: input.ok,
    p_post_url: input.postUrl,
    p_error: input.error,
  });
  if (error) throw error;
}

export async function requeueCampaign(id: string, scheduledFor: string) {
  const { error } = await supabase.rpc('admin_requeue_campaign', {
    p_id: id,
    p_scheduled_for: scheduledFor,
  });
  if (error) throw error;
}
