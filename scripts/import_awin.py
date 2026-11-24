"""Convertit un export AWIN en catalogue statique PRIX MALIN."""
import argparse
import csv
from datetime import datetime, timezone
from decimal import Decimal
import gzip
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import sys
from tempfile import NamedTemporaryFile
from urllib.parse import parse_qsl, urlsplit
from urllib.request import HTTPRedirectHandler, build_opener

ROOT = Path(__file__).resolve().parents[1]
IMAGE_HOSTS = {'images2.productserve.com', 'cdn.shopify.com'}
FEED_LIMIT = 32 * 1024 * 1024
IMAGE_LIMIT = 8 * 1024 * 1024


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


# Validation TLS standard et aucun transfert vers une autre destination.
HTTPS = build_opener(NoRedirect())


def mirror_image(url, directory):
    if urlsplit(url).hostname not in IMAGE_HOSTS:
        raise ValueError('Hôte d’image non autorisé')
    with HTTPS.open(url, timeout=20) as response:
        data = response.read(IMAGE_LIMIT + 1)
        media_type = response.headers.get_content_type()
    signatures = {
        'image/png': ('png', b'\x89PNG\r\n\x1a\n'),
        'image/jpeg': ('jpg', b'\xff\xd8\xff'),
    }
    image_format = signatures.get(media_type)
    if image_format is None or len(data) > IMAGE_LIMIT or not data.startswith(image_format[1]):
        raise ValueError('Image AWIN invalide')
    filename = f'{sha256(data).hexdigest()}.{image_format[0]}'
    directory.mkdir(parents=True, exist_ok=True)
    target = directory / filename
    with NamedTemporaryFile(dir=directory, delete=False) as output:
        temporary = Path(output.name)
        try:
            output.write(data)
            output.close()
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    return f'./awin-images/{filename}'


def first(row, *columns):
    return next((row.get(key, '').strip() for key in columns if row.get(key, '').strip()), '')


def cents(value):
    if not re.fullmatch(r'[0-9]{1,12}(?:[.,][0-9]{1,2})?', value):
        return None
    return int(Decimal(value.replace(',', '.')) * 100)


def https_url(value):
    try:
        url = urlsplit(value)
        if url.scheme == 'https' and url.hostname and not url.username and not url.password:
            return value
    except ValueError:
        pass
    return None


def normalize(row, checked_at):
    currency = first(row, 'currency', 'store_price_currency', 'price_currency').upper()
    price = cents(first(row, 'search_price', 'store_price'))
    title = first(row, 'product_name', 'merchant_product_name')
    seller = first(row, 'merchant_name')
    deeplink = first(row, 'aw_deep_link', 'aw_deeplink')
    if re.match(r'^http://(?:www\.)?awin1\.com/', deeplink, re.IGNORECASE):
        deeplink = 'https://' + deeplink[7:]
    link = https_url(deeplink)
    if (first(row, 'merchant_id') != '66486' or first(row, 'data_feed_id') != '89534'
            or first(row, 'language').lower() not in {'', 'fr', 'fr_fr', 'fr-fr'}
            or currency != 'EUR' or not price or not title or not seller or not link):
        return None
    click = urlsplit(link)
    tracking = parse_qsl(click.query, keep_blank_values=True)
    if (click.netloc not in {'www.awin1.com', 'awin1.com'} or click.path != '/pclick.php'
            or click.fragment or len(tracking) != 3 or dict(tracking).get('m') != '66486'
            or {key for key, _ in tracking} != {'a', 'm', 'p'}
            or any(not re.fullmatch(r'[0-9]{1,24}', value) for _, value in tracking)):
        return None
    awin_id = first(row, 'aw_product_id')
    if not re.fullmatch(r'[0-9]{1,24}', awin_id):
        return None

    gtin = first(row, 'ean', 'product_gtin', 'gtin', 'upc')
    stock = first(row, 'in_stock').lower()
    quantity = first(row, 'stock_quantity')
    availability = {'1': True, 'true': True, 'yes': True, 'in stock': True,
                    '0': False, 'false': False, 'no': False, 'out of stock': False}
    in_stock = availability.get(stock)
    units = int(quantity) if re.fullmatch(r'[0-9]{1,9}', quantity) else None
    if in_stock is None and units is not None:
        in_stock = units > 0
    if units is not None and (units > 0) != in_stock:
        units = None

    return {
        'awinId': awin_id,
        'gtin': gtin if re.fullmatch(r'(?:[0-9]{8}|[0-9]{12,14})', gtin) else None,
        'title': title,
        'seller': seller,
        'currency': currency,
        'priceCents': price,
        'shippingCents': cents(first(row, 'delivery_cost')),
        'condition': 'new' if first(row, 'condition').lower() in {'new', 'neuf', 'nouveau'} else 'unknown',
        'inStock': in_stock,
        'stockQuantity': units,
        'purchaseUrl': link,
        'imageUrl': next((url for key in ('aw_image_url', 'merchant_image_url', 'large_image', 'merchant_thumb_url')
                          if (url := https_url(first(row, key)))), None),
        'checkedAt': checked_at,
        'affiliate': True,
    }


def convert(source, destination, checked_at, mirror_images):
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    count = rejected = mirrored = 0
    seen = set()
    try:
        with gzip.open(source, 'rt', encoding='utf-8-sig', newline='') as stream:
            sample = stream.read(65536)
            stream.seek(0)
            # Détecter le séparateur dans l’en-tête, indépendamment des données multilignes.
            dialect = csv.Sniffer().sniff(sample.splitlines()[0], delimiters=',;\t|')
            rows = csv.DictReader(stream, dialect=dialect, doublequote=True, strict=True)
            rows.fieldnames = [name.strip().lower() for name in rows.fieldnames]
            if 'merchant_name' not in rows.fieldnames or not {'aw_deep_link', 'aw_deeplink'}.intersection(rows.fieldnames):
                raise ValueError('En-tête AWIN absent')
            with NamedTemporaryFile(mode='w', encoding='utf-8', dir=destination.parent, delete=False) as output:
                temporary = Path(output.name)
                output.write('[')
                for row in rows:
                    if None in row or None in row.values():
                        raise ValueError('Ligne CSV incomplète')
                    offer = normalize(row, checked_at)
                    if offer is None:
                        rejected += 1
                        continue
                    if offer['awinId'] in seen:
                        raise ValueError('Identifiant produit en double')
                    seen.add(offer['awinId'])
                    if mirror_images and offer['imageUrl']:
                        offer['imageUrl'] = mirror_image(offer['imageUrl'], destination.parent / 'awin-images')
                        mirrored += 1
                    if count:
                        output.write(',\n')
                    json.dump(offer, output, ensure_ascii=False, separators=(',', ':'))
                    count += 1
                output.write(']\n')
            if not count:
                raise ValueError('Aucune offre admissible')
            temporary.replace(destination)
    finally:
        if temporary:
            temporary.unlink(missing_ok=True)
    print(f'Offres importées : {count}. Lignes écartées : {rejected}. Photos locales : {mirrored}.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--file', type=Path, help='Fichier CSV.GZ AWIN')
    source.add_argument('--download', action='store_true', help='Lire l’URL dans AWIN_BLAZEVIDEO_FR_FEED_URL')
    parser.add_argument('--output', type=Path, default=ROOT / 'awin' / 'catalog.json')
    parser.add_argument('--mirror-images', action='store_true', help='Copier les photos autorisées pour un aperçu ou un déploiement')
    args = parser.parse_args()

    try:
        if args.file:
            observed = datetime.fromtimestamp(args.file.stat().st_mtime, timezone.utc)
            convert(args.file, args.output, observed.isoformat(timespec='seconds'), args.mirror_images)
        else:
            url = https_url(os.environ.get('AWIN_BLAZEVIDEO_FR_FEED_URL', ''))
            if not url or urlsplit(url).hostname != 'productdata.awin.com':
                raise ValueError('URL AWIN invalide')
            with NamedTemporaryFile() as feed:
                with HTTPS.open(url, timeout=60) as response:
                    payload = response.read(FEED_LIMIT + 1)
                    if len(payload) > FEED_LIMIT:
                        raise ValueError('Flux compressé trop volumineux')
                    feed.write(payload)
                feed.flush()
                observed = datetime.now(timezone.utc)
                convert(feed.name, args.output, observed.isoformat(timespec='seconds'), args.mirror_images)
    except (OSError, ValueError, csv.Error, EOFError, IndexError):
        # Les exceptions réseau peuvent contenir l’URL privée et sa clé.
        print('Import AWIN impossible. Vérifiez le fichier ou l’accès au flux, le format CSV et les offres EUR.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
