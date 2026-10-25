# Supports QR pour les commerces

Dans l'espace restaurant, ouvrir **QR code à afficher** : flyer A6, autocollant 10 × 10 cm ou planche A4 de quatre flyers. Chaque support reprend le nom et le lien public du commerce. Depuis la nouvelle page, imprimer ou enregistrer en PDF ; sur Android, le menu Partager → Imprimer permet aussi d'enregistrer le document. Imprimer à 100 %, sans en-têtes ni pieds de page. Prévoir du papier autocollant pour la vitrine.

Le flyer se glisse dans les sacs de commande pour inviter le client à commander directement la prochaine fois. Le texte n'affirme pas que le restaurant quitte d'autres plateformes et ne promet aucune réduction. Aucun logo de plateforme tierce n'est utilisé.

Publier le commerce, vérifier son menu puis scanner un exemplaire réel avant un tirage en quantité. Un avertissement apparaît si la page n'est pas publiée. Le QR noir sur blanc conserve une zone blanche ; aucune image décorative ne le recouvre. Les documents d'impression sont autonomes, sans service de QR externe ni outil de suivi.

Validation : `npm run check` (208 tests, TypeScript, lint, formatage) et `npm run build:web` réussis. Tests des formats A6/A4/10 cm, du nombre de copies et de l'échappement HTML. Les maquettes PDF KEMERIA ont été rendues et inspectées. La recette du dialogue d'impression Android de l'application reste à faire ; Chromium local n'a pas pu être téléchargé dans cet environnement.
