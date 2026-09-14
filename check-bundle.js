import fs from 'fs';
const b = fs.readFileSync('packages/desktop/out/renderer/assets/main-DErChuq7.js','utf8');

// Find useBaseQuery function body
const idx = b.indexOf('function useBaseQuery(options, Observer2, queryClient)');
if(idx>0) console.log(b.slice(idx, idx+2000));

console.log('\n\n=== Check how useQuery wraps options ===');
const idx2 = b.indexOf('createMemo(() => options()),');
if(idx2>0) console.log(b.slice(idx2-200, idx2+200));
