#!/usr/bin/env python3
"""Fail a site copy when forbidden inherited-template text remains."""
import argparse
from pathlib import Path
import sys

TEXT_EXTENSIONS = {'.html', '.js', '.jsx', '.json', '.txt', '.md'}
SKIP_PARTS = {'node_modules', 'dist', '.git', '.vercel'}

def terms(args):
    values = list(args.forbid)
    if args.forbid_file:
        values.extend(line.strip() for line in args.forbid_file.read_text().splitlines())
    return [value.casefold() for value in values if value.strip()]

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, required=True)
    parser.add_argument('--forbid', action='append', default=[], help='Case-insensitive text that must not remain; repeatable')
    parser.add_argument('--forbid-file', type=Path, help='One forbidden phrase per line')
    args = parser.parse_args()
    needles = terms(args)
    if not needles:
        parser.error('Provide --forbid or --forbid-file')
    findings = []
    for path in args.site.rglob('*'):
        if not path.is_file() or path.suffix not in TEXT_EXTENSIONS or any(part in SKIP_PARTS for part in path.parts):
            continue
        try:
            lines = path.read_text(errors='ignore').splitlines()
        except OSError:
            continue
        for number, line in enumerate(lines, 1):
            lowered = line.casefold()
            for needle in needles:
                if needle in lowered:
                    findings.append(f'{path.relative_to(args.site)}:{number}: {needle}')
    if findings:
        print('\n'.join(findings), file=sys.stderr)
        return 1
    print('Content gate passed.')

if __name__ == '__main__':
    sys.exit(main())
