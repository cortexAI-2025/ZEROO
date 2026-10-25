import { claimAccountSpace, fetchAccountSpace } from '../api';
import { supabase } from '@/lib/supabase';

jest.mock('@/lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
const rpc = supabase.rpc as jest.Mock;

beforeEach(() => rpc.mockReset());

test('lit le rôle du serveur et ignore la préférence locale de démo', async () => {
  rpc.mockResolvedValue({ data: 'courier', error: null });
  expect(await fetchAccountSpace()).toBe('courier');
  expect(rpc).toHaveBeenCalledWith('get_my_account_space');
});

test('le choix est lié à la session serveur, aucun autre user id ne peut être envoyé', async () => {
  rpc.mockResolvedValue({ data: 'merchant', error: null });
  expect(await claimAccountSpace('merchant')).toBe('merchant');
  expect(rpc).toHaveBeenCalledWith('claim_account_space', { p_space: 'merchant' });
});

test('propage le refus serveur de changer de monde', async () => {
  const error = { message: 'account_space_locked', code: '42501' };
  rpc.mockResolvedValue({ data: null, error });
  await expect(claimAccountSpace('client')).rejects.toEqual(error);
});

test('un échec réseau ne devient jamais une autorisation client', async () => {
  rpc.mockResolvedValue({ data: null, error: new Error('offline') });
  await expect(fetchAccountSpace()).rejects.toThrow('offline');
});
