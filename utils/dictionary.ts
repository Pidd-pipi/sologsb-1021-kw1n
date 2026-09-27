import type {
  ConfirmationBaseline, DictionaryEntry, DuplicatePair, ReviewedField, ReviewedFields
} from '~/types/dictionary';

/** 受确认基线保护的字段及中文名：只改编者备注、发音、词性不会触发争议 */
export const REVIEWED_FIELD_LABELS: Record<ReviewedField, string> = {
  headword: '词形',
  definition: '释义',
  dialectVariants: '方言变体',
  examples: '例句',
  sources: '来源',
  synonyms: '同义词'
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const pickReviewedFields = (entry: DictionaryEntry): ReviewedFields => ({
  headword: entry.headword,
  definition: entry.definition,
  dialectVariants: clone(entry.dialectVariants),
  examples: clone(entry.examples),
  sources: clone(entry.sources),
  synonyms: clone(entry.synonyms)
});

const sameReviewedValue = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

/** 受审内容相对确认基线的偏离字段；无基线时返回 null */
export const baselineDrifts = (entry: DictionaryEntry): ReviewedField[] | null => {
  if (!entry.confirmBaseline) return null;
  const current = pickReviewedFields(entry);
  return (Object.keys(REVIEWED_FIELD_LABELS) as ReviewedField[])
    .filter((field) => !sameReviewedValue(current[field], entry.confirmBaseline!.fields[field]));
};

export const hasOpenComments = (entry: DictionaryEntry) =>
  entry.reviewerComments.some((comment) => comment.status === 'open');

export interface ConfirmationState {
  /** 是否满足确认/重新确认条件：无未解决意见，且受审内容与基线一致（首次确认无基线也可） */
  canConfirm: boolean;
  drifts: ReviewedField[] | null;
  openComments: number;
  /** 不满足时对审校人说明原因 */
  blockers: string[];
}

export const evaluateConfirmation = (entry: DictionaryEntry): ConfirmationState => {
  const drifts = baselineDrifts(entry);
  const openComments = entry.reviewerComments.filter((comment) => comment.status === 'open').length;
  const blockers: string[] = [];
  if (openComments > 0) blockers.push(`尚有 ${openComments} 条未解决审校意见`);
  if (drifts?.length) blockers.push(`受审内容偏离确认基线：${drifts.map((field) => REVIEWED_FIELD_LABELS[field]).join('、')}`);
  return { canConfirm: blockers.length === 0, drifts, openComments, blockers };
};

export interface BaselineListDrift<T extends { id: string }> {
  added: T[];
  removed: T[];
  changed: T[];
}

/** 对比带 id 的列表类字段（变体/例句/来源），标出新增、删除、修改的条目 */
export const listDrift = <T extends { id: string }>(
  baselineItems: T[] | undefined,
  currentItems: T[]
): BaselineListDrift<T> => {
  const base = baselineItems ?? [];
  const baseMap = new Map(base.map((item) => [item.id, item]));
  const currentMap = new Map(currentItems.map((item) => [item.id, item]));
  return {
    added: currentItems.filter((item) => !baseMap.has(item.id)),
    removed: base.filter((item) => !currentMap.has(item.id)),
    changed: currentItems.filter((item) => {
      const old = baseMap.get(item.id);
      return old && !sameReviewedValue(old, item);
    })
  };
};

/**
 * 重新判定已确认词条：恢复版本、撤销重做或载入旧数据后调用。
 * 缺基线、受审内容偏离基线、或存在未解决意见时，一律回到争议，不沿用旧确认状态。
 */
export const rejudgeConfirmedEntries = (entries: DictionaryEntry[]): number => {
  let demoted = 0;
  entries.forEach((entry) => {
    if (entry.status !== 'confirmed') return;
    const state = evaluateConfirmation(entry);
    if (!entry.confirmBaseline || !state.canConfirm) {
      entry.status = 'disputed';
      demoted += 1;
    }
  });
  return demoted;
};

/** 为没有确认基线的历史“已确认”词条补录基线（仅用于载入浏览器旧数据时迁移） */
export const migrateBaselines = (entries: DictionaryEntry[], revision: number, at: string): DictionaryEntry[] => {
  let changed = false;
  const migrated = entries.map((entry) => {
    if (entry.status === 'confirmed' && !entry.confirmBaseline) {
      changed = true;
      const baseline: ConfirmationBaseline = {
        confirmedAt: at,
        revision,
        fields: pickReviewedFields(entry)
      };
      return { ...entry, confirmBaseline: baseline };
    }
    return entry;
  });
  return changed ? migrated : entries;
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
