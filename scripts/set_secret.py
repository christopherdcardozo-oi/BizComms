#!/usr/bin/env python3
"""Set one secret in .env.local via a hidden prompt (nothing is echoed or printed).

Usage:
  python3 scripts/set_secret.py VAPI_API_KEY             # prompts for the value, hidden
  python3 scripts/set_secret.py VAPI_WEBHOOK_SECRET --generate   # random 48-byte value
"""
import getpass
import os
import re
import secrets
import sys

ENV_PATH = os.path.join(os.path.dirname(__file__), '..', '.env.local')
ALLOWED = re.compile(r'^[A-Z][A-Z0-9_]{2,63}$')


def main() -> int:
    if len(sys.argv) < 2 or not ALLOWED.match(sys.argv[1]):
        print(__doc__)
        return 1
    key = sys.argv[1]
    if not os.path.exists(ENV_PATH):
        print('No .env.local found. Copy .env.local.example to .env.local first.')
        return 1

    if '--generate' in sys.argv:
        value = secrets.token_urlsafe(48)
    else:
        value = getpass.getpass(f'Paste {key} (hidden), then press Enter: ').strip().strip('"').strip("'")
        if not value:
            print('Nothing entered. Nothing changed.')
            return 1
        if '"' in value or '\n' in value:
            print('That value contains a quote or newline, which is not a valid key. Nothing changed.')
            return 1

    text = open(ENV_PATH).read()
    line = f'{key}="{value}"'
    pattern = re.compile(rf'(?m)^\s*{key}\s*=.*$')
    text = pattern.sub(lambda _: line, text, count=1) if pattern.search(text) else text.rstrip('\n') + '\n' + line + '\n'
    with open(ENV_PATH, 'w') as f:
        f.write(text)
    os.chmod(ENV_PATH, 0o600)
    print(f'Saved {key} to .env.local ({len(value)} characters). You can tell Claude it is done.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
