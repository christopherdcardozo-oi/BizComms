#!/usr/bin/env python3
"""Set one secret in .env.local through a macOS hidden-input dialog (nothing is echoed or printed).

For when a terminal prompt isn't available. Usage:
  python3 scripts/set_secret_dialog.py STRIPE_SECRET_KEY [--prefix sk_test_]
"""
from __future__ import annotations

import os
import re
import subprocess
import sys

ENV_PATH = os.path.join(os.path.dirname(__file__), '..', '.env.local')
ALLOWED = re.compile(r'^[A-Z][A-Z0-9_]{2,63}$')


def ask(key: str) -> str | None:
    script = (
        f'display dialog "Paste your {key}, then click Save. It is saved to .env.local and never shown." '
        'default answer "" with hidden answer with title "RingBack Crew setup" buttons {"Cancel", "Save"} default button "Save"'
    )
    result = subprocess.run(['osascript', '-e', script, '-e', 'text returned of result'], capture_output=True, text=True)
    if result.returncode != 0:
        return None
    return result.stdout.strip().strip('"').strip("'")


def main() -> int:
    if len(sys.argv) < 2 or not ALLOWED.match(sys.argv[1]):
        print(__doc__)
        return 1
    key = sys.argv[1]
    prefix = sys.argv[sys.argv.index('--prefix') + 1] if '--prefix' in sys.argv else ''

    value = ask(key)
    if not value:
        print('Canceled; nothing saved.')
        return 1
    if prefix and not value.startswith(prefix):
        print(f'Not saved: that value does not start with {prefix}.')
        return 1
    if '\n' in value or '"' in value:
        print('Not saved: the value contains a line break or quote.')
        return 1

    text = open(ENV_PATH).read() if os.path.exists(ENV_PATH) else ''
    line = f'{key}="{value}"'
    pattern = re.compile(rf'^\s*{key}\s*=.*$', re.M)
    text = pattern.sub(lambda _: line, text, count=1) if pattern.search(text) else text.rstrip('\n') + '\n' + line + '\n'
    with open(ENV_PATH, 'w') as f:
        f.write(text)
    print(f'Saved {key} to .env.local ({len(value)} characters).')
    return 0


if __name__ == '__main__':
    sys.exit(main())
