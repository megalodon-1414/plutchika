import type { EmotionWord, StateWord, WordData, WordType } from '../types/word';

export function createDefaultWord(type: WordType): WordData {
  const id = `${type[0]}-${Date.now()}`;

  if (type === 'emotion') {
    return {
      id,
      text: '新しい単語',
      type: 'emotion',
      frequency: 50,
      angle: 0,
      intensity: 50,
    };
  }

  return {
    id,
    text: '新しい単語',
    type: 'state',
    frequency: 50,
    perception: 0,
    quality: 0,
  };
}

export function updateWord(words: WordData[], updated: WordData): WordData[] {
  return words.map((word) => (word.id === updated.id ? updated : word));
}

export function isEditableInMode(word: WordData, mode: 'emotion' | 'state'): boolean {
  return word.type === mode;
}

export function getWordsForMode(words: WordData[], mode: 'emotion' | 'state'): WordData[] {
  return words.filter((word) => isEditableInMode(word, mode));
}

export function isEmotionWord(word: WordData): word is EmotionWord {
  return word.type === 'emotion';
}

export function isStateWord(word: WordData): word is StateWord {
  return word.type === 'state';
}
