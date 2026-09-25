/**
 * Supabase ダッシュボード export CSV → src/data/emotionWords/*.json
 *
 * Usage:
 *   node scripts/import-emotion-csv.mjs \
 *     path/to/emotions_rows.csv \
 *     path/to/word_types_rows.csv \
 *     path/to/emotion_words_rows.csv
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '../src/data/emotionWords');

function parseSimpleCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  const header = lines[0].split(',');
  return lines.slice(1).map((line) => {
    const vals = line.split(',');
    const row = {};
    header.forEach((key, index) => {
      row[key] = vals[index] ?? '';
    });
    return row;
  });
}

function toNum(value) {
  if (value === '' || value == null) {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

const [emotionsPath, wordTypesPath, wordsPath] = process.argv.slice(2);
if (!emotionsPath || !wordTypesPath || !wordsPath) {
  console.error(
    'Usage: node scripts/import-emotion-csv.mjs emotions.csv word_types.csv emotion_words.csv',
  );
  process.exit(1);
}

const emotions = parseSimpleCsv(emotionsPath)
  .map((row) => ({
    id: Number(row.id),
    name: row.name,
    tier: row.tier,
    combo: row.combo || null,
  }))
  .sort((a, b) => a.id - b.id);

const wordTypes = parseSimpleCsv(wordTypesPath)
  .map((row) => ({
    id: Number(row.id),
    name: row.name,
  }))
  .sort((a, b) => a.id - b.id);

const words = parseSimpleCsv(wordsPath)
  .map((row) => ({
    id: Number(row.id),
    word: row.word,
    ruby: row.ruby || null,
    meaning: row.meaning || null,
    usage_example: row.usage_example || null,
    primary_emotion_id: Number(row.primary_emotion_id),
    secondary_emotion_id: toNum(row.secondary_emotion_id),
    secondary_value: toNum(row.secondary_value),
    word_type_id: toNum(row.word_type_id),
    source: row.source || null,
    created_at: row.created_at || null,
  }))
  .sort((a, b) => a.id - b.id);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'emotions.json'), `${JSON.stringify(emotions, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'wordTypes.json'), `${JSON.stringify(wordTypes, null, 2)}\n`);
fs.writeFileSync(path.join(outDir, 'words.json'), `${JSON.stringify(words, null, 2)}\n`);

console.log(
  `Wrote ${emotions.length} emotions, ${wordTypes.length} word types, ${words.length} words → ${outDir}`,
);
