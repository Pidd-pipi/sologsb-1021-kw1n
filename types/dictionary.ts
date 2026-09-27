export type EntryStatus = 'draft' | 'review' | 'disputed' | 'confirmed';

export interface DialectVariant {
  id: string;
  dialect: string;
  form: string;
  pronunciation: string;
  note: string;
}

export interface ExampleSentence {
  id: string;
  text: string;
  translation: string;
  source: string;
}

export interface DictionarySource {
  id: string;
  title: string;
  citation: string;
  url: string;
}

export interface ReviewComment {
  id: string;
  field: string;
  author: string;
  message: string;
  status: 'open' | 'resolved';
  createdAt: string;
  replies: Array<{ id: string; author: string; message: string; createdAt: string }>;
}

export type ReviewedField = 'headword' | 'definition' | 'dialectVariants' | 'examples' | 'sources' | 'synonyms';

/** 确认时锁定为“确认基线”的受审内容：词形、释义、变体、例句、来源、同义词 */
export interface ReviewedFields {
  headword: string;
  definition: string;
  dialectVariants: DialectVariant[];
  examples: ExampleSentence[];
  sources: DictionarySource[];
  synonyms: string[];
}

export interface ConfirmationBaseline {
  confirmedAt: string;
  /** 确认时所在的修订号，审校人据此辨认确认依据的是哪一版 */
  revision: number;
  fields: ReviewedFields;
}

export interface DictionaryEntry {
  id: string;
  headword: string;
  pronunciation: string;
  partOfSpeech: string;
  definition: string;
  dialectVariants: DialectVariant[];
  examples: ExampleSentence[];
  sources: DictionarySource[];
  synonyms: string[];
  status: EntryStatus;
  notes: string;
  /** 已确认词条的确认基线；无基线的“已确认”不被采信，需重新确认 */
  confirmBaseline?: ConfirmationBaseline;
  createdAt: string;
  updatedAt: string;
  reviewerComments: ReviewComment[];
}

export interface VersionRecord {
  id: string;
  at: string;
  action: string;
  detail: string;
  entryId?: string;
  before: DictionaryEntry[];
}

export interface AuditRecord {
  id: string;
  at: string;
  action: string;
  detail: string;
  entryIds: string[];
}

export interface DictionarySnapshot {
  revision: number;
  entries: DictionaryEntry[];
  versions: VersionRecord[];
  audit: AuditRecord[];
}

export interface DuplicatePair {
  leftId: string;
  rightId: string;
  score: number;
  reasons: string[];
}
