const ts = require('typescript')
const fs = require('fs')
const f = process.argv[2]
const code = fs.readFileSync(f, 'utf8')
const r = ts.transpileModule(code, { compilerOptions: { module: 1, target: 99 } })
const name = f.split('/').pop()
console.log(name + ': ' + code.split('\n').length + ' lines, ' + r.outputText.length + ' bytes')
