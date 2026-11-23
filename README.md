# PRIX MALIN

Comparateur high-tech en français, utilisable sur smartphone et ordinateur. Recherchez une marque ou un modèle, par exemple Samsung Galaxy S24, Apple iPhone 16 ou Xiaomi Redmi Note 14 5G. Le catalogue est une sélection de références et de variantes, définie dans `catalog.js`.

## Lancer le site

Depuis la racine du dépôt, avec Python 3 :

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Ouvrez http://127.0.0.1:8000 dans un navigateur. Le site est statique et fonctionne sans dépendances JavaScript.

## Alimenter les offres marchandes

Le fichier `offers.json` livré est vide. Pour activer les prix, programmez un import sur votre infrastructure à partir des API ou flux dont les conditions vous autorisent à republier ces données. Publiez le fichier normalisé à côté de `index.html` sur la même origine. Gardez les jetons et les URL privées dans l’importeur côté serveur. La comparaison affiche « Prix indisponible » tant qu’elle ne reçoit aucune offre valide pour la variante et le marchand.

Format du fichier : un objet JSON avec `version: 1` et un tableau `offers`. Chaque ligne correspond à une offre et contient ces champs :

| Champ | Valeur attendue |
| --- | --- |
| `productId` | Identifiant de la variante dans `catalog.js`. Associer l’offre à partir de son GTIN/EAN ou de sa référence fabricant exacte, capacité comprise. |
| `merchant` | Nom du vendeur. Utiliser `Fnac`, `Darty`, `Boulanger` ou `Cdiscount` pour ces marchands, et le nom réel pour tout autre marchand. |
| `source` | Libellé public du flux ou de l’API autorisés. |
| `currency` et `condition` | `EUR` et `new`. |
| `priceCents` | Prix TTC du produit en centimes d’euro. |
| `shippingCents` | Livraison TTC en centimes d’euro, `0` pour une livraison gratuite confirmée ou `null` pour un coût inconnu. |
| `availability` | `in_stock`, `out_of_stock`, `preorder` ou `unknown`. |
| `url` | Lien public HTTPS vers l’offre exacte, fourni ou autorisé par la source. |
| `observedAt` et `expiresAt` | Horodatages ISO 8601 avec fuseau, issus du relevé et de sa durée de validité. |

Normalisez toutes les offres sur le même périmètre de livraison pour permettre la comparaison. Renouvelez le fichier selon la cadence et les conditions de vos sources. Une offre expirée ou invalide est écartée. Lorsque la livraison est inconnue, le site affiche le prix de l’article et laisse le total indisponible. La recherche fonctionne même si le fichier est absent ou inaccessible.

Aucun flux partenaire n’est configuré dans le dépôt. Le format normalisé est commun aux marchands et doit être alimenté par un importeur adapté aux sources auxquelles vous avez accès.
