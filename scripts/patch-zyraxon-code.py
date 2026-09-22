#!/usr/bin/env python3
"""Apply all permanent zyraxon-code build fixes. Idempotent - safe to re-run after session reset.
These fixes enable cross-compiling the VS Code fork from Linux -> win32-x64."""
import os, sys

CODE = '/workspace/project/ZYRAXON-AI/packages/zyraxon-code'
fixes = []

# 1. asar.ts streaming (Readable.from instead of Buffer.concat) - already applied & persisted
if 'Readable.from' in open(f'{CODE}/build/lib/asar.ts').read():
    fixes.append('asar.ts streaming: present')

# 1b. asar.ts absolute-path fix: asar 3.0.3 searchNodeFromPath does
# path.relative(src, p); if p is relative (file.relative) the result is wrong,
# causing 'Cannot read properties of undefined (reading files)'. Pass absolute
# paths joined with folderPath so path.relative resolves correctly.
asar_path = f'{CODE}/build/lib/asar.ts'
s = open(asar_path).read()
asar_changed = False
old_a1 = '\t\tseenDir[dir] = true;\n\t\tfilesystem.insertDirectory(dir);'
new_a1 = '\t\t// ZYRAXON-PATCH: pass absolute path so asar path.relative(src,p) resolves correctly\n\t\tseenDir[dir] = true;\n\t\tfilesystem.insertDirectory(path.join(folderPath, dir));'
if old_a1 in s:
    s = s.replace(old_a1, new_a1); asar_changed = True
old_a2 = '\t\tfilesystem.insertFile(relativePath, shouldUnpack, { stat: stat }, {}).then(() => onFileInserted(), () => onFileInserted());'
new_a2 = '\t\t// ZYRAXON-PATCH: pass absolute path so asar path.relative(src,p) resolves correctly\n\t\tfilesystem.insertFile(path.join(folderPath, relativePath), shouldUnpack, { stat: stat }, {}).then(() => onFileInserted(), () => onFileInserted());'
if old_a2 in s:
    s = s.replace(old_a2, new_a2); asar_changed = True
if asar_changed:
    open(asar_path, 'w').write(s)
    fixes.append('asar.ts absolute-path fix: applied')
elif 'ZYRAXON-PATCH: pass absolute path' in s:
    fixes.append('asar.ts absolute-path fix: present')

# 2. postinstall.ts skip missing dirs - already persisted
if 'targetDir' in open(f'{CODE}/build/npm/postinstall.ts').read():
    fixes.append('postinstall.ts skip-missing-dirs: present')

# 3. Create logs.contribution.ts stubs (referenced by workbench contributions, absent in fork)
for sub in ['common', 'electron-browser', 'browser']:
    d = f'{CODE}/src/vs/workbench/contrib/logs/{sub}'
    os.makedirs(d, exist_ok=True)
    f = f'{d}/logs.contribution.ts'
    if not os.path.exists(f):
        with open(f, 'w') as fh:
            fh.write("/*-----------------------------------------------------------------------------\n"
                     " *  Copyright (c) Zyraxon Corporation. All rights reserved.\n"
                     " *---------------------------------------------------------------------------*/\n\n"
                     "import { Registry } from '../../../../platform/registry/common/platform.js';\n"
                     "import { Extensions, IWorkbenchContributionsRegistry } from '../../../common/contributions.js';\n\n"
                     "// Stub logs contribution for the ZYRAXON Code fork.\n"
                     "Registry.as<IWorkbenchContributionsRegistry>(Extensions.Workbench)\n"
                     "\t.registerWorkbenchContribution2('workbench.contrib.logs', class { constructor() {} }, 1);\n")
        fixes.append(f'created {sub}/logs.contribution.ts')

# 4. test-extension main.ts stub (esbuild needs an entry)
te = f'{CODE}/.vscode/extensions/test-extension'
os.makedirs(te, exist_ok=True)
main = f'{te}/main.ts'
if not os.path.exists(main):
    with open(main, 'w') as fh:
        fh.write("/* Stub entry for the test extension in the ZYRAXON Code fork. */\nexport function activate() {}\n")
    fixes.append('created test-extension/main.ts stub')

print('ZYRAXON-code fixes:')
for f in fixes:
    print('  -', f)

# 5. Fix broken extensions/node_modules/.bin/tsc symlink.
# The custom typescript package exposes 'tsc6' (TypeScript 6.0.3), but the .bin
# symlink points to ../typescript/bin/tsc which does not exist, causing ENOENT
# during packaging. Re-point to the absolute tsc6 binary.
import subprocess
tsc_link = f'{CODE}/extensions/node_modules/.bin/tsc'
tsc6 = f'{CODE}/node_modules/typescript/bin/tsc6'
if os.path.islink(tsc_link) or os.path.exists(tsc_link):
    try:
        target = os.readlink(tsc_link)
    except OSError:
        target = ''
    if target != tsc6 and os.path.exists(tsc6):
        os.remove(tsc_link)
        os.symlink(tsc6, tsc_link)
        fixes.append('fixed extensions/.bin/tsc symlink -> tsc6')
elif os.path.exists(tsc6):
    os.symlink(tsc6, tsc_link)
    fixes.append('created extensions/.bin/tsc symlink -> tsc6')

# 6. Fix tsserver: the custom typescript package has no tsserver binary, only
# lib/tsserverlibrary.js. Create a bin/tsserver wrapper and re-point the broken
# extensions/.bin/tsserver symlink.
tsserver_bin = f'{CODE}/node_modules/typescript/bin/tsserver'
tslib = f'{CODE}/node_modules/typescript/lib/tsserverlibrary.js'
if os.path.exists(tslib) and not os.path.exists(tsserver_bin):
    with open(tsserver_bin, 'w') as fh:
        fh.write('#!/usr/bin/env node\nrequire("../lib/tsserverlibrary.js");\n')
    os.chmod(tsserver_bin, 0o755)
    fixes.append('created typescript/bin/tsserver wrapper')
tsserver_link = f'{CODE}/extensions/node_modules/.bin/tsserver'
if os.path.exists(tsserver_bin):
    need = True
    if os.path.islink(tsserver_link):
        try:
            need = os.readlink(tsserver_link) != tsserver_bin
        except OSError:
            need = True
        if need:
            os.remove(tsserver_link)
    if need or not os.path.exists(tsserver_link):
        if os.path.lexists(tsserver_link):
            os.remove(tsserver_link)
        os.symlink(tsserver_bin, tsserver_link)
        fixes.append('fixed extensions/.bin/tsserver symlink -> tsserver wrapper')
