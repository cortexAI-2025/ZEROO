const { ANON, AUTH_URL, BASE, MAILPIT, launch, run, sql, step, visible } = require('./helpers');
const email = `test${Date.now()}@zeroo.test`;

run('Authentification', async () => {
  const browser = await launch();
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  page.on('dialog', (d) => d.accept());
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()))
      console.log('CONSOLE', m.type(), m.text().slice(0, 300));
  });

  // Sur le web, un visiteur (ou un utilisateur déconnecté) arrive sur la page d'accueil.
  const toSignIn = async () => {
    await page.getByTestId('landing-hero').filter({ visible: true }).waitFor();
    await page.getByText('Se connecter', { exact: true }).filter({ visible: true }).first().click();
    await page.getByText('Commandez, payez, récupérez').filter({ visible: true }).waitFor();
  };
  await page.goto(BASE + '/');
  await toSignIn();
  step("visiteur : page d'accueil puis écran de connexion");

  await page.getByText('Pas encore de compte').filter({ visible: true }).click();
  await page.getByLabel('Prénom (facultatif)').filter({ visible: true }).fill('Samir');
  await page.getByLabel('Adresse e-mail').filter({ visible: true }).fill(email);
  await page.getByLabel('Mot de passe').filter({ visible: true }).fill('court');
  await page.getByTestId('sign-up-submit').filter({ visible: true }).click();
  await page.getByText('8 caractères minimum').filter({ visible: true }).waitFor();
  step('validation du mot de passe faible');

  await page.getByLabel('Mot de passe').filter({ visible: true }).fill('motdepasse1');
  await page.getByTestId('sign-up-submit').filter({ visible: true }).click();
  await page.getByText('Vérifiez votre boîte mail').filter({ visible: true }).waitFor();
  step('inscription envoyée, confirmation e-mail demandée');

  // Récupère le lien de confirmation dans Mailpit.
  let link;
  for (let i = 0; i < 20 && !link; i++) {
    const list = await (
      await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`)
    ).json();
    if (list.messages?.length) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
      link = msg.Text.match(/https?:\/\/\S+verify\S+/)?.[0]?.replace(/\)$/, '');
    } else await new Promise((r) => setTimeout(r, 500));
  }
  if (!link) throw new Error('lien de confirmation introuvable');
  step('e-mail de confirmation reçu');

  // Connexion avant confirmation refusée.
  await page.goto(BASE + '/sign-in');
  await page.getByLabel('Adresse e-mail').filter({ visible: true }).fill(email);
  await page.getByLabel('Mot de passe').filter({ visible: true }).fill('motdepasse1');
  await page.getByTestId('sign-in-submit').filter({ visible: true }).click();
  await page
    .getByText("Confirmez d'abord votre adresse e-mail")
    .filter({ visible: true })
    .waitFor();
  step("connexion refusée tant que l'e-mail n'est pas confirmé");

  await page.goto(link.replace(/&amp;/g, '&'));
  await page
    .getByText('Quel type de compte souhaitez-vous créer ?')
    .filter({ visible: true })
    .waitFor({ timeout: 15000 });
  step("lien de confirmation → session ouverte → choix de l'espace");

  await page.getByTestId('choose-space-client').filter({ visible: true }).click();
  await page.getByText('Commander à emporter').filter({ visible: true }).waitFor();
  step('espace client (onglets) affiché');

  await page
    .getByRole('tab', { name: /Compte/ })
    .click()
    .catch(async () => page.getByText('Compte').filter({ visible: true }).last().click());
  await page.getByText(`Connecté en tant que ${email}`).filter({ visible: true }).waitFor();
  await page.getByText("Passer à l'espace commerçant").filter({ visible: true }).click();
  await page.getByText('Bienvenue sur ZeeRoo Pro').filter({ visible: true }).waitFor();
  step("bascule vers l'espace commerçant");

  await page.reload();
  await page.getByText('Bienvenue sur ZeeRoo Pro').filter({ visible: true }).waitFor();
  step('session et espace conservés après rechargement');

  await page.getByText('Se déconnecter').filter({ visible: true }).click();
  await toSignIn();
  step('déconnexion (depuis la création du commerce)');

  await page.getByLabel('Adresse e-mail').filter({ visible: true }).fill(email);
  await page.getByLabel('Mot de passe').filter({ visible: true }).fill('mauvais1');
  await page.getByTestId('sign-in-submit').filter({ visible: true }).click();
  await page.getByText('E-mail ou mot de passe incorrect').filter({ visible: true }).waitFor();
  await page.getByLabel('Mot de passe').filter({ visible: true }).fill('motdepasse1');
  await page.getByTestId('sign-in-submit').filter({ visible: true }).click();
  await page.getByText('Bienvenue sur ZeeRoo Pro').filter({ visible: true }).waitFor();
  step('reconnexion (mauvais puis bon mot de passe)');

  // Mot de passe oublié.
  await page.getByText('Se déconnecter').filter({ visible: true }).click();
  await toSignIn();
  await page.getByText('Mot de passe oublié ?').filter({ visible: true }).click();
  await page.getByLabel('Adresse e-mail').filter({ visible: true }).fill(email);
  await page.getByText('Envoyer le lien').filter({ visible: true }).click();
  await page.getByText(`Si un compte existe pour ${email}`).filter({ visible: true }).waitFor();
  let resetLink;
  for (let i = 0; i < 20 && !resetLink; i++) {
    const list = await (
      await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`)
    ).json();
    for (const m of list.messages ?? []) {
      const msg = await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json();
      const found = msg.Text.match(/https?:\/\/\S+type=recovery\S*/)?.[0];
      if (found) {
        resetLink = found;
        break;
      }
    }
    if (!resetLink) await new Promise((r) => setTimeout(r, 500));
  }
  if (!resetLink) throw new Error('lien de réinitialisation introuvable');
  await page.goto(resetLink);
  await page
    .getByText('Nouveau mot de passe')
    .filter({ visible: true })
    .waitFor({ timeout: 15000 });
  await page.getByLabel('Mot de passe').filter({ visible: true }).fill('nouveaupass2');
  await page.getByText('Enregistrer').filter({ visible: true }).click();
  await page.getByText('Votre mot de passe a été mis à jour.').filter({ visible: true }).waitFor();
  await page.getByText('Continuer').filter({ visible: true }).click();
  await page.getByText('Bienvenue sur ZeeRoo Pro').filter({ visible: true }).waitFor();
  step("mot de passe oublié : lien e-mail → nouveau mot de passe → retour dans l'app");

  await page.getByText("Passer à l'espace client").filter({ visible: true }).click();
  await page.getByText('Compte').filter({ visible: true }).last().click();
  await page.getByText('Supprimer mon compte').filter({ visible: true }).click();
  await toSignIn();
  await page.getByLabel('Adresse e-mail').filter({ visible: true }).fill(email);
  await page.getByLabel('Mot de passe').filter({ visible: true }).fill('nouveaupass2');
  await page.getByTestId('sign-in-submit').filter({ visible: true }).click();
  await page.getByText('E-mail ou mot de passe incorrect').filter({ visible: true }).waitFor();
  step('suppression du compte : reconnexion impossible');

  await browser.close();
});
