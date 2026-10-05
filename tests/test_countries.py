from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools'))
import countries  # noqa: E402


class CountryTests(unittest.TestCase):
    def test_phone_numbers_become_international(self):
        cases = [('0812-3456-7890', 'ID', '+6281234567890'), ('(021) 1234567', 'ID', '+62211234567'),
                 ('62 812 3456 7890', 'ID', '+6281234567890'), ('+62 811 199 919', 'US', '+62811199919'),
                 ('0062 21 1234567', 'GB', '+62211234567'), ('020 7946 0958', 'GB', '+442079460958'),
                 ('06 1234 5678', 'IT', '+390612345678'), ('8 (495) 123-45-67', 'RU', '+74951234567'),
                 ('(617) 555-0142', 'US', '+16175550142'), ('1-617-555-0142', 'CA', '+16175550142'),
                 ('912 345 678', 'ES', '+34912345678'), ('6123 4567', 'SG', '+6561234567')]
        for number, country, expected in cases:
            with self.subTest(number=number, country=country):
                self.assertEqual(countries.e164(number, country), expected)
        for number, country in (('555-0142', 'US'), ('0812', 'ID'), ('', 'ID'), ('0812-3456-7890', ''), ('0812-3456-7890', 'ZZ')):
            with self.subTest(number=number, country=country):
                self.assertIsNone(countries.e164(number, country))

    def test_the_country_comes_from_the_batch_then_the_domain_then_the_default(self):
        self.assertEqual(countries.resolve('id', 'https://example.com/'), 'ID')
        self.assertEqual(countries.resolve('', 'https://bengkel.co.id/'), 'ID')
        self.assertEqual(countries.resolve('', 'https://shop.co.uk/'), 'GB')
        self.assertEqual(countries.resolve('', 'https://startup.io/', 'DE'), 'DE')  # .io is used as a generic ending
        self.assertEqual(countries.resolve('XX', '', 'nope'), 'US')
        self.assertEqual((countries.LANGUAGE['ID'], countries.LANGUAGE['MX'], countries.LANGUAGE.get('TH')), ('id', 'es', None))


if __name__ == '__main__':
    unittest.main()
