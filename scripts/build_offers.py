"""Build a GitHub Pages directory from authorized merchant exports."""
import argparse
import csv
from datetime import datetime, timedelta, timezone
from decimal import Decimal, DecimalException
import gzip
import io
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import zlib
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qsl, unquote_plus, urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
PUBLIC_FILES = ("index.html", "styles.css", "app.js", "catalog.js", "offers.js", "price-alerts.js",
                "assets/hero.webp", "assets/products.webp")
MAX_DOWNLOAD_BYTES = 32 * 1024 * 1024
MAX_EXPANDED_BYTES = 256 * 1024 * 1024
MAX_CENTS = (2**53 - 1) // 2
STOCK_STATES = {"in_stock", "out_of_stock", "preorder", "unknown"}


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def https_url(value):
    parts = urlsplit(value)
    if parts.scheme != "https" or not parts.hostname or parts.username or parts.password:
        raise ValueError("Une URL HTTPS sans identifiants est requise")
    return parts


def fetch(source):
    endpoint = os.environ[source["url_env"]]
    https_url(endpoint)
    headers = {"Accept": "application/json, text/csv, application/gzip"}
    token = os.environ[source["token_env"]] if source.get("token_env") else ""
    if token:
        header = source.get("token_header", "Authorization")
        prefix = source.get("token_prefix", "Bearer ")
        headers[header] = prefix + token
    elif source.get("token_env"):
        raise ValueError("Clé API absente")
    with build_opener(NoRedirects()).open(Request(endpoint, headers=headers), timeout=20) as response:
        body = response.read(MAX_DOWNLOAD_BYTES + 1)
    if len(body) > MAX_DOWNLOAD_BYTES:
        raise ValueError("Flux trop volumineux")
    if body.startswith(b"\x1f\x8b"):
        with gzip.GzipFile(fileobj=io.BytesIO(body)) as compressed:
            body = compressed.read(MAX_EXPANDED_BYTES + 1)
        if len(body) > MAX_EXPANDED_BYTES:
            raise ValueError("Flux décompressé trop volumineux")
    return body.decode("utf-8-sig"), token


def lookup(obj, path):
    for key in path.split(".") if path else ():
        if not isinstance(obj, dict):
            return None
        obj = obj.get(key)
    return obj


def source_rows(body, source):
    if source["format"] == "csv":
        return csv.DictReader(io.StringIO(body), delimiter=source.get("delimiter", ","))
    if source["format"] == "json":
        rows = lookup(json.loads(body, parse_float=Decimal), source.get("rows_path", ""))
        if isinstance(rows, list):
            return rows
    raise ValueError("Format de flux invalide")


def amount(value, unit):
    if value is None or isinstance(value, bool):
        return None
    try:
        cents = Decimal(str(value).strip().replace(",", "."))
        if unit == "euros":
            cents *= 100
        if not cents.is_finite() or not 0 <= cents <= MAX_CENTS or cents != cents.to_integral_value():
            return None
        return int(cents)
    except DecimalException:
        return None


def public_url(value, source, token):
    if not isinstance(value, str) or any(char.isspace() or char == "\\" for char in value):
        return None
    try:
        parts = https_url(value)
        if parts.hostname not in source["purchase_hosts"] or parts.port not in (None, 443):
            return None
        keys = source.get("public_query_keys", [])
        query = urlencode([(key, val) for key, val in parse_qsl(parts.query) if key in keys])
        public = urlunsplit(("https", parts.hostname, parts.path, query, ""))
        if token and (token in unquote_plus(public)):
            return None
        return public
    except ValueError:
        return None


def normalize(row, source, token, now):
    fields = source["fields"]
    product_id = source["product_map"].get(str(lookup(row, fields["reference"])).strip())
    if not product_id or lookup(row, fields["currency"]) != source.get("eur_value", "EUR"):
        return None
    if lookup(row, fields["condition"]) != source["new_value"]:
        return None
    unit = source.get("amount_unit", "cents")
    price = amount(lookup(row, fields["price"]), unit)
    shipping = amount(lookup(row, fields.get("shipping", "")), unit)
    url = public_url(lookup(row, fields["url"]), source, token)
    if price is None or url is None:
        return None
    timestamp = lookup(row, fields["observed_at"])
    if not isinstance(timestamp, str):
        return None
    try:
        observed = datetime.fromisoformat(timestamp)
        if observed.tzinfo is None:
            if not source.get("timestamp_timezone"):
                return None
            zone = ZoneInfo(source["timestamp_timezone"])
            localized = observed.replace(tzinfo=zone)
            if localized.utcoffset() != localized.replace(fold=1).utcoffset():
                return None
            observed = localized
        observed = observed.astimezone(timezone.utc)
        expires = observed + timedelta(hours=source["valid_hours"])
    except (ValueError, OverflowError):
        return None
    if not observed <= now < expires:
        return None
    stock_value = lookup(row, fields.get("availability", ""))
    stock = source.get("stock_values", {}).get(str(stock_value), "unknown")
    return {
        "productId": product_id,
        "merchant": source["merchant"],
        "source": source["label"],
        "currency": "EUR",
        "condition": "new",
        "priceCents": price,
        "shippingCents": shipping,
        "availability": stock if stock in STOCK_STATES else "unknown",
        "url": url,
        "observedAt": observed.astimezone(timezone.utc).isoformat(),
        "expiresAt": expires.astimezone(timezone.utc).isoformat(),
    }


def collect(config):
    offers = []
    for index, source in enumerate(config["sources"], 1):
        try:
            if source.get("amount_unit", "cents") not in {"cents", "euros"} or source["valid_hours"] <= 0:
                raise ValueError("Configuration de normalisation invalide")
            body, token = fetch(source)
            now = datetime.now(timezone.utc)
            rows = source_rows(body, source)
            normalized = [offer for row in rows if (offer := normalize(row, source, token, now))]
        except HTTPError as error:
            print(f"Source {index} indisponible (HTTP {error.code}).", file=sys.stderr)
        except (URLError, OSError, ValueError, TypeError, KeyError, AttributeError, csv.Error, OverflowError, EOFError, zlib.error):
            print(f"Source {index} ignorée : accès, format ou configuration invalide.", file=sys.stderr)
        else:
            offers.extend(normalized)
            print(f"Source {index} : {len(normalized)} offre(s) valide(s).")
    return {"version": 1, "offers": offers}


def build(output, data):
    output.mkdir(parents=True, exist_ok=True)
    for name in PUBLIC_FILES:
        destination = output / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, destination)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=output, delete=False) as file:
        json.dump(data, file, ensure_ascii=False)
        file.write("\n")
    public_feed = Path(file.name)
    public_feed.chmod(0o644)
    public_feed.replace(output / "offers.json")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    config_args = parser.add_mutually_exclusive_group()
    config_args.add_argument("--config", type=Path, help="Fichier privé décrivant les sources")
    config_args.add_argument("--config-env", help="Variable contenant la configuration JSON des sources")
    parser.add_argument("--output", type=Path, required=True, help="Nouveau répertoire public")
    args = parser.parse_args()
    output = args.output.resolve()
    if output == ROOT or output in ROOT.parents or output.exists():
        parser.error("Choisissez un nouveau répertoire de sortie.")
    try:
        if args.config:
            config = json.loads(args.config.read_text(encoding="utf-8"))
        elif args.config_env:
            config = json.loads(os.environ.get(args.config_env) or '{"sources":[]}')
        else:
            config = {"sources": []}
        if not isinstance(config.get("sources"), list):
            raise ValueError("sources doit être un tableau")
    except (OSError, ValueError, AttributeError):
        parser.error("Configuration illisible ou invalide.")
    build(output, collect(config))


if __name__ == "__main__":
    main()
