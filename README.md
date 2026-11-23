# PRIX MALIN

Comparateur high-tech en français, utilisable sur smartphone et ordinateur. Recherchez une marque ou un modèle, par exemple Samsung Galaxy S24, Apple iPhone 16 ou Xiaomi Redmi Note 14 5G. Le catalogue est une sélection de références et de variantes, définie dans `catalog.js`.

## Lancer le site

Depuis la racine du dépôt, avec Python 3 :

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Ouvrez http://127.0.0.1:8000 dans un navigateur. Le site est statique et fonctionne sans dépendances JavaScript.

## Connecter des offres marchandes

Le site livré affiche « Prix indisponible ». L’importeur Python 3.11+ s’exécute en dehors du navigateur et produit un dossier public prêt pour GitHub Pages. Il accepte les API GET qui renvoient un tableau JSON et les exports CSV UTF-8. Les API qui nécessitent OAuth, une signature, une pagination ou un autre format doivent être converties côté serveur en un export autorisé complet avant l’import.

### Accès à obtenir

| Marchand | Accès nécessaire |
| --- | --- |
| Fnac | Export catalogue/offres Fnac ou API partenaire approuvée, avec autorisation d’afficher les données sur PRIX MALIN. |
| Darty | Export ou API partenaire couvrant les offres Darty. Vérifiez la couverture Darty séparément, même si le contrat couvre aussi Fnac. |
| Boulanger | Flux produit Boulanger approuvé ou accès API explicitement autorisé pour la comparaison publique. |
| Cdiscount | Flux produit Cdiscount approuvé ou accès API explicitement autorisé pour la comparaison publique. |
| Autres marchands | Flux ou API autorisé du marchand ou du réseau partenaire qui distribue ses offres. |

Pour chaque accès, demandez l’URL de l’export, les identifiants en lecture seule si requis, la documentation des champs, les droits de republication, la cadence et la durée de validité. Le flux doit fournir la référence exacte, le prix TTC en euros, le stock, l’horodatage du relevé et un lien d’achat public. Pour comparer le coût complet, demandez aussi les frais de livraison sur une même zone et pour un même mode de livraison.

### Configurer et publier

1. Copiez `scripts/sources.example.json` dans un fichier privé, par exemple `sources.local.json`. L’exemple illustre la configuration et ses champs, dont les noms doivent être adaptés au contrat. Ajoutez une entrée `sources` par marchand. Dans `product_map`, associez chaque GTIN/EAN ou référence fabricant exacte à l’identifiant de variante de `catalog.js`. Vérifiez la capacité, l’état neuf et le périmètre de livraison avant d’associer une offre.
2. Placez les URL privées et les clés dans le coffre de l’exécuteur. Avec GitHub Actions, utilisez les secrets d’un environnement protégé et injectez-les uniquement dans l’étape d’import qui tourne depuis une branche de confiance. `url_env` et `token_env` désignent les noms des variables, par exemple `FNAC_FEED_URL` et `FNAC_API_TOKEN`. Sans clé, omettez `token_env`. Par défaut, la clé passe dans `Authorization: Bearer …`. `token_header` et `token_prefix` permettent un autre en-tête documenté.
3. Lancez la commande depuis la racine du dépôt. Le répertoire de sortie doit être nouveau.

   ```sh
   python3 scripts/build_offers.py --config sources.local.json --output dist
   ```

4. Publiez **uniquement `dist/`** dans GitHub Pages. Si vous utilisez GitHub Actions pour Pages, choisissez **GitHub Actions** dans les paramètres Pages et téléversez uniquement ce répertoire comme artefact Pages. Prévoyez des reconstructions selon les conditions des flux. Le dépôt ne déclenche aucun déploiement automatique. Lancez la commande sans `--config` pour construire le site sans offres.

Le JSON peut être un tableau à la racine ou sous `rows_path`. Le CSV utilise une ligne d’en-têtes et un séparateur configurable avec `delimiter`. Les chemins de champs JSON peuvent être imbriqués avec des points. `amount_unit` vaut `cents` ou `euros`. `new_value`, `eur_value` et `stock_values` traduisent les valeurs du flux. `valid_hours` fixe la durée de validité depuis l’horodatage du relevé, selon la limite autorisée par le fournisseur.

L’import exige HTTPS et refuse les redirections. Les liens d’achat doivent appartenir à un hôte exact de `purchase_hosts`. Les paramètres d’URL sont supprimés sauf les noms explicitement autorisés par `public_query_keys`. Autorisez uniquement des paramètres publics nécessaires au lien. L’importeur ne journalise ni les URL privées, ni les clés, ni les lignes sources. Si un marchand échoue, les autres restent importés et le marchand concerné apparaît avec « Prix indisponible ».

### Format public

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

Aucun accès marchand n’est configuré dans le dépôt. Le site trie les totaux connus par ordre croissant et place les offres aux frais de livraison inconnus après ces totaux. Le stock est affiché séparément.
