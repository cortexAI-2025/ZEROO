# Fiche légale publique d'un commerce — cadrage (non publiée, non implémentée)

Statut : **préparation uniquement**. Rien n'est publié automatiquement. Ce document n'est pas un avis juridique : la liste des mentions est à faire valider (avocat / DPO) avant toute publication.

## Principes décidés
1. La fiche légale est un objet **indépendant** de `merchant_private` (données privées : téléphone de contact, lien de paiement) et de `public_merchants` (présentation commerciale).
2. **Aucune publication automatique** : ni à l'inscription, ni à la publication du commerce, ni par recopie de `merchant_private`.
3. L'**autorisation du commerçant ne remplace pas une obligation légale** : si une mention est obligatoire pour le rôle qu'il occupe, la fiche doit pouvoir être exigée (publication du mini-site conditionnée à sa complétude), et non laissée à son bon vouloir. Inversement, une donnée non obligatoire ne se publie qu'avec son accord explicite.
4. Les mentions affichées sont **choisies champ par champ** et horodatées (qui a publié quoi, quand) ; leur retrait est possible tant qu'aucune obligation ne l'interdit.

## À déterminer avant de publier (questions juridiques)
| Question | Pourquoi |
| --- | --- |
| Qui est l'éditeur du mini-site : le restaurateur, ZEEROO, ou les deux ? | Fixe qui porte les mentions (LCEN, art. 6-III) et la responsabilité éditoriale. |
| ZEEROO est-il plateforme en ligne (information loyale, code de la consommation) ? | Détermine les informations à fournir au consommateur sur l'identité de l'exploitant. |
| Le restaurateur vend-il à distance (commande en ligne) ? | Information précontractuelle : identité, adresse, contact, prix, modalités de paiement et de retrait. |
| Statut du commerçant (société, entrepreneur individuel, micro-entrepreneur) | Les mentions et leur caractère public diffèrent ; protection de l'adresse personnelle d'un entrepreneur individuel. |
| Données d'un entrepreneur individuel (nom, adresse de domicile) | Risque RGPD : ne jamais publier une adresse personnelle ; adresse professionnelle uniquement. |

## Mentions candidates (à confirmer par le juriste)
Dénomination ou raison sociale · forme juridique et capital (sociétés) · adresse du siège ou de l'établissement (professionnelle) · numéro SIRET / RCS ou RM · numéro de TVA intracommunautaire (si assujetti) · contact (courriel et/ou téléphone professionnels) · directeur de la publication · hébergeur du site · médiateur de la consommation (vente aux consommateurs).

## Pistes techniques (quand le périmètre sera validé)
- Table dédiée `merchant_legal_public` (une ligne par commerce, colonnes = mentions retenues, `published_at`, `published_by`), fermée à l'API ; lecture publique par une fonction `security definer` qui ne rend que les champs publiés d'un commerce publié.
- Alimentation **par le restaurateur** (formulaire dédié, avec rappel de ce qui est obligatoire), jamais par copie silencieuse depuis `merchant_private`.
- Contrôle optionnel de complétude avant publication du mini-site, si l'analyse juridique conclut qu'il est obligatoire.
- Tests : anonyme ne voit que les champs publiés d'un commerce publié ; aucun champ de `merchant_private` n'apparaît ; retrait effectif.
