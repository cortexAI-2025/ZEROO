import { isNetworkError } from '../network';

describe('isNetworkError', () => {
  it('reconnaît les échecs réseau des navigateurs et de supabase-js', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true); // Safari
    expect(isNetworkError(new TypeError('NetworkError when attempting to fetch resource.'))).toBe(
      true,
    ); // Firefox
    expect(isNetworkError(new TypeError('Network request failed'))).toBe(true); // React Native
    expect(isNetworkError({ name: 'AuthRetryableFetchError', message: 'x', status: 0 })).toBe(true);
    expect(isNetworkError({ name: 'AbortError', message: 'The operation was aborted.' })).toBe(
      true,
    );
    expect(isNetworkError({ name: 'TimeoutError', message: 'The operation timed out.' })).toBe(
      true,
    );
    expect(isNetworkError({ message: 'network_error' })).toBe(true);
  });

  it('ne confond pas une erreur métier ou serveur avec une panne réseau', () => {
    expect(isNetworkError(null)).toBe(false);
    expect(isNetworkError('Failed to fetch')).toBe(false);
    expect(isNetworkError({ message: 'invalid_pickup_code', code: '22023' })).toBe(false);
    expect(
      isNetworkError({ message: 'permission denied for table merchants', code: '42501' }),
    ).toBe(false);
    expect(isNetworkError({ message: 'internal_error' })).toBe(false);
    expect(
      isNetworkError({ name: 'AuthApiError', message: 'Invalid login credentials', status: 400 }),
    ).toBe(false);
  });
});
