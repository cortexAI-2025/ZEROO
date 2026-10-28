import { signUpWithEmail } from '../api';

const mockSignUp = jest.fn();
jest.mock('@/lib/supabase', () => ({
  supabase: { auth: { signUp: (...args: unknown[]) => mockSignUp(...args) } },
}));
jest.mock('@/features/notifications/push', () => ({ unregisterPush: jest.fn() }));
jest.mock('expo-linking', () => ({ createURL: () => 'https://app.zeeroo.fr/auth-callback' }));

const values = {
  firstName: 'Léa',
  lastName: 'Dupont',
  addressLine: '12 rue des Lilas',
  postalCode: '78190',
  city: 'Trappes',
  phone: '06 12 34 56 78',
  email: '  LEA@example.test ',
  password: 'motdepasse1',
};

beforeEach(() => {
  mockSignUp.mockReset();
  mockSignUp.mockResolvedValue({ data: { session: null }, error: null });
});
it('persists required contact metadata before email confirmation, without SMS authentication', async () => {
  expect(await signUpWithEmail(values)).toBe(true);
  const payload = mockSignUp.mock.calls[0][0];
  expect(payload.email).toBe('lea@example.test');
  expect(payload.phone).toBeUndefined();
  expect(payload.options.data).toEqual({
    signup_profile_version: 1,
    first_name: 'Léa',
    last_name: 'Dupont',
    full_name: 'Léa Dupont',
    address_line: '12 rue des Lilas',
    postal_code: '78190',
    city: 'Trappes',
    contact_phone: '+33612345678',
  });
  expect(payload.options.data.avatar_url).toBeUndefined();
});
it('rejects an incomplete profile before contacting Auth', async () => {
  await expect(signUpWithEmail({ ...values, lastName: ' ' })).rejects.toThrow();
  expect(mockSignUp).not.toHaveBeenCalled();
});
it('propagates Auth failure instead of displaying confirmation', async () => {
  mockSignUp.mockResolvedValue({ data: { session: null }, error: new Error('unavailable') });
  await expect(signUpWithEmail(values)).rejects.toThrow('unavailable');
});
