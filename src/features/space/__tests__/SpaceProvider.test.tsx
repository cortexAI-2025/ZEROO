import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { SpaceProvider, useSpace } from '../SpaceProvider';
import { claimAccountSpace, fetchAccountSpace } from '../api';

let mockUserId: string | null = 'courier-user';
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: mockUserId ? { user: { id: mockUserId } } : null, isLoading: false }),
}));
jest.mock('../api', () => ({ fetchAccountSpace: jest.fn(), claimAccountSpace: jest.fn() }));
const fetchSpace = fetchAccountSpace as jest.Mock;
const claimSpace = claimAccountSpace as jest.Mock;
let current: ReturnType<typeof useSpace>;
function Probe() {
  const space = useSpace();
  useEffect(() => {
    current = space;
  }, [space]);
  return null;
}
let renderer: ReactTestRenderer;
let client: QueryClient;
const tree = () => (
  <QueryClientProvider client={client}>
    <SpaceProvider>
      <Probe />
    </SpaceProvider>
  </QueryClientProvider>
);
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 10));
beforeEach(() => {
  mockUserId = 'courier-user';
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  fetchSpace.mockReset();
  claimSpace.mockReset();
});
afterEach(async () => {
  if (renderer) await act(async () => renderer.unmount());
  client.clear();
});

test('un compte livreur ouvre uniquement son rôle serveur et un refus ne le change pas', async () => {
  fetchSpace.mockResolvedValue('courier');
  await act(async () => {
    renderer = create(tree());
  });
  await act(settle);
  expect(current.space).toBe('courier');
  claimSpace.mockRejectedValue(new Error('account_space_locked'));
  await act(async () => {
    await expect(current.chooseSpace('client')).rejects.toThrow('account_space_locked');
  });
  expect(current.space).toBe('courier');
});

test('changer de compte ne réutilise jamais le rôle du compte précédent', async () => {
  fetchSpace.mockResolvedValueOnce('courier').mockResolvedValueOnce('client');
  await act(async () => {
    renderer = create(tree());
  });
  await act(settle);
  expect(current.space).toBe('courier');
  mockUserId = 'client-user';
  await act(async () => {
    renderer.update(tree());
  });
  expect(current.space).not.toBe('courier');
  await act(settle);
  expect(current.space).toBe('client');
  mockUserId = null;
  await act(async () => {
    renderer.update(tree());
  });
  expect(current.space).toBeNull();
});

test('si le rôle serveur est indisponible, aucun espace ne devient accessible', async () => {
  fetchSpace.mockRejectedValue(new Error('offline'));
  await act(async () => {
    renderer = create(tree());
  });
  await act(settle);
  expect(current.space).toBeNull();
  expect(current.error).toBeTruthy();
});
