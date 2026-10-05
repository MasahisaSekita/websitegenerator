#!/usr/bin/env python3
"""Countries for the website generator: phone calling codes, search language and domain endings.

A dashboard batch names its country with an ISO 3166-1 alpha-2 code (US, ID, GB…). Target finding
searches in that country and its main language, phone numbers become international identities
(+62…), and the website brief gives the page writer the international form for tap-to-call links.
Batches without a country use `discovery.country` in settings.json.
"""
import re
from urllib.parse import urlsplit

# ISO 3166-1 alpha-2 code: international calling code.
CALLING = dict(item.split(':') for item in '''
AD:376 AE:971 AF:93 AG:1 AI:1 AL:355 AM:374 AO:244 AR:54 AS:1 AT:43 AU:61 AW:297 AX:358 AZ:994
BA:387 BB:1 BD:880 BE:32 BF:226 BG:359 BH:973 BI:257 BJ:229 BL:590 BM:1 BN:673 BO:591 BQ:599 BR:55
BS:1 BT:975 BW:267 BY:375 BZ:501 CA:1 CC:61 CD:243 CF:236 CG:242 CH:41 CI:225 CK:682 CL:56 CM:237
CN:86 CO:57 CR:506 CU:53 CV:238 CW:599 CX:61 CY:357 CZ:420 DE:49 DJ:253 DK:45 DM:1 DO:1 DZ:213
EC:593 EE:372 EG:20 EH:212 ER:291 ES:34 ET:251 FI:358 FJ:679 FK:500 FM:691 FO:298 FR:33 GA:241
GB:44 GD:1 GE:995 GF:594 GG:44 GH:233 GI:350 GL:299 GM:220 GN:224 GP:590 GQ:240 GR:30 GT:502 GU:1
GW:245 GY:592 HK:852 HN:504 HR:385 HT:509 HU:36 ID:62 IE:353 IL:972 IM:44 IN:91 IO:246 IQ:964 IR:98
IS:354 IT:39 JE:44 JM:1 JO:962 JP:81 KE:254 KG:996 KH:855 KI:686 KM:269 KN:1 KP:850 KR:82 KW:965
KY:1 KZ:7 LA:856 LB:961 LC:1 LI:423 LK:94 LR:231 LS:266 LT:370 LU:352 LV:371 LY:218 MA:212 MC:377
MD:373 ME:382 MF:590 MG:261 MH:692 MK:389 ML:223 MM:95 MN:976 MO:853 MP:1 MQ:596 MR:222 MS:1 MT:356
MU:230 MV:960 MW:265 MX:52 MY:60 MZ:258 NA:264 NC:687 NE:227 NF:672 NG:234 NI:505 NL:31 NO:47 NP:977
NR:674 NU:683 NZ:64 OM:968 PA:507 PE:51 PF:689 PG:675 PH:63 PK:92 PL:48 PM:508 PR:1 PS:970 PT:351
PW:680 PY:595 QA:974 RE:262 RO:40 RS:381 RU:7 RW:250 SA:966 SB:677 SC:248 SD:249 SE:46 SG:65 SH:290
SI:386 SJ:47 SK:421 SL:232 SM:378 SN:221 SO:252 SR:597 SS:211 ST:239 SV:503 SX:1 SY:963 SZ:268 TC:1
TD:235 TG:228 TH:66 TJ:992 TK:690 TL:670 TM:993 TN:216 TO:676 TR:90 TT:1 TV:688 TW:886 TZ:255 UA:380
UG:256 US:1 UY:598 UZ:998 VA:39 VC:1 VE:58 VG:1 VI:1 VN:84 VU:678 WF:681 WS:685 XK:383 YE:967 YT:262
ZA:27 ZM:260 ZW:263
'''.split())

# The main language for searches, where the search phrases in discover.py cover it.
LANGUAGE = {}
for _language, _codes in {
    'en': 'US GB CA AU NZ IE ZA SG PH IN PK NG KE GH UG TZ ZM ZW BW NA MW JM TT BS BB BZ MT HK GY LR SL GM FJ PG',
    'id': 'ID',
    'ms': 'MY BN',
    'es': 'ES MX AR CO CL PE VE EC GT CU BO DO HN PY SV NI CR PA UY PR GQ',
    'pt': 'BR PT AO MZ CV GW ST TL',
    'fr': 'FR BE LU MC SN CI CM ML BF NE TG BJ GA CG CD MG HT RE GP MQ GF NC PF YT',
    'de': 'DE AT CH LI',
    'it': 'IT SM VA',
    'nl': 'NL SR',
}.items():
    LANGUAGE.update(dict.fromkeys(_codes.split(), _language))

KEEP_TRUNK_ZERO = {'IT', 'SM', 'VA'}  # Italy keeps the leading 0: 06 1234 5678 is +39 06 1234 5678
# Country endings that are mostly used as generic domains (.co, .io, .ai…), so they say nothing about the business.
GENERIC_ENDINGS = {'co', 'io', 'ai', 'me', 'tv', 'ly', 'fm', 'am', 'gg', 'to', 'ws', 'cc', 'sh', 'ac', 'la', 'nu', 'vc',
                   'ag', 'bz', 'cx', 'tk', 'ml', 'ga', 'cf', 'gq', 'so', 'st', 'ms', 'md', 'sc', 'gl', 'im', 'fo', 'mu',
                   'tc', 'vg', 'li', 'gs', 'ps', 'pw', 'su'}


def valid(code):
    return isinstance(code, str) and code.strip().upper() in CALLING


def from_domain(host):
    """The country a domain ending names (.co.id → ID, .co.uk → GB), or ''."""
    ending = (host or '').lower().rstrip('.').rsplit('.', 1)[-1]
    if ending == 'uk':
        return 'GB'
    return ending.upper() if len(ending) == 2 and ending not in GENERIC_ENDINGS and ending.upper() in CALLING else ''


def resolve(country='', url='', default='US'):
    """The batch's country, else the website's country ending, else the default from settings."""
    if valid(country):
        return country.strip().upper()
    found = from_domain(urlsplit(url).hostname) if url else ''
    return found or (default.strip().upper() if valid(default) else 'US')


def e164(number, country=''):
    """The international form (+62…) of a phone number as a website shows it, or None when unsure."""
    text = str(number or '').strip()
    digits = re.sub(r'\D', '', text)
    if not digits:
        return None
    country = (country or '').strip().upper()
    if text.startswith('+'):
        full = digits
    elif digits.startswith('00'):
        full = digits[2:]  # dialled from abroad: 0062…
    else:
        code = CALLING.get(country)
        if not code:
            return None
        if code == '1':  # North America: ten digits, optionally after a 1
            if len(digits) == 11 and digits[0] == '1':
                digits = digits[1:]
            if len(digits) != 10 or digits[0] in '01':
                return None
        elif country in ('RU', 'KZ') and len(digits) == 11 and digits[0] == '8':
            digits = digits[1:]  # 8 495 … is +7 495 …
        elif digits[0] != '0' and digits.startswith(code) and len(digits) >= len(code) + 7:
            return '+' + digits if len(digits) <= 15 else None  # written with the country code but no plus
        elif country not in KEEP_TRUNK_ZERO and digits[0] == '0':
            digits = digits[1:]  # the national 0 is dropped after the country code
        full = code + digits
    return '+' + full if 8 <= len(full) <= 15 and full[0] != '0' else None
