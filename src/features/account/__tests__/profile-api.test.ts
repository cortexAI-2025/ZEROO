import { requestEmailChange, updateProfile } from '../api';

const mockRpc = jest.fn();
const mockUpdateUser = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    auth: { updateUser: (...args: unknown[]) => mockUpdateUser(...args) },
  },
}));
jest.mock('@/features/notifications/push', () => ({ unregisterPush: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: () => 'https://app.zeeroo.fr/auth-callback' }));
const profile = {
  firstName: '  Léa ',
  lastName: 'Dupont',
  addressLine: '12 rue des Lilas',
  postalCode: '78190',
  city: 'Trappes',
  phone: '06 12 34 56 78',
};
beforeEach(() => {
  mockRpc.mockReset();
  mockRpc.mockResolvedValue({ error: null });
  mockUpdateUser.mockReset();
  mockUpdateUser.mockResolvedValue({
    data: { user: { email: 'old@example.test', new_email: 'new@example.test' } },
    error: null,
  });
});
it('updates the authenticated profile through the bounded RPC without accepting another user id', async () => {
  await updateProfile(profile);
  expect(mockRpc).toHaveBeenCalledWith('update_client_profile', {
    p_profile: {
      first_name: 'Léa',
      last_name: 'Dupont',
      address_line: '12 rue des Lilas',
      postal_code: '78190',
      city: 'Trappes',
      phone: '+33612345678',
    },
  });
  expect(mockUpdateUser).not.toHaveBeenCalled();
});
it('rejects blank required fields before a write', async () => {
  await expect(updateProfile({ ...profile, lastName: '' })).rejects.toThrow();
  expect(mockRpc).not.toHaveBeenCalled();
});
it('does not report an RPC failure as a successful save', async () => {
  mockRpc.mockResolvedValue({ error: new Error('offline') });
  await expect(updateProfile(profile)).rejects.toThrow('offline');
});
it('requests a confirmed email change using Auth rather than a profile table patch', async () => {
  expect(await requestEmailChange('  NEW@example.test ')).toEqual({
    email: 'new@example.test',
    confirmed: false,
  });
  expect(mockUpdateUser).toHaveBeenCalledWith(
    { email: 'new@example.test' },
    { emailRedirectTo: 'https://app.zeeroo.fr/auth-callback' },
  );
  expect(mockRpc).not.toHaveBeenCalled();
});
it('reports a completed email change only when Auth returns the new effective email', async () => {
  mockUpdateUser.mockResolvedValue({ data: { user: { email: 'new@example.test' } }, error: null });
  expect((await requestEmailChange('new@example.test')).confirmed).toBe(true);
});
it('propagates an Auth failure without showing a pending confirmation', async () => {
  mockUpdateUser.mockResolvedValue({ data: { user: null }, error: new Error('email taken') });
  await expect(requestEmailChange('new@example.test')).rejects.toThrow('email taken');
});
