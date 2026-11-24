import unittest

from scripts.import_awin import normalize


class BlazeVideoImportTests(unittest.TestCase):
    def setUp(self):
        self.row = {
            'merchant_id': '66486', 'data_feed_id': '89534', 'language': '',
            'merchant_name': 'Marchand test', 'aw_product_id': '123',
            'aw_deep_link': 'https://www.awin1.com/pclick.php?p=123&a=987&m=66486',
            'product_name': 'Produit test', 'currency': 'EUR', 'search_price': '69.99',
            'delivery_cost': '0.00', 'condition': 'Nouveau', 'in_stock': '1',
            'aw_image_url': 'https://images2.productserve.com/test.png',
        }

    def test_missing_gtin_keeps_awin_identity_and_exact_price(self):
        offer = normalize(self.row, '2026-01-01T00:00:00Z')
        self.assertEqual(offer['awinId'], '123')
        self.assertIsNone(offer['gtin'])
        self.assertEqual(offer['priceCents'], 6999)
        self.assertEqual(offer['shippingCents'], 0)
        self.assertIs(offer['inStock'], True)
        self.assertIsNone(offer['stockQuantity'])
        self.assertEqual(offer['purchaseUrl'], self.row['aw_deep_link'])
        self.assertEqual(offer['imageUrl'], self.row['aw_image_url'])

    def test_rejects_wrong_feed_or_private_urls(self):
        for field, value in (
            ('data_feed_id', '12345'),
            ('currency', 'USD'),
            ('aw_deep_link', self.row['aw_deep_link'] + '&apikey=secret'),
            ('aw_deep_link', 'https://productdata.awin.com/datafeed/download/apikey/secret'),
        ):
            with self.subTest(field=field, value=value):
                self.assertIsNone(normalize({**self.row, field: value}, '2026-01-01T00:00:00Z'))
