import type { ConfirmationBaseline, DictionaryEntry, DuplicatePair } from '~/types/dictionary';

/**
 * 确认基线只覆盖受审内容：词形、释义、变体、例句、来源、同义词。
 * 发音说明、词性和编者备注不在基线范围内——改备注不应影响确认状态。
 */
export const BASELINE_FIELDS = ['headword', 'definition', 'dialectVariants', 'examples', 'sources', 'synonyms'] as const;

export type BaselineField = typeof BASELINE_FIELDS[number];

export const BASELINE_FIELD_LABELS: Record<BaselineField, string> = {
  headword: '词形',
  definition: '释义',
  dialectVariants: '方言变体',
  examples: '例句',
  sources: '来源',
  synonyms: '同义词'
};

const cloneBaselineFields = (entry: DictionaryEntry) => ({
  headword: entry.headword,
  definition: entry.definition,
  dialectVariants: JSON.parse(JSON.stringify(entry.dialectVariants)) as DictionaryEntry['dialectVariants'],
  examples: JSON.parse(JSON.stringify(entry.examples)) as DictionaryEntry['examples'],
  sources: JSON.parse(JSON.stringify(entry.sources)) as DictionaryEntry['sources'],
  synonyms: [...entry.synonyms]
});

type BaselineSource = Pick<DictionaryEntry, BaselineField>;

export const captureBaseline = (entry: BaselineSource, revision: number, at = new Date().toISOString()): ConfirmationBaseline => ({
  revision,
  confirmedAt: at,
  ...cloneBaselineFields(entry as DictionaryEntry)
});

export const baselineDeviations = (entry: DictionaryEntry): BaselineField[] => {
  if (!entry.baseline) return [];
  return BASELINE_FIELDS.filter((field) => JSON.stringify(entry.baseline![field]) !== JSON.stringify(entry[field]));
};

export const hasOpenComments = (entry: DictionaryEntry) => entry.reviewerComments.some((comment) => comment.status === 'open');

/**
 * 载入历史快照（含从版本记录恢复、撤销重做）后重新判断确认状态：
 * - 遗留的已确认词条没有基线时，按当前内容补建基线，避免无依据的“已确认”；
 * - 基线仍在但受审内容与基线不符的，回到争议，不能沿用恢复前的确认状态。
 */
export const reconcileBaselines = (entries: DictionaryEntry[]) => {
  const flipped: Array<{ entry: DictionaryEntry; deviations: BaselineField[] }> = [];
  entries.forEach((entry) => {
    if (entry.status !== 'confirmed') return;
    if (!entry.baseline) {
      entry.baseline = captureBaseline(entry, 0, entry.updatedAt);
      return;
    }
    const deviations = baselineDeviations(entry);
    if (deviations.length) {
      entry.status = 'disputed';
      flipped.push({ entry, deviations });
    }
  });
  return flipped;
};

export const normalizeWord = (value: string) => value
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[\s·.'’\-_()[\]{}，。！？、]/g, '');

const bigrams = (value: string) => {
  const text = normalizeWord(value);
  if (text.length < 2) return text ? [text] : [];
  return Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2));
};

export const similarity = (left: string, right: string) => {
  const a = bigrams(left);
  const b = bigrams(right);
  if (!a.length || !b.length) return 0;
  const remaining = [...b];
  let hits = 0;
  a.forEach((token) => {
    const index = remaining.indexOf(token);
    if (index >= 0) {
      hits += 1;
      remaining.splice(index, 1);
    }
  });
  return (2 * hits) / (a.length + b.length);
};

export const findDuplicates = (entries: DictionaryEntry[]): DuplicatePair[] => {
  const pairs: DuplicatePair[] = [];
  entries.forEach((left, index) => {
    entries.slice(index + 1).forEach((right) => {
      const headwordScore = similarity(left.headword, right.headword);
      const synonymScore = Math.max(0, ...left.synonyms.map((word) => similarity(word, right.headword)), ...right.synonyms.map((word) => similarity(word, left.headword)));
      const meaningScore = similarity(left.definition, right.definition) * .35;
      const score = Math.max(headwordScore, synonymScore * .92, meaningScore);
      if (score < .62) return;
      const reasons: string[] = [];
      if (headwordScore === score) reasons.push('词形高度相似');
      if (synonymScore * .92 === score) reasons.push('同义词交叉命中');
      if (meaningScore === score) reasons.push('释义相近');
      if (left.pronunciation && right.pronunciation && similarity(left.pronunciation, right.pronunciation) > .72) reasons.push('发音相近');
      pairs.push({ leftId: left.id, rightId: right.id, score: Math.min(1, score), reasons });
    });
  });
  return pairs.sort((a, b) => b.score - a.score);
};

export const referencesToEntry = (entries: DictionaryEntry[], target: DictionaryEntry) => {
  const names = new Set([target.headword, ...target.synonyms].map(normalizeWord));
  return entries.filter((entry) => entry.id !== target.id && (
    entry.synonyms.some((synonym) => names.has(normalizeWord(synonym)))
    || entry.definition.includes(target.headword)
    || entry.examples.some((example) => names.has(normalizeWord(example.source)))
  ));
};
