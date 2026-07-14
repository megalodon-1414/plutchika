import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const workbook = XLSX.readFile('c:/Users/megal/Downloads/yabai_thesaurus_v2.xlsx');
const sheet = workbook.Sheets.words;
const rows = XLSX.utils.sheet_to_json(sheet);

const emotionWords = rows.map((row, index) => {
  const angle = Number(row['x_deg(angle)']);
  const intensity = Number(row['y(intensity 0-100)']);
  const frequency = Number(row['z(abstraction 0-100)']);

  return {
    id: `e-${index + 1}`,
    text: String(row.word),
    type: 'emotion',
    frequency,
    angle: ((angle % 360) + 360) % 360,
    intensity,
  };
});

const stateWords = [
  { id: 's1', text: '美しい', type: 'state', frequency: 60, perception: -2, quality: 8 },
  { id: 's2', text: 'キツい', type: 'state', frequency: 80, perception: 7, quality: -7 },
  { id: 's3', text: '複雑だ', type: 'state', frequency: 40, perception: -8, quality: 0 },
];

const output = `import type { WordData } from '../types/word';

// Generated from yabai_thesaurus_v2.xlsx (words sheet)
export const initialWords: WordData[] = [
${[...emotionWords, ...stateWords]
  .map((word) => {
    if (word.type === 'emotion') {
      return `  { id: '${word.id}', text: '${word.text}', type: 'emotion', frequency: ${word.frequency}, angle: ${word.angle}, intensity: ${word.intensity} },`;
    }
    return `  { id: '${word.id}', text: '${word.text}', type: 'state', frequency: ${word.frequency}, perception: ${word.perception}, quality: ${word.quality} },`;
  })
  .join('\n')}
];
`;

writeFileSync('src/data/wordsData.ts', output, 'utf8');
console.log(`Generated ${emotionWords.length} emotion words and ${stateWords.length} state words.`);
