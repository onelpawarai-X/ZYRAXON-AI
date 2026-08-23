p = '/workspace/project/ZYRAXON-AI/packages/zyraxon-code/build/gulpfile.vscode.ts'
s = open(p).read()

# Fix 1: hasAuthenticodeSignature - handle ENOENT for missing signtool.exe on non-Windows
old1 = "\t\tproc.on('error', reject);\n\t\tproc.on('exit', code => resolve(code === 0));"
new1 = ("\t\tproc.on('error', err => {\n"
        "\t\t\t// signtool.exe is Windows-only; on non-Windows hosts it is absent (ENOENT).\n"
        "\t\t\t// Treat as 'no signature' so the strip step becomes a safe no-op.\n"
        "\t\t\tif ((err as NodeJS.ErrnoException).code === 'ENOENT') {\n"
        "\t\t\t\tresolve(false);\n"
        "\t\t\t} else {\n"
        "\t\t\t\treject(err);\n"
        "\t\t\t}\n"
        "\t\t});\n"
        "\t\tproc.on('exit', code => resolve(code === 0));")
n1 = s.count(old1)
if n1:
    s = s.replace(old1, new1, 1)

# Fix 2: MZ magic byte check before rcedit (skip non-PE ELF/Mach-O .node files)
old2 = ("\t\t\t\tconst basename = path.basename(dep);\n"
        "\t\t\t\tconst fullPath = path.join(cwd, dep);\n"
        "\n"
        "\t\t\t\tawait stripAuthenticodeSignature(fullPath);")
new2 = ("\t\t\t\tconst basename = path.basename(dep);\n"
        "\t\t\t\tconst fullPath = path.join(cwd, dep);\n"
        "\n"
        "\t\t\t\t// rcedit can only patch Windows PE files. When cross-compiling from\n"
        "\t\t\t\t// Linux/macOS, some '*.node' addons resolve to ELF/Mach-O binaries.\n"
        "\t\t\t\t// Read the first 2 bytes and skip anything that isn't a PE ('MZ').\n"
        "\t\t\t\tconst fd = await fs.promises.open(fullPath, 'r');\n"
        "\t\t\t\tconst magic = Buffer.alloc(2);\n"
        "\t\t\t\tawait fd.read(magic, 0, 2, 0);\n"
        "\t\t\t\tawait fd.close();\n"
        "\t\t\t\tif (magic[0] !== 0x4D || magic[1] !== 0x5A) {\n"
        "\t\t\t\t\treturn;\n"
        "\t\t\t\t}\n"
        "\n"
        "\t\t\t\tawait stripAuthenticodeSignature(fullPath);")
n2 = s.count(old2)
if n2:
    s = s.replace(old2, new2, 1)
    open(p, 'w').write(s)
print('signtool ENOENT fix:', n1, '| rcedit MZ guard:', n2)
