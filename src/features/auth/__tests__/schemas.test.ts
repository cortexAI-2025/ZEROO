import { signInSchema, signUpSchema } from '../schemas';

const required = {
  firstName: 'Samir',
  lastName: 'Dupont',
  addressLine: '12 rue des Lilas',
  postalCode: '78190',
  city: 'Trappes',
  phone: '06 12 34 56 78',
};

describe('signUpSchema', () => {
  it('normalise l’e-mail', () => {
    const result = signUpSchema.parse({
      ...required,
      email: '  Samir@Exemple.FR ',
      password: 'motdepasse1',
    });
    expect(result.email).toBe('samir@exemple.fr');
    expect(result.phone).toBe('+33612345678');
  });

  it.each(['court1', 'sanschiffre', '12345678'])(
    'refuse le mot de passe faible « %s »',
    (password) => {
      const result = signUpSchema.safeParse({ ...required, email: 'a@b.fr', password });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('auth.errors.passwordTooShort');
    },
  );

  it('refuse un e-mail invalide avec une clé i18n', () => {
    const result = signUpSchema.safeParse({
      ...required,
      email: 'pas-un-email',
      password: 'motdepasse1',
    });
    expect(result.error?.issues[0]?.message).toBe('auth.errors.emailInvalid');
  });
});

describe('required registration identity', () => {
  it.each([
    'firstName',
    'lastName',
    'addressLine',
    'postalCode',
    'city',
    'phone',
    'email',
  ] as const)('refuses missing or blank %s', (key) => {
    const valid = { ...required, email: 'a@b.fr', password: 'motdepasse1' };
    const missing = { ...valid } as Record<string, unknown>;
    delete missing[key];
    expect(signUpSchema.safeParse(missing).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, [key]: '   ' }).success).toBe(false);
  });
  it.each(['abc', '123', '+3306123', '0000000000'])('refuses invalid telephone %s', (phone) => {
    expect(
      signUpSchema.safeParse({ ...required, email: 'a@b.fr', password: 'motdepasse1', phone })
        .success,
    ).toBe(false);
  });
  it('preserves names with accents, apostrophes and spaces', () => {
    const result = signUpSchema.parse({
      ...required,
      email: 'a@b.fr',
      password: 'motdepasse1',
      firstName: '  Léa-Marie ',
      lastName: 'D’Angelo Ben Ali ',
    });
    expect(result.firstName).toBe('Léa-Marie');
    expect(result.lastName).toBe('D’Angelo Ben Ali');
  });
});

describe('signInSchema', () => {
  it('accepte n’importe quel mot de passe non vide (règles vérifiées à l’inscription)', () => {
    expect(signInSchema.safeParse({ ...required, email: 'a@b.fr', password: 'x' }).success).toBe(
      true,
    );
  });
});
