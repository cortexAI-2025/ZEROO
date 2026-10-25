// Page d'accueil de l'app web : contenu, pages légales, appels à l'action, redirections.
const { BASE, launch, run, step, visible } = require('./helpers');

run("Page d'accueil", async () => {
  const browser = await launch();
  const v = visible;

  // --- Visiteur sur ordinateur ------------------------------------------------------
  const page = await (
    await browser.newContext({ viewport: { width: 1366, height: 900 } })
  ).newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  await page.goto(BASE + '/');
  await v(page.getByTestId('landing-hero'))
    .getByText('Sans commission.', { exact: false })
    .waitFor();
  if (!(await page.title()).includes('sans commission'))
    throw new Error('titre de page : ' + (await page.title()));
  await v(page.getByTestId('landing-model'))
    .getByText('ZeeRoo ne vend aucun repas', { exact: false })
    .waitFor();
  await v(page.getByTestId('landing-model'))
    .getByText('Le client paie le prix de la carte')
    .waitFor();
  await v(page.getByTestId('landing-pricing')).getByText('HT par mois').first().waitFor();
  await v(page.getByTestId('landing-comparison')).getByText('0 %', { exact: true }).waitFor();
  step('accroche, modèle (service, prix de la carte, abonnement fixe), comparaison et tarifs HT (Start, Pro, Livreur)');

  await v(page.getByText('ZeeRoo vend-il des repas', { exact: false })).click();
  await v(page.getByText('Non. ZeeRoo est un service', { exact: false })).waitFor();
  step('FAQ dépliable : « ZeeRoo vend-il des repas ? Non. ZeeRoo est un service… »');

  await v(page.getByText('Mentions légales')).first().click();
  await v(
    page.getByText('ZeeRoo ne vend aucun repas : les produits sont vendus par chaque restaurant', {
      exact: false,
    }),
  ).waitFor();
  await v(page.getByText("Retour à l'accueil")).click();
  await v(page.getByText('Confidentialité')).first().click();
  await v(page.getByText('Elle n’est jamais enregistrée', { exact: false }))
    .or(v(page.getByText("Elle n'est jamais enregistrée", { exact: false })))
    .first()
    .waitFor();
  await v(page.getByText('Google (calcul du temps de trajet', { exact: false })).waitFor();
  await v(page.getByText("Retour à l'accueil")).click();
  step('mentions légales et politique de confidentialité accessibles depuis le pied de page');

  await v(page.getByTestId('landing-cta-restaurant')).first().click();
  await v(page.getByTestId('sign-up-submit')).waitFor();
  const space = await page.evaluate(() => localStorage.getItem('zeroo.space'));
  if (space !== null) throw new Error('aucun rôle ne doit être stocké dans le navigateur : ' + space);
  step('« Inscrire mon restaurant » → inscription, aucun rôle local accordé');

  // --- Téléphone ----------------------------------------------------------------------
  const mobile = await (
    await browser.newContext({ viewport: { width: 390, height: 844 } })
  ).newPage();
  await mobile.goto(BASE + '/');
  await v(mobile.getByTestId('landing-hero')).waitFor();
  const overflow = await mobile.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  if (overflow > 0) throw new Error(`débordement horizontal de ${overflow}px sur mobile`);
  step('mobile (390 px) : pas de débordement horizontal');

  // --- Utilisateur connecté : directement dans son espace ----------------------------
  await mobile.goto(BASE + '/sign-in');
  await v(mobile.getByLabel('Adresse e-mail')).fill('client@zeroo.test');
  await v(mobile.getByLabel('Mot de passe')).fill('motdepasse1');
  await v(mobile.getByTestId('sign-in-submit')).click();
  await mobile.getByTestId('choose-space-client').click();
  await v(mobile.getByText('Commander à emporter')).waitFor();
  await mobile.goto(BASE + '/');
  await v(mobile.getByText('Commander à emporter')).waitFor();
  if (!mobile.url().endsWith('/explore'))
    throw new Error('redirection attendue vers /explore : ' + mobile.url());
  step('utilisateur connecté sur l'app web → redirigé vers son espace (/explore)');

  await browser.close();
});
