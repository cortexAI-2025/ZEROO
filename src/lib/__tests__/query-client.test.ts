import { queryClient } from '../query-client';

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn() },
  Platform: { OS: 'web' },
}));

describe('queryClient', () => {
  it('lance les actions de l’utilisateur tout de suite, même hors ligne (pas de commande « en attente » exécutée plus tard)', () => {
    expect(queryClient.getDefaultOptions().mutations?.networkMode).toBe('always');
  });

  it('laisse les lectures en pause hors ligne : elles reprennent seules au retour du réseau', () => {
    expect(queryClient.getDefaultOptions().queries?.networkMode).toBeUndefined(); // défaut React Query : « online »
  });
});
