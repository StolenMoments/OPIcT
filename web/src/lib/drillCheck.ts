import { diffWords, type DiffToken } from './diff';

// 'd is deliberately not expanded: it is ambiguous between "would" and "had"
// (e.g. "I'd gone" vs "I'd go"), so guessing either expansion would create
// false mismatches. Left as-is, it still normalizes consistently on both
// sides of the comparison.
const CONTRACTIONS: Record<string, string> = {
  "i'm": 'i am',
  "you're": 'you are',
  "we're": 'we are',
  "they're": 'they are',
  "he's": 'he is',
  "she's": 'she is',
  "it's": 'it is',
  "that's": 'that is',
  "there's": 'there is',
  "here's": 'here is',
  "what's": 'what is',
  "who's": 'who is',
  "let's": 'let us',
  "don't": 'do not',
  "doesn't": 'does not',
  "didn't": 'did not',
  "can't": 'can not',
  "won't": 'will not',
  "wasn't": 'was not',
  "weren't": 'were not',
  "isn't": 'is not',
  "aren't": 'are not',
  "haven't": 'have not',
  "hasn't": 'has not',
  "hadn't": 'had not',
  "shouldn't": 'should not',
  "wouldn't": 'would not',
  "couldn't": 'could not',
  "mustn't": 'must not',
  "i've": 'i have',
  "you've": 'you have',
  "we've": 'we have',
  "they've": 'they have',
  "i'll": 'i will',
  "you'll": 'you will',
  "he'll": 'he will',
  "she'll": 'she will',
  "we'll": 'we will',
  "they'll": 'they will',
  "it'll": 'it will',
  "that'll": 'that will',
};

export function normalize(text: string): string {
  const lower = text.trim().toLowerCase();
  const expanded = lower.replace(/[a-z]+'[a-z]+/g, (match) => CONTRACTIONS[match] ?? match);
  return expanded.replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export type DrillCheck = {
  exact: boolean;
  diff: DiffToken[];
};

export function checkDrillAnswer(answer: string, reference: string): DrillCheck {
  const normalizedAnswer = normalize(answer);
  const normalizedReference = normalize(reference);
  return {
    exact: normalizedAnswer === normalizedReference,
    diff: diffWords(normalizedAnswer, normalizedReference),
  };
}
