<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDictionaryStore } from '~/store/dictionary';
import {
  REVIEWED_FIELD_LABELS, baselineDrifts, evaluateConfirmation, listDrift
} from '~/utils/dictionary';
import type { DialectVariant, DictionarySource, ExampleSentence, ReviewedField } from '~/types/dictionary';

const store = useDictionaryStore();
const activeTab = ref('basic');
const entry = computed(() => store.selectedEntry);
const synonymsText = computed(() => entry.value?.synonyms.join('、') ?? '');

const statusLabels: Record<string, string> = { draft: '草稿', review: '待审', disputed: '争议', confirmed: '已确认' };
const statusThemes: Record<string, string> = { draft: 'default', review: 'warning', disputed: 'danger', confirmed: 'success' };

const drifts = computed<ReviewedField[] | null>(() => entry.value ? baselineDrifts(entry.value) : null);
const driftSet = computed(() => new Set(drifts.value ?? []));
const confirmation = computed(() => entry.value ? evaluateConfirmation(entry.value) : null);
const hasBaseline = computed(() => Boolean(entry.value?.confirmBaseline));

const eventValue = (event: any) => typeof event === 'string' || typeof event === 'number' ? String(event) : event?.target?.value ?? event?.e?.target?.value ?? event?.value ?? '';

const commitInput = (event: any, field: 'headword' | 'pronunciation' | 'partOfSpeech' | 'definition' | 'notes') => {
  if (!entry.value) return;
  store.updateField(entry.value.id, field, eventValue(event), field);
};

const commitPartOfSpeech = (value: unknown) => {
  if (entry.value) store.updateField(entry.value.id, 'partOfSpeech', String(value || ''));
};

const commitSynonyms = (event: any) => {
  if (!entry.value) return;
  const synonyms = eventValue(event).split(/[、,，]/).map((item: string) => item.trim()).filter(Boolean);
  store.setSynonyms(entry.value.id, synonyms);
};

const tabDot = (field: ReviewedField) => driftSet.value.has(field);
const baselineText = (field: ReviewedField): string => {
  const value = entry.value?.confirmBaseline?.fields[field];
  if (Array.isArray(value)) return value.length ? value.join('、') : '（空）';
  return String(value ?? '（空）') || '（空）';
};

const variantDrift = computed(() => {
  if (!entry.value || !driftSet.value.has('dialectVariants')) return null;
  return listDrift<DialectVariant>(entry.value.confirmBaseline?.fields.dialectVariants, entry.value.dialectVariants);
});
const exampleDrift = computed(() => {
  if (!entry.value || !driftSet.value.has('examples')) return null;
  return listDrift<ExampleSentence>(entry.value.confirmBaseline?.fields.examples, entry.value.examples);
});
const sourceDrift = computed(() => {
  if (!entry.value || !driftSet.value.has('sources')) return null;
  return listDrift<DictionarySource>(entry.value.confirmBaseline?.fields.sources, entry.value.sources);
});

const changedIds = (drift: { added: Array<{ id: string }>; removed: Array<{ id: string }>; changed: Array<{ id: string }> } | null) =>
  new Set([...(drift?.added ?? []), ...(drift?.changed ?? [])].map((item: { id: string }) => item.id));
const removedItems = (drift: { removed: unknown[] } | null) => drift?.removed ?? [];
</script>

<template>
  <section v-if="entry" :key="entry.id" class="panel entry-editor">
    <div class="editor-head">
      <div>
        <span class="eyebrow">02 / ENTRY EDITOR</span>
        <div class="lexeme-line"><h2>{{ entry.headword || '未命名词条' }}</h2><span>[{{ entry.pronunciation || '音标待补' }}]</span></div>
      </div>
      <div class="editor-actions">
        <t-tag :theme="statusThemes[entry.status]" variant="light">{{ statusLabels[entry.status] }}</t-tag>
        <t-button size="small" variant="outline" @click="store.setStatus(entry.id, 'review')">提交待审</t-button>
        <span class="confirm-wrap" :title="confirmation && !confirmation.canConfirm ? confirmation.blockers.join('；') : ''">
          <t-button size="small" theme="success" :disabled="!confirmation?.canConfirm" @click="store.confirmEntry(entry.id)">
            {{ hasBaseline ? '重新确认词条' : '确认词条' }}
          </t-button>
        </span>
      </div>
    </div>

    <div v-if="entry.confirmBaseline" class="baseline-strip">
      <span class="baseline-pill">确认基线 r{{ entry.confirmBaseline.revision }}</span>
      <span>{{ new Date(entry.confirmBaseline.confirmedAt).toLocaleString('zh-CN') }} 锁定</span>
      <t-tag v-if="drifts?.length" size="small" theme="danger" variant="light-outline">
        受审内容已偏离：{{ drifts.map((field) => REVIEWED_FIELD_LABELS[field]).join('、') }}
      </t-tag>
      <t-tag v-else-if="entry.status === 'confirmed'" size="small" theme="success" variant="light-outline">受审内容与基线一致</t-tag>
    </div>
    <div v-else class="baseline-strip baseline-none">
      <span>尚无确认基线</span><small>确认时将锁定词形、释义、变体、例句、来源与同义词，并记下当前修订号</small>
    </div>
    <t-alert
      v-if="entry.status !== 'confirmed' && drifts?.length"
      class="baseline-alert"
      theme="warning"
      message="受审内容相对确认基线发生变化，词条已回到争议。请处理全部未解决意见，并将下列标注字段恢复到基线（或在意见中说明）后，方可重新确认。"
    />

    <t-tabs v-model="activeTab" class="entry-tabs">
      <t-tab-panel value="basic" label="核心信息">
        <template #label><span class="tab-label">核心信息<span v-if="tabDot('headword') || tabDot('definition') || tabDot('synonyms')" class="drift-dot" /></span></template>
        <div class="editor-scroll">
          <div class="field-grid two">
            <label class="field-block" :class="{ 'field-drift': driftSet.has('headword') }"><span>词形 / 主条 <em v-if="driftSet.has('headword')">偏离基线</em></span><t-input :default-value="entry.headword" @blur="commitInput($event, 'headword')" placeholder="输入民族文字、国际音标或拼音" /></label>
            <label class="field-block"><span>发音说明</span><t-input :default-value="entry.pronunciation" @blur="commitInput($event, 'pronunciation')" placeholder="声调、重音或发音人说明" /></label>
          </div>
          <p v-if="driftSet.has('headword')" class="drift-note">基线值：{{ baselineText('headword') }}</p>
          <div class="field-grid two compact-grid">
            <label class="field-block"><span>词性</span><t-select :model-value="entry.partOfSpeech" @change="commitPartOfSpeech" clearable>
              <t-option value="名词" label="名词" /><t-option value="动词" label="动词" /><t-option value="形容词" label="形容词" /><t-option value="副词" label="副词" /><t-option value="方向词" label="方向词" /><t-option value="量词" label="量词" /><t-option value="短语" label="短语" />
            </t-select></label>
            <label class="field-block" :class="{ 'field-drift': driftSet.has('synonyms') }"><span>同义词（用顿号分隔） <em v-if="driftSet.has('synonyms')">偏离基线</em></span><t-input :default-value="synonymsText" @blur="commitSynonyms($event)" placeholder="水潭、泉眼" /></label>
          </div>
          <p v-if="driftSet.has('synonyms')" class="drift-note">基线值：{{ baselineText('synonyms') }}</p>
          <label class="field-block" :class="{ 'field-drift': driftSet.has('definition') }"><span>释义 <em v-if="driftSet.has('definition')">偏离基线</em></span><t-textarea :default-value="entry.definition" :autosize="{ minRows: 3, maxRows: 7 }" @blur="commitInput($event, 'definition')" placeholder="用简洁语言描述词义、语用限制和引申关系" /></label>
          <p v-if="driftSet.has('definition')" class="drift-note">基线值：{{ baselineText('definition') }}</p>
          <label class="field-block"><span>编者备注</span><t-textarea :default-value="entry.notes" :autosize="{ minRows: 2, maxRows: 5 }" @blur="commitInput($event, 'notes')" placeholder="记录不确定项、调查问题或整理说明" /></label>
          <p class="non-reviewed-hint">发音说明、词性与编者备注不纳入确认基线，修改只改编者备注不会改变确认状态。</p>
        </div>
      </t-tab-panel>

      <t-tab-panel value="variants" label="方言变体">
        <template #label><span class="tab-label">方言变体<span v-if="tabDot('dialectVariants')" class="drift-dot" /></span></template>
        <div class="editor-scroll">
          <div class="section-title"><div><h3>方言与地域变体</h3><p>同一词条在不同方言点的形式、读音和限制。</p></div><t-button size="small" @click="store.addVariant(entry.id)">＋ 添加变体</t-button></div>
          <div v-if="variantDrift" class="list-drift-banner">
            <strong>方言变体偏离基线</strong>
            <span>新增 {{ variantDrift.added.length }} · 修改 {{ variantDrift.changed.length }} · 删除 {{ variantDrift.removed.length }}</span>
            <details v-if="variantDrift.removed.length"><summary>查看基线中已删除的 {{ variantDrift.removed.length }} 条</summary>
              <p v-for="item in removedItems(variantDrift)" :key="(item as DialectVariant).id">（基线）{{ (item as DialectVariant).dialect }} · {{ (item as DialectVariant).form }} {{ (item as DialectVariant).pronunciation }}</p>
            </details>
          </div>
          <div v-for="variant in entry.dialectVariants" :key="variant.id" class="subcard" :class="{ 'subcard-drift': changedIds(variantDrift).has(variant.id) }">
            <span v-if="changedIds(variantDrift).has(variant.id)" class="subcard-flag">偏离基线</span>
            <button class="remove-button" title="删除变体" @click="store.removeVariant(entry.id, variant.id)">×</button>
            <div class="field-grid three">
              <label class="field-block"><span>方言点</span><t-input :default-value="variant.dialect" @blur="store.updateVariant(entry.id, variant.id, 'dialect', eventValue($event))" /></label>
              <label class="field-block"><span>词形</span><t-input :default-value="variant.form" @blur="store.updateVariant(entry.id, variant.id, 'form', eventValue($event))" /></label>
              <label class="field-block"><span>读音</span><t-input :default-value="variant.pronunciation" @blur="store.updateVariant(entry.id, variant.id, 'pronunciation', eventValue($event))" /></label>
            </div>
            <label class="field-block"><span>使用说明</span><t-input :default-value="variant.note" @blur="store.updateVariant(entry.id, variant.id, 'note', eventValue($event))" /></label>
          </div>
          <t-empty v-if="!entry.dialectVariants.length" description="暂未记录方言变体" />
        </div>
      </t-tab-panel>

      <t-tab-panel value="examples" label="例句">
        <template #label><span class="tab-label">例句<span v-if="tabDot('examples')" class="drift-dot" /></span></template>
        <div class="editor-scroll">
          <div class="section-title"><div><h3>自然语料例句</h3><p>保留原文、译文和出处，便于核对词语的真实用法。</p></div><t-button size="small" @click="store.addExample(entry.id)">＋ 添加例句</t-button></div>
          <div v-if="exampleDrift" class="list-drift-banner">
            <strong>例句偏离基线</strong>
            <span>新增 {{ exampleDrift.added.length }} · 修改 {{ exampleDrift.changed.length }} · 删除 {{ exampleDrift.removed.length }}</span>
            <details v-if="exampleDrift.removed.length"><summary>查看基线中已删除的 {{ exampleDrift.removed.length }} 条</summary>
              <p v-for="item in removedItems(exampleDrift)" :key="(item as ExampleSentence).id">（基线）{{ (item as ExampleSentence).text }} ｜ {{ (item as ExampleSentence).translation }}</p>
            </details>
          </div>
          <div v-for="(example, index) in entry.examples" :key="example.id" class="subcard example-card" :class="{ 'subcard-drift': changedIds(exampleDrift).has(example.id) }">
            <span v-if="changedIds(exampleDrift).has(example.id)" class="subcard-flag">偏离基线</span>
            <button class="remove-button" @click="store.removeExample(entry.id, example.id)">×</button>
            <span class="card-index">EX {{ String(index + 1).padStart(2, '0') }}</span>
            <label class="field-block"><span>原文</span><t-textarea :default-value="example.text" :autosize="{ minRows: 2, maxRows: 4 }" @blur="store.updateExample(entry.id, example.id, 'text', eventValue($event))" /></label>
            <div class="field-grid two"><label class="field-block"><span>译文</span><t-input :default-value="example.translation" @blur="store.updateExample(entry.id, example.id, 'translation', eventValue($event))" /></label><label class="field-block"><span>出处</span><t-input :default-value="example.source" @blur="store.updateExample(entry.id, example.id, 'source', eventValue($event))" /></label></div>
          </div>
          <t-empty v-if="!entry.examples.length" description="暂未记录例句" />
        </div>
      </t-tab-panel>

      <t-tab-panel value="sources" label="来源">
        <template #label><span class="tab-label">来源<span v-if="tabDot('sources')" class="drift-dot" /></span></template>
        <div class="editor-scroll">
          <div class="section-title"><div><h3>文献、录音与调查来源</h3><p>删除或改写引用时会先检查是否影响其他词条。</p></div><t-button size="small" @click="store.addSource(entry.id)">＋ 添加来源</t-button></div>
          <div v-if="sourceDrift" class="list-drift-banner">
            <strong>来源偏离基线</strong>
            <span>新增 {{ sourceDrift.added.length }} · 修改 {{ sourceDrift.changed.length }} · 删除 {{ sourceDrift.removed.length }}</span>
            <details v-if="sourceDrift.removed.length"><summary>查看基线中已删除的 {{ sourceDrift.removed.length }} 条</summary>
              <p v-for="item in removedItems(sourceDrift)" :key="(item as DictionarySource).id">（基线）{{ (item as DictionarySource).title }} ｜ {{ (item as DictionarySource).citation }}</p>
            </details>
          </div>
          <div v-for="source in entry.sources" :key="source.id" class="subcard source-card" :class="{ 'subcard-drift': changedIds(sourceDrift).has(source.id) }">
            <span v-if="changedIds(sourceDrift).has(source.id)" class="subcard-flag">偏离基线</span>
            <button class="remove-button" @click="store.removeSource(entry.id, source.id)">×</button>
            <div class="field-grid two"><label class="field-block"><span>来源名称</span><t-input :default-value="source.title" @blur="store.updateSource(entry.id, source.id, 'title', eventValue($event))" /></label><label class="field-block"><span>链接（可选）</span><t-input :default-value="source.url" @blur="store.updateSource(entry.id, source.id, 'url', eventValue($event))" /></label></div>
            <label class="field-block"><span>引用信息</span><t-input :default-value="source.citation" @blur="store.updateSource(entry.id, source.id, 'citation', eventValue($event))" /></label>
          </div>
          <t-empty v-if="!entry.sources.length" description="暂未记录来源" />
        </div>
      </t-tab-panel>
    </t-tabs>
  </section>
</template>
