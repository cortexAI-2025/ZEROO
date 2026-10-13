import { parseAddressResponse } from '../address';

describe('parseAddressResponse', () => {
  it('convertit la réponse GeoJSON du géocodeur', () => {
    const body = {
      type: 'FeatureCollection',
      features: [
        {
          geometry: { type: 'Point', coordinates: [2.3314, 48.8686] },
          properties: {
            label: '12 Rue de la Paix 75002 Paris',
            name: '12 Rue de la Paix',
            postcode: '75002',
            city: 'Paris',
          },
        },
        { geometry: { coordinates: [0, 0] }, properties: { label: 'France', name: 'France' } },
      ],
    };
    expect(parseAddressResponse(body)).toEqual([
      {
        label: '12 Rue de la Paix 75002 Paris',
        addressLine: '12 Rue de la Paix',
        postalCode: '75002',
        city: 'Paris',
        latitude: 48.8686,
        longitude: 2.3314,
      },
    ]);
  });

  it('tolère une réponse vide ou invalide', () => {
    expect(parseAddressResponse(null)).toEqual([]);
    expect(parseAddressResponse({})).toEqual([]);
  });
});
