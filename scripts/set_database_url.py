#!/usr/bin/env python3
"""Safely set DATABASE_URL in .env.local without echoing secrets.

Prompts (with hidden input) for the Supabase *Session pooler* connection string and, if it
still contains [YOUR-PASSWORD], for the database password. The password is URL-encoded so
characters like @ : / # don't break the URI. Nothing is printed except checks.

Usage: python3 scripts/set_database_url.py
"""
import getpass
import os
import re
import sys
from urllib.parse import quote, urlparse

ENV_PATH = os.path.join(os.path.dirname(__file__), '..', '.env.local')


def main() -> int:
    if not os.path.exists(ENV_PATH):
        print('No .env.local found next to this project.')
        return 1
    text = open(ENV_PATH).read()
    project_ref = re.search(r'NEXT_PUBLIC_SUPABASE_URL\s*=\s*"?https://([a-z0-9]+)\.supabase\.co', text)

    existing = re.search(r'(?m)^\s*DATABASE_URL\s*=\s*"?([^"\n]*)"?\s*$', text)
    if existing and '[YOUR-PASSWORD]' in existing.group(1):
        # The non-secret URI is already in place; only the password is still needed.
        uri = existing.group(1).strip()
    else:
        print('In Supabase: click "Connect" -> "Connection string" -> choose "Session pooler" -> copy the URI.')
        uri = getpass.getpass('Paste the Session pooler connection string (hidden), then press Enter: ').strip().strip('"').strip("'")
    if not uri.startswith(('postgres://', 'postgresql://')):
        print('That does not look like a connection string (should start with postgresql://). Nothing changed.')
        return 1

    if '[YOUR-PASSWORD]' in uri:
        password = getpass.getpass('Now type or paste your DATABASE password (hidden), then press Enter: ')
        if not password:
            print('No password entered. Nothing changed.')
            return 1
        uri = uri.replace('[YOUR-PASSWORD]', quote(password, safe=''))

    parsed = urlparse(uri)
    host = parsed.hostname or ''
    if 'pooler.supabase.com' not in host:
        print('Warning: this is not the Session pooler host (expected ...pooler.supabase.com).')
        print('The direct host often fails on home networks (IPv6 only). Continuing anyway.')
    if project_ref and project_ref.group(1) not in (parsed.username or '') + host:
        print('This connection string is for a DIFFERENT project than NEXT_PUBLIC_SUPABASE_URL. Nothing changed.')
        return 1
    if not parsed.password:
        print('No password found in the connection string. Nothing changed.')
        return 1

    line = f'DATABASE_URL="{uri}"'
    if re.search(r'(?m)^\s*DATABASE_URL\s*=.*$', text):
        text = re.sub(r'(?m)^\s*DATABASE_URL\s*=.*$', lambda _: line, text, count=1)
    else:
        text = text.rstrip('\n') + '\n' + line + '\n'
    with open(ENV_PATH, 'w') as f:
        f.write(text)
    os.chmod(ENV_PATH, 0o600)
    print('Saved DATABASE_URL to .env.local (session pooler: %s). You can tell Claude it is done.' % ('yes' if 'pooler.supabase.com' in host else 'no'))
    return 0


if __name__ == '__main__':
    sys.exit(main())
