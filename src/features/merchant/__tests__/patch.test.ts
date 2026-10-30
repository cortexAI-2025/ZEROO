import { formValuesToPatch } from '../api';
import type { MerchantFormValues } from '../schemas';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

const base = {
  name: 'Chez Samir',
  category: 'snack',
  defaultPrepMinutes: 15,
  address: {
    addressLine: '1 rue A',
    postalCode: '75002',
    city: 'Paris',
    latitude: 48.8,
    longitude: 2.3,
  },
} as MerchantFormValues;

describe('formValuesToPatch : champs de la fiche stockés en privé', () => {
  it('envoie une chaîne vide (effacer) et jamais null pour un champ vidé', () => {
    const patch = formValuesToPatch({
      ...base,
      legalName: '',
      siret: '',
      vatNumber: '',
      contactEmail: '',
      phone: '',
    });
    expect(patch).toMatchObject({
      legal_name: '',
      siret: '',
      vat_number: '',
      contact_email: '',
      phone: '',
    });
  });
  it('normalise SIRET et TVA saisis', () => {
    const patch = formValuesToPatch({
      ...base,
      siret: '732 829 320 00074',
      vatNumber: 'fr32 732829320',
    });
    expect(patch.siret).toBe('73282932000074');
    expect(patch.vat_number).toBe('FR32732829320');
  });
});
