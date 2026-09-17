#!/usr/bin/env python3
"""Cross-document consistency checks for the NuraAI docs.

Run from the repository root:  python skills/docs-check/check.py
Exit code 0 = clean, 1 = problems found.
"""
import io
import os
import re
import sys
from collections import defaultdict

DOCS = ['README.md'] + sorted(
    f'docs/{n}' for n in os.listdir('docs') if n.endswith('.md')
)

# Skills tell an agent how to implement the docs, so they drift the same way and
# must be checked the same way. This folder was the gap that let SQLite guidance
# survive in three skills after the decision was reversed everywhere in docs/.
SKILLS = sorted(
    f'skills/{d}/SKILL.md' for d in os.listdir('skills')
    if os.path.isfile(f'skills/{d}/SKILL.md')
) if os.path.isdir('skills') else []

# Decisions that were reversed once and must not creep back. Each entry is
# (key, regex, why it is wrong). Add an entry whenever a contradiction is fixed,
# so the same mistake cannot return silently.
BANNED = [
    ('sqlite', r'\bDB_DIALECT\b|\bsqlite\b',
     'SQLite was dropped; PostgreSQL is the only engine (19)'),
    ('tool-model', r'Tool\s*->\s*Model',
     'inverted agent loop; the model chooses the tool (11)'),
    ('encrypt', r'must be encrypted|encrypt at rest',
     'secrets are vault refs; credentials are hashed (14)'),
    ('knowledge-store', r'Knowledge Stor(?:age|es)',
     'there is no datastore beside PostgreSQL (19)'),
    ('event-bus', r'scheduler or event bus',
     'no broker; job_schedules plus advisory lock (23)'),
    ('validate-untrusted', r'normalized or validated before use',
     'untrusted content is contained, not validated (17 C6)'),
    ('one-validation-path', r'one validation path rather than two|'
     r'one code path rather than two|native JSON Schema',
     'routes validate with zod, tool arguments with Ajv against the stored '
     'input_schema; the two paths are deliberately not one (19)'),
]

# A section may legitimately discuss a reversed decision in order to explain why
# it was reversed. Opt that section out with a marker on its own line:
#
#     <!-- docs-check: allow sqlite -->
#
# The exemption covers the rest of that section and ends at the next heading.
MARKER = re.compile(r'<!--\s*docs-check:\s*allow\s+([a-z0-9 ,-]+?)\s*-->')
HEADING = re.compile(r'^#{1,6}\s')


def read(path):
    return io.open(path, encoding='utf-8').read()


def check_fences(text, path, out):
    if len(re.findall(r'^```', text, re.M)) % 2:
        out.append(f'{path}: unbalanced code fences')


def check_links(text, path, out):
    base = os.path.dirname(path) or '.'
    for m in re.finditer(r'\]\((?!https?:)([^)#]+)', text):
        target = m.group(1).strip()
        cand = target if os.path.exists(target) else os.path.normpath(
            os.path.join(base, target))
        if not os.path.exists(cand):
            out.append(f'{path}: broken link -> {target}')


def check_doc_refs(text, path, out):
    for ref in sorted(set(re.findall(r'docs/(\d\d-[a-z-]+\.md)', text))):
        if not os.path.exists('docs/' + ref):
            out.append(f'{path}: references missing doc -> docs/{ref}')


def check_banned(text, path, out):
    allowed = set()
    for i, line in enumerate(text.splitlines(), 1):
        if HEADING.match(line):
            allowed = set()
        m = MARKER.search(line)
        if m:
            allowed |= {k for k in re.split(r'[ ,]+', m.group(1)) if k}
            continue
        for key, pattern, why in BANNED:
            if key in allowed:
                continue
            if re.search(pattern, line, re.I):
                out.append(f'{path}:{i}: reversed decision resurfacing ({why})')
                break


def collect_ids(texts):
    """Find where each T/C/R/W identifier is *defined*."""
    defined = defaultdict(set)
    tm = texts.get('docs/17-threat-model.md', '')
    defined['T'] = set(re.findall(r'^###\s+(T\d+)\s+—', tm, re.M))
    defined['C'] = set(re.findall(r'^###\s+(C\d+)\s+—', tm, re.M))
    db = texts.get('docs/14-database.md', '')
    defined['R'] = set(re.findall(r'\|\s*\*\*(R\d+)\*\*\s*\|', db))
    au = texts.get('docs/20-authentication.md', '')
    defined['W'] = set(re.findall(r'^###\s+(W\d+)\s+—', au, re.M))
    return defined


SOURCE_OF = {'T': '17', 'C': '17', 'R': '14', 'W': '20'}


def check_id_refs(texts, defined, out):
    """Every T/C/R/W identifier referenced anywhere must be defined somewhere.

    This is the check that catches a control being cited before it exists, or
    surviving in prose after being renumbered.
    """
    for path, text in texts.items():
        for kind in 'TCRW':
            for ref in sorted(set(re.findall(rf'(?<![A-Za-z0-9]){kind}(\d+)\b', text))):
                ident = f'{kind}{ref}'
                if ident not in defined[kind]:
                    out.append(f'{path}: cites {ident}, not defined in '
                               f'docs/{SOURCE_OF[kind]}')
    for kind, where in SOURCE_OF.items():
        if not defined[kind]:
            out.append(f'docs/{where}: no {kind}-identifiers found; '
                       f'heading format may have changed')


def check_permission_count(texts, out):
    perm = texts.get('docs/07-permission.md', '')
    rows = len(re.findall(r'^\|\s*`[a-z]', perm, re.M))
    stated = re.search(r'^(\d+) permissions', perm, re.M)
    if not stated:
        out.append('docs/07: no "<N> permissions" line found')
    elif int(stated.group(1)) != rows:
        out.append(f'docs/07: says {stated.group(1)} permissions, '
                   f'table has {rows} rows')
    db = texts.get('docs/14-database.md', '')
    ref = re.search(r'(\d+)-entry list', db)
    if not ref:
        out.append('docs/14: no "<N>-entry list" reference to the catalogue')
    elif int(ref.group(1)) != rows:
        out.append(f'docs/14: says {ref.group(1)}-entry catalogue, '
                   f'docs/07 table has {rows}')


WORDS = {'eight': 8, 'nine': 9, 'ten': 10, 'eleven': 11, 'twelve': 12,
         'thirteen': 13, 'fourteen': 14, 'fifteen': 15}


def check_table_count(texts, out):
    db = texts.get('docs/14-database.md', '')
    groups = [g for g in re.findall(r'^###\s+.+?\s+—\s+(.+)$', db, re.M)
              if '`' in g]
    tables = sum(len(re.findall(r'`', g)) // 2 for g in groups)
    stated = re.search(r'(\d+) tables in (\w+) groups', db)
    if not stated:
        out.append('docs/14: no "<N> tables in <M> groups" line found')
        return
    if int(stated.group(1)) != tables:
        out.append(f'docs/14: says {stated.group(1)} tables, '
                   f'group headings list {tables}')
    if WORDS.get(stated.group(2), -1) != len(groups):
        out.append(f'docs/14: says {stated.group(2)} groups, found {len(groups)}')


def check_skill_names(skills, out):
    """A skill's frontmatter name must match its directory, or it will not load."""
    for path, text in skills.items():
        folder = path.split('/')[1]
        m = re.search(r'^name:\s*(\S+)\s*$', text, re.M)
        if not m:
            out.append(f'{path}: no name in frontmatter')
        elif m.group(1) != folder:
            out.append(f'{path}: frontmatter name "{m.group(1)}" '
                       f'does not match directory "{folder}"')
        if not re.search(r'^description:\s*\S', text, re.M):
            out.append(f'{path}: no description in frontmatter')


def check_index(texts, out):
    readme = texts.get('README.md', '')
    for path in DOCS:
        if path != 'README.md' and path not in readme:
            out.append(f'README: documentation index is missing {path}')


def main():
    if not os.path.isdir('docs'):
        print('run from the repository root', file=sys.stderr)
        return 2
    texts = {p: read(p) for p in DOCS}
    skills = {p: read(p) for p in SKILLS}
    out = []
    for path, text in {**texts, **skills}.items():
        check_fences(text, path, out)
        check_links(text, path, out)
        check_doc_refs(text, path, out)
        check_banned(text, path, out)
    check_id_refs({**texts, **skills}, collect_ids(texts), out)
    check_skill_names(skills, out)
    check_permission_count(texts, out)
    check_table_count(texts, out)
    check_index(texts, out)

    if out:
        print(f'{len(out)} problem(s):\n')
        for line in out:
            print('  ' + line)
        return 1
    print(f'clean — {len(texts)} docs, {len(skills)} skills checked')
    return 0


if __name__ == '__main__':
    sys.exit(main())
