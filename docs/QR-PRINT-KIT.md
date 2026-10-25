# Supports QR pour les commerces

Dans l'espace restaurant, ouvrir **QR code à afficher**. Les deux QR ont des destinations distinctes :

| Support | Destination | Usage |
|---|---|---|
| Vitrine, autocollant 10 × 10 cm | `https://app.zeeroo.fr/m/<slug>` | Clients et livreurs : ouvrir ce commerce dans l'application. Un livreur connecté rejoint sa recherche de restaurants ; aucune demande de rattachement automatique. |
| Flyer A6, planche A4 de quatre flyers | `https://zeeroo.fr/m/<slug>` | Présenter ZeeRoo puis découvrir le mini-site du professionnel si son option est active, sinon sa fiche simple sur zeeroo.fr. |

Les fiches, mini-sites et l'annuaire par ville/département appartiennent au dépôt `zeroo_mainpage`. Le lien du flyer reste identique quand l'option Pro change. Les anciens liens `/m/<slug>` passent par la page 404 de GitHub Pages vers `/m/?pro=<slug>` ; les pages publiques ne nécessitent pas de compte. Le bouton de commande ouvre l'application. La publication coordonnée du site vitrine est requise pour cette destination.

Depuis l'écran, imprimer ou enregistrer en PDF ; sur Android, le menu Partager → Imprimer permet aussi d'enregistrer le document. Imprimer à 100 %, sans en-têtes ni pieds de page. Prévoir du papier autocollant pour la vitrine.

Le flyer se glisse dans les sacs de commande pour inviter le client à commander directement la prochaine fois. Aucun logo de plateforme tierce ni réduction promise.

Publier le commerce, vérifier son menu puis scanner un exemplaire réel avant un tirage en quantité. Un avertissement apparaît si la page n'est pas publiée. Les QR noirs sur blanc conservent leur zone blanche ; aucune décoration ne les recouvre. Les documents d'impression sont autonomes, sans service QR externe ni outil de suivi.

Validation : tests des formats A6/A4/10 cm, nombre de copies, échappement HTML et destinations distinctes. La recette du dialogue d'impression Android reste à effectuer sur un appareil réel.
