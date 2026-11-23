# PRIX MALIN

Comparateur high-tech en français, utilisable sur smartphone et ordinateur. Le catalogue permet de rechercher des produits, de filtrer par catégorie et de comparer les offres par prix total, livraison incluse.

## Lancer le site

Depuis la racine du dépôt, avec Python 3 :

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Ouvrez http://127.0.0.1:8000 dans un navigateur. Le site est statique et fonctionne sans dépendances JavaScript, compte marchand ou clé API.

## Données

Le catalogue intégré dans `app.js` contient uniquement des produits, marchands et prix fictifs signalés dans l’interface. Les prix servent à démontrer le tri et le calcul des frais de livraison. Aucune source de prix réelle n’est connectée.
