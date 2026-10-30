import { errorKey } from '../errors';

describe('errorKey', () => {
  it('reconnaît les erreurs métier levées en SQL', () => {
    expect(errorKey({ message: 'invalid_pickup_code', code: '22023' })).toBe(
      'errors.invalidPickupCode',
    );
    expect(errorKey({ message: 'invalid_transition: placed -> ready' })).toBe(
      'errors.invalidTransition',
    );
  });

  it('affiche un message dédié quand le réseau est indisponible', () => {
    expect(errorKey(new TypeError('Failed to fetch'))).toBe('common.networkError');
    expect(errorKey({ message: 'network_error' })).toBe('common.networkError');
  });

  it('retombe sur le message générique', () => {
    expect(errorKey({ message: 'boom' })).toBe('common.genericError');
    expect(errorKey(null)).toBe('common.genericError');
  });
});
