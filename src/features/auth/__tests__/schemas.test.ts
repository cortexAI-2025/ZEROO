import { signInSchema, signUpSchema } from '../schemas';

describe('signUpSchema', () => {
  it('normalise l’e-mail', () => {
    const result = signUpSchema.parse({ email: '  Samir@Exemple.FR ', password: 'motdepasse1' });
    expect(result.email).toBe('samir@exemple.fr');
  });

  it.each(['court1', 'sanschiffre', '12345678'])(
    'refuse le mot de passe faible « %s »',
    (password) => {
      const result = signUpSchema.safeParse({ email: 'a@b.fr', password });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.message).toBe('auth.errors.passwordTooShort');
    },
  );

  it('refuse un e-mail invalide avec une clé i18n', () => {
    const result = signUpSchema.safeParse({ email: 'pas-un-email', password: 'motdepasse1' });
    expect(result.error?.issues[0]?.message).toBe('auth.errors.emailInvalid');
  });
});

describe('signInSchema', () => {
  it('accepte n’importe quel mot de passe non vide (règles vérifiées à l’inscription)', () => {
    expect(signInSchema.safeParse({ email: 'a@b.fr', password: 'x' }).success).toBe(true);
  });
});
