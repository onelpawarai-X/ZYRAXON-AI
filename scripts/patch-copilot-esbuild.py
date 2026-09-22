#!/usr/bin/env python3
"""Patch copilot/.esbuild.mts so test-only build targets don't fail when test
sources are absent (fresh clone / production packaging).

Two fixes:
  1. testBundlePlugin / sanityTestBundlePlugin onLoad: emit empty contents
     instead of throwing 'No extension tests found'.
  2. nodeExtHostSimulationTestOptions: skip when test entry/inputs absent.

Idempotent and safe to re-run after a session reset."""
import os

p = '/workspace/project/ZYRAXON-AI/packages/zyraxon-code/extensions/copilot/.esbuild.mts'
s = open(p).read()
patched = []

# Fix 1a: testBundlePlugin - emit empty instead of throw (3-tab indent)
old1a = ("\t\t\tif (files.length === 0) {\n"
         "\t\t\t\tthrow new Error('No extension tests found');\n"
         "\t\t\t}\n")
new1a = ("\t\t\t// ZYRAXON-PATCH: emit empty test bundle instead of throwing when no test sources exist.\n"
         "\t\t\tif (files.length === 0) {\n"
         "\t\t\t\treturn { contents: '// No extension tests found in this build.\\\\n', loader: 'js' };\n"
         "\t\t\t}\n")
c1a = s.count(old1a)
s = s.replace(old1a, new1a)
patched.append(f'testBundlePlugin empty-guard: {c1a}')

# sanityTestBundlePlugin has the same pattern - replace all remaining
c1b = s.count(old1a)
s = s.replace(old1a, new1a)
patched.append(f'sanityTestBundlePlugin empty-guard: {c1b}')

if c1a or c1b:
    open(p, 'w').write(s)
    s = open(p).read()
patched.append('plugins done')

# Fix 2: nodeExtHostSimulationTestOptions entry path - make it resolve relative
# to REPO_ROOT (copilot dir) using path.join so esbuild finds it. Also guard the
# whole option object to be null when the file is absent.
old2 = ("const nodeExtHostSimulationTestOptions = {\n"
        "\t...nodeExtHostBuildOptions,\n"
        "\toutdir: '.vscode/extensions/test-extension/dist',\n"
        "\tentryPoints: [\n"
        "\t\t{ in: '.vscode/extensions/test-extension/main.ts', out: './simulation-extension' }\n"
        "\t]\n"
        "} satisfies esbuild.BuildOptions;")
new2 = ("// ZYRAXON-PATCH: simulation-test entry path resolves relative to REPO_ROOT.\n"
        "// Guard the whole target so it is skipped when the stub entry is absent.\n"
        "const _simEntry = path.join(REPO_ROOT, '.vscode', 'extensions', 'test-extension', 'main.ts');\n"
        "const nodeExtHostSimulationTestOptions = fs.existsSync(_simEntry) ? {\n"
        "\t...nodeExtHostBuildOptions,\n"
        "\toutdir: '.vscode/extensions/test-extension/dist',\n"
        "\tentryPoints: [\n"
        "\t\t{ in: _simEntry, out: './simulation-extension' }\n"
        "\t]\n"
        "} satisfies esbuild.BuildOptions : null;")
c2 = s.count(old2)
if c2:
    s = s.replace(old2, new2, 1)
    patched.append(f'simulation entry path+guard: {c2}')

if c1a or c1b or c2:
    open(p, 'w').write(s)
    s = open(p).read()

# Fix 3: guard context creation and non-watch build against null options
old3 = ("const nodeExtHostSimulationContext = await esbuild.context(nodeExtHostSimulationTestOptions);\n"
        "\t\tcontexts.push(nodeExtHostSimulationContext);")
new3 = ("// ZYRAXON-PATCH: skip when simulation test options are null\n"
        "\t\tconst nodeExtHostSimulationContext = nodeExtHostSimulationTestOptions\n"
        "\t\t\t? await esbuild.context(nodeExtHostSimulationTestOptions)\n"
        "\t\t\t: null;\n"
        "\t\tif (nodeExtHostSimulationContext) { contexts.push(nodeExtHostSimulationContext); }")
c3 = s.count(old3)
if c3:
    s = s.replace(old3, new3, 1)
    patched.append(f'context guard: {c3}')

old4 = "esbuild.build(nodeExtHostSimulationTestOptions),"
new4 = "nodeExtHostSimulationTestOptions ? esbuild.build(nodeExtHostSimulationTestOptions) : Promise.resolve(),"
c4 = s.count(old4)
if c4:
    s = s.replace(old4, new4, 1)
    patched.append(f'build guard: {c4}')

if c3 or c4:
    open(p, 'w').write(s)
print('PATCHED:', ', '.join(patched))
