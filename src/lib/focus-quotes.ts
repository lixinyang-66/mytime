import fs from 'fs';
import path from 'path';
import type { MoodKey } from '@/lib/moods';

export type FocusQuote = {
  id: string;
  moodKey: MoodKey | 'default' | 'philosophy';
  text: string;
};

const moodKeys = new Set<string>([
  'angry', 'cool', 'zen', 'unlucky', 'celebration', 'fighting', 'small-win', 'whatever',
  'happy', 'heartbroken', 'grateful', 'confused', 'hopeful', 'thumbs-up', 'annoyed', 'melancholy',
  'default',
]);

function cleanQuote(line: string): string {
  return line
    .replace(/^【[^】]+】\s*/, '')
    .replace(/\s+$/, '');
}

function loadFocusQuotes(): FocusQuote[] {
  const sourcePath = path.join(process.cwd(), 'docs', 'focus-quote-library.md');
  const markdown = fs.readFileSync(sourcePath, 'utf8');
  const quotes: FocusQuote[] = [];
  let currentMood: FocusQuote['moodKey'] | null = null;
  const counters = new Map<string, number>();

  for (const line of markdown.split(/\r?\n/)) {
    if (/^#{2,3}\s+/.test(line)) {
      const key = line.match(/`([^`]+)`/)?.[1];
      if (key && moodKeys.has(key)) {
        currentMood = key as FocusQuote['moodKey'];
        continue;
      }
      if (line.includes('轻哲理')) {
        currentMood = 'philosophy';
        continue;
      }
      currentMood = null;
      continue;
    }
    if (!currentMood || !line.startsWith('- ')) continue;
    const text = cleanQuote(line.slice(2));
    if (!text) continue;
    const index = (counters.get(currentMood) || 0) + 1;
    counters.set(currentMood, index);
    quotes.push({ id: `${currentMood}-${index}`, moodKey: currentMood, text });
  }

  return quotes;
}

const focusQuotes = loadFocusQuotes();

export function getFocusQuoteCandidates(moodKey: MoodKey | null | undefined): FocusQuote[] {
  const selectedMood = moodKey && moodKeys.has(moodKey) ? moodKey : 'default';
  const matching = focusQuotes.filter((quote) => quote.moodKey === selectedMood);
  const defaultQuotes = focusQuotes.filter((quote) => quote.moodKey === 'default');
  const philosophicalQuotes = focusQuotes.filter((quote) => quote.moodKey === 'philosophy');

  // 状态文案是主池；无状态时才使用默认池。哲理句保留为低频补充，交由 AI 从候选中谨慎选择。
  return [...(matching.length ? matching : defaultQuotes), ...philosophicalQuotes];
}

export function getStableFocusQuote(candidates: FocusQuote[], seed: string): FocusQuote | null {
  if (!candidates.length) return null;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  return candidates[hash % candidates.length];
}

export function getFocusQuoteLibrarySize(): number {
  return focusQuotes.length;
}
