from datetime import datetime, timezone
import gzip
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import URLError
from unittest.mock import MagicMock

from scripts.build_offers import NoRedirects, build, collect, fetch, main, normalize, source_rows


class ImportTests(unittest.TestCase):
    def setUp(self):
        example = Path(__file__).with_name("sources.example.json")
        self.source = json.loads(example.read_text())["sources"][0]
        self.source.update(amount_unit="euros", product_map={"ref": "samsung-galaxy-s24-128"})
        self.now = datetime.now(timezone.utc)
        self.row = {
            "ean": "ref", "currency": "EUR", "condition": "new",
            "priceCents": "19,99", "shippingCents": "", "availability": "in_stock",
            "purchaseUrl": "https://www.fnac.com/article?private=example#private",
            "updatedAt": self.now.isoformat(),
        }

    def test_csv_and_public_projection(self):
        headers = ";".join(self.row)
        values = ";".join(self.row.values())
        source = dict(self.source, format="csv", delimiter=";")
        row = next(source_rows(headers + "\n" + values, source))
        offer = normalize(row, source, "", self.now)
        self.assertEqual(offer["priceCents"], 1999)
        self.assertIsNone(offer["shippingCents"])
        self.assertEqual(offer["availability"], "in_stock")
        self.assertEqual(offer["url"], "https://www.fnac.com/article")

    def test_rejects_unverified_rows_and_links(self):
        self.source["public_query_keys"] = ["id"]
        for change in [
            {"ean": "unmapped"}, {"currency": "USD"}, {"condition": "used"},
            {"updatedAt": "2000-01-01T00:00:00Z"}, {"priceCents": ""},
            {"purchaseUrl": "https://www.fnac.com.example.test/article"},
            {"purchaseUrl": "https://www.fnac.com/article?id=private+token"},
        ]:
            with self.subTest(change=change):
                self.assertIsNone(normalize(self.row | change, self.source, "private token", self.now))

    def test_unavailable_source_does_not_block_healthy_source(self):
        body = json.dumps({"offers": [self.row]})
        with patch("scripts.build_offers.fetch", side_effect=[URLError("private URL"), (body, "")]):
            result = collect({"sources": [self.source, self.source]})
        self.assertEqual(len(result["offers"]), 1)

    def test_fetch_uses_private_header_and_blocks_redirects(self):
        endpoint = "https://partner.example.test/offers"
        stream = MagicMock()
        stream.__enter__.return_value.read.return_value = b'{"offers":[]}'
        with patch.dict(os.environ, {"FNAC_FEED_URL": endpoint, "FNAC_API_TOKEN": "fixture-token"}):
            with patch("scripts.build_offers.build_opener") as opener:
                opener.return_value.open.return_value = stream
                payload, _ = fetch(self.source)

        self.assertEqual(json.loads(payload), {"offers": []})
        self.assertIsInstance(opener.call_args.args[0], NoRedirects)
        request = opener.return_value.open.call_args.args[0]
        self.assertEqual(request.full_url, endpoint)
        self.assertEqual(request.get_header("Authorization"), "Bearer fixture-token")

    def test_awin_gzip_export_with_exact_reference(self):
        example = Path(__file__).with_name("sources.awin.example.json")
        source = json.loads(example.read_text())["sources"][0]
        source["product_map"] = {"000-fixture-ean": "samsung-galaxy-s24-128"}
        source["timestamp_timezone"] = "UTC"
        date = self.now.replace(tzinfo=None).isoformat()
        body = ("ean,currency,condition,search_price,delivery_cost,in_stock,merchant_deep_link,last_updated\n"
                f"000-fixture-ean,EUR,new,19.99,,1,https://www.fnac.com/test?secret=fixture,{date}\n")
        response = MagicMock()
        response.__enter__.return_value.read.return_value = gzip.compress(body.encode())
        with patch.dict(os.environ, {source["url_env"]: "https://feed.example.test/private"}):
            with patch("scripts.build_offers.build_opener") as opener:
                opener.return_value.open.return_value = response
                result = collect({"sources": [source]})
        offer, = result["offers"]
        self.assertEqual(offer["priceCents"], 1999)
        self.assertIsNone(offer["shippingCents"])
        self.assertEqual(offer["productId"], "samsung-galaxy-s24-128")
        self.assertEqual(offer["url"], "https://www.fnac.com/test")

    def test_gzip_expansion_limit(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = gzip.compress(b"12345")
        with patch.dict(os.environ, {"FNAC_FEED_URL": "https://example.test/feed", "FNAC_API_TOKEN": "test"}):
            with patch("scripts.build_offers.build_opener") as opener:
                opener.return_value.open.return_value = response
                with patch("scripts.build_offers.MAX_EXPANDED_BYTES", 4):
                    with self.assertRaises(ValueError):
                        fetch(self.source)

    def test_actions_configuration_from_environment(self):
        body = json.dumps({"offers": [self.row]})
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "public"
            argv = ["build_offers.py", "--config-env", "MERCHANT_SOURCES_JSON", "--output", str(output)]
            config = json.dumps({"sources": [self.source]})
            with patch.dict(os.environ, {"MERCHANT_SOURCES_JSON": config}):
                with patch("sys.argv", argv), patch("scripts.build_offers.fetch", return_value=(body, "token")):
                    main()
            offers = json.loads((output / "offers.json").read_text())["offers"]
            self.assertEqual([offer["merchant"] for offer in offers], ["Fnac"])

    def test_build_contains_only_public_files(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "dist"
            build(output, {"version": 1, "offers": []})
            actual = {path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file()}
            self.assertEqual(actual, {
                "app.js", "catalog.js", "offers.js", "index.html", "styles.css",
                "offers.json", "assets/hero.webp", "assets/products.webp",
            })
            self.assertEqual(json.loads((output / "offers.json").read_text())["offers"], [])


if __name__ == "__main__":
    unittest.main()
