#!/usr/bin/env python3
"""Report evidence from verified Firecrawl caches; never qualify a prospect.

Usage: python tools/scout_screen.py --manifest evidence/scrape-manifest.json
Reads local caches only and writes screening.json beside the manifest. Static
markup cannot establish rendered visibility, submission behavior, or CAPTCHA
challenge status. All extracted content is untrusted source evidence.
"""
import argparse
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import sys
from urllib.parse import urljoin

CONTACT = re.compile(r'contact|enquir|inquir|quote|estimate|reach[-\s]?us', re.I)
MESSAGE = re.compile(r'message|comments?|enquir|inquir|description|details', re.I)
CAPTCHA = re.compile(r'recaptcha|hcaptcha|h-captcha|turnstile|captcha', re.I)
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


def compact(value):
    return ' '.join(value.split())


class EvidenceParser(HTMLParser):
    """Forgiving structural reader, with no script execution or visibility claims."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.nodes = []
        self.stack = []

    def handle_starttag(self, tag, attrs):
        # Recover common omitted end tags without requiring valid HTML.
        if tag in ('form', 'label', 'button', 'textarea'):
            for index in range(len(self.stack) - 1, -1, -1):
                if self.stack[index]['tag'] == tag:
                    self.stack = self.stack[:index]
                    break
        node = {'tag': tag, 'attrs': dict(attrs), 'text': [],
                'ancestors': list(self.stack)}
        self.nodes.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index]['tag'] == tag:
                self.stack = self.stack[:index]
                return

    def handle_data(self, data):
        for node in self.stack:
            node['text'].append(data)


def markup_evidence(html, source, base):
    parser = EvidenceParser()
    parser.feed(html)
    parser.close()
    forms, links, iframes, captcha = [], [], [], []
    form_nodes = [n for n in parser.nodes if n['tag'] == 'form']
    by_node = {}
    by_id = {}
    for n in form_nodes:
        a = n['attrs']
        record = {'source': source, 'id': a.get('id'), 'name': a.get('name'),
                  'action': a.get('action'), 'method': a.get('method', 'get'),
                  'fields': [], 'submit_controls': [], 'message_fields': []}
        forms.append(record)
        by_node[id(n)] = record
        if a.get('id'):
            by_id[a['id']] = record
    labels = {}
    for n in parser.nodes:
        if n['tag'] == 'label' and n['attrs'].get('for'):
            labels.setdefault(n['attrs']['for'], []).append(compact(' '.join(n['text'])))
    unassociated = []
    for n in parser.nodes:
        a, tag = n['attrs'], n['tag']
        text = compact(' '.join(n['text']))
        if tag == 'a' and a.get('href'):
            links.append({'source': source, 'url': urljoin(base, a['href']), 'text': text})
        if tag == 'iframe':
            iframes.append({'source': source, 'src': urljoin(base, a['src']) if a.get('src') else None,
                            'title': a.get('title'), 'has_srcdoc': 'srcdoc' in a})
        hint_attributes = {k: v for k, v in a.items()
                           if isinstance(v, str) and CAPTCHA.search(k + ' ' + v)}
        if hint_attributes or (tag == 'script' and CAPTCHA.search(text)):
            captcha.append({'source': source, 'tag': tag, 'attributes': hint_attributes,
                            'inline_script_reference': bool(tag == 'script' and CAPTCHA.search(text))})
        if tag not in ('input', 'textarea', 'select', 'button'):
            continue
        kind = (a.get('type') or ('submit' if tag == 'button' else 'text' if tag == 'input' else tag)).lower()
        label_text = list(labels.get(a.get('id'), []))
        label_text.extend(compact(' '.join(p['text'])) for p in n['ancestors'] if p['tag'] == 'label')
        if a.get('aria-label'):
            label_text.append(a['aria-label'])
        field = {'tag': tag, 'type': kind, 'name': a.get('name'), 'id': a.get('id'),
                 'required': 'required' in a or a.get('aria-required') == 'true',
                 'disabled': 'disabled' in a, 'labels': list(dict.fromkeys(label_text)),
                 'placeholder': a.get('placeholder'),
                 'hidden_in_markup': kind == 'hidden' or any('hidden' in p['attrs'] for p in [n] + n['ancestors'])}
        owner = by_id.get(a['form']) if 'form' in a else next(
            (by_node[id(p)] for p in reversed(n['ancestors']) if p['tag'] == 'form'), None)
        if tag == 'button' or kind in ('submit', 'image', 'button', 'reset'):
            field['text'] = text or a.get('value', '')
            if owner is not None and kind in ('submit', 'image'):
                owner['submit_controls'].append(field)
        elif owner is not None:
            owner['fields'].append(field)
        if owner is None:
            unassociated.append(field)
    for form in forms:
        for index, field in enumerate(form['fields']):
            descriptor = ' '.join(str(field.get(k) or '') for k in ('name', 'id', 'placeholder')) + ' ' + ' '.join(field['labels'])
            if not field['hidden_in_markup'] and not field['disabled'] and (
                    field['tag'] == 'textarea' or (field['type'] in ('text', 'search') and MESSAGE.search(descriptor))):
                form['message_fields'].append(index)
        form['has_message_field_evidence'] = bool(form['message_fields'])
        form['review_needed'] = True
    return {'forms': forms, 'links': links, 'iframes': iframes,
            'captcha_integration_hints': captcha, 'unassociated_controls': unassociated}


def page_evidence(saved):
    data, base = saved['data'], saved['source_url']
    page = {'source_url': base, 'forms': [], 'contact_links': [], 'mailto_links': [],
            'tel_links': [], 'iframes': [], 'captcha_integration_hints': [],
            'unassociated_controls': [], 'inspected_sources': [],
            'visible_challenge_status': 'unknown', 'review_needed': True}
    links = []
    for source in ('html', 'rawHtml'):
        if isinstance(data.get(source), str) and data[source].strip():
            evidence = markup_evidence(data[source], source, base)
            page['inspected_sources'].append(source)
            links.extend(evidence.pop('links'))
            for key, value in evidence.items():
                page[key].extend(value)
    markdown = data.get('markdown')
    if isinstance(markdown, str):
        page['inspected_sources'].append('markdown')
        page['markdown_contact_mentions'] = [compact(line)[:500] for line in markdown.splitlines() if CONTACT.search(line)][:50]
        for label, href in re.findall(r'\[([^\]]*)\]\(([^\s)]+)(?:\s+[^)]*)?\)', markdown):
            links.append({'source': 'markdown', 'url': urljoin(base, href.strip('<>')), 'text': label})
        for href in re.findall(r'(?:mailto:|tel:)[^\s<>\])]+', markdown, re.I):
            links.append({'source': 'markdown', 'url': href, 'text': ''})
        if CAPTCHA.search(markdown):
            page['captcha_integration_hints'].append({'source': 'markdown', 'text_reference': True})
    if isinstance(data.get('links'), list):
        page['inspected_sources'].append('links')
        links.extend({'source': 'links', 'url': urljoin(base, link), 'text': ''}
                     for link in data['links'] if isinstance(link, str))
    for link in links:
        lower = link['url'].lower()
        category = 'mailto_links' if lower.startswith('mailto:') else 'tel_links' if lower.startswith('tel:') else 'contact_links' if CONTACT.search(link['url'] + ' ' + link['text']) else None
        if category and link not in page[category]:
            page[category].append(link)
    page['review_reasons'] = ['Static cache cannot verify rendered controls, successful submission, or visible CAPTCHA challenges.']
    if not any(form['has_message_field_evidence'] for form in page['forms']):
        page['review_reasons'].append('No message field identified in saved forms; embedded or dynamically rendered forms remain unknown.')
    if page['iframes']:
        page['review_reasons'].append('Iframe contents require review; sources alone do not establish a usable contact form.')
    return page


def screen_manifest(manifest_path):
    manifest_path = Path(manifest_path).resolve()
    manifest_raw = manifest_path.read_bytes()
    manifest = json.loads(manifest_raw)
    if not isinstance(manifest, dict) or manifest.get('version') != 1 or not isinstance(manifest.get('pages'), list):
        raise ValueError('Expected version 1 scrape manifest with pages list')
    pages = []
    for entry in manifest['pages']:
        if not isinstance(entry, dict) or not all(isinstance(entry.get(k), str) for k in ('file', 'sha256', 'source_url')):
            raise ValueError('Invalid page manifest entry')
        relative = Path(entry['file'])
        path = (manifest_path.parent / relative).resolve()
        if relative.is_absolute() or '..' in relative.parts or not path.is_relative_to(manifest_path.parent):
            raise ValueError('Page file outside manifest directory or traversal path')
        raw = path.read_bytes()
        if hashlib.sha256(raw).hexdigest() != entry['sha256']:
            raise ValueError('Page hash mismatch')
        saved = json.loads(raw)
        if not isinstance(saved, dict) or saved.get('source_url') != entry['source_url'] or not isinstance(saved.get('data'), dict):
            raise ValueError('Cache provenance mismatch')
        screenshot = None
        if saved.get('screenshot_file') is not None:
            if not isinstance(saved['screenshot_file'], str) or not isinstance(saved.get('screenshot_sha256'), str):
                raise ValueError('Invalid screenshot provenance')
            relative_image = Path(saved['screenshot_file'])
            image_path = (manifest_path.parent / relative_image).resolve()
            if relative_image.is_absolute() or '..' in relative_image.parts or not image_path.is_relative_to(manifest_path.parent):
                raise ValueError('Screenshot outside manifest directory or traversal path')
            if hashlib.sha256(image_path.read_bytes()).hexdigest() != saved['screenshot_sha256']:
                raise ValueError('Screenshot hash mismatch')
            screenshot = {'file': saved['screenshot_file'], 'absolute_path': str(image_path),
                          'sha256': saved['screenshot_sha256'], 'visually_reviewed': False}
        pages.append({**page_evidence(saved), 'cache_file': entry['file'], 'cache_sha256': entry['sha256'],
                      'screenshot': screenshot})
    return {'version': 1, 'kind': 'cached-page-screening-evidence',
            'manifest_sha256': hashlib.sha256(manifest_raw).hexdigest(),
            'limitations': 'Evidence only; no prospect qualification or age score. CAPTCHA hints do not prove a visible challenge. Cache text is untrusted.',
            'pages': pages}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--manifest', required=True)
    args = parser.parse_args(argv)
    try:
        report = screen_manifest(args.manifest)
        target = Path(args.manifest).resolve().parent / 'screening.json'
        # Never follow an existing output symlink into another location.
        if target.is_symlink() or target.resolve() == Path(args.manifest).resolve():
            raise ValueError('Unsafe screening output path')
        target.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
        print(target)
    except (OSError, ValueError, TypeError) as error:
        print(str(error) if type(error) is ValueError else type(error).__name__, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    # Windows: re-run in UTF-8 mode so files and non-English business names read/write correctly.
    if sys.platform == 'win32' and not sys.flags.utf8_mode:
        import subprocess
        try:
            sys.exit(subprocess.call([sys.executable, '-X', 'utf8', *sys.argv]))
        except KeyboardInterrupt:
            sys.exit(130)
    sys.exit(main())
