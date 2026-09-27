<script setup lang="ts">
import { computed, ref } from 'vue';
import { useDictionaryStore } from '~/store/dictionary';
import { REVIEWED_FIELD_LABELS, baselineDrifts, evaluateConfirmation } from '~/utils/dictionary';

const store = useDictionaryStore();
const emit = defineEmits<{ versions: [] }>();
const commentField = ref('definition');
const commentText = ref('');
const filter = ref<'all' | 'open' | 'resolved'>('all');
const entry = computed(() => store.selectedEntry);
const comments = computed(() => (entry.value?.reviewerComments ?? []).filter((comment) => filter.value === 'all' || comment.status === filter.value));
const drifts = computed(() => entry.value ? baselineDrifts(entry.value) : null);
const confirmation = computed(() => entry.value ? evaluateConfirmation(entry.value) : null);
const fieldLabels: Record<string, string> = {
  headword: '词形', pronunciation: '发音', partOfSpeech: '词性', definition: '释义', dialectVariants: '方言变体', examples: '例句', sources: '来源', synonyms: '同义词', notes: '备注'
};
const baselineFieldLabels = REVIEWED_FIELD_LABELS;

const addComment = () => {
  if (!entry.value || !commentText.value.trim()) return;
  store.addComment(entry.value.id, commentField.value, commentText.value);
  commentText.value = '';
};

const baselineSummary = (field: keyof typeof baselineFieldLabels): string => {
  const value = entry.value?.confirmBaseline?.fields[field];
  if (value === undefined || value === null) return '（空）';
  if (Array.isArray(value)) return value.length ? `${value.length} 项` : '（空）';
  return String(value) || '（空）';
};
</script>

<template>
  <aside v-if="entry" class="panel review-panel">
    <div class="panel-head review-head">
      <div><span class="eyebrow">03 / REVIEW</span><h2>审校与回复</h2></div>
      <button class="version-link" @click="emit('versions')">版本 {{ store.versions.length }}</button>
    </div>

    <div class="baseline-card" :class="{ 'is-drift': drifts?.length, 'is-clean': entry.status === 'confirmed' && !drifts?.length }">
      <header>
        <strong>确认基线</strong>
        <t-tag v-if="entry.confirmBaseline" size="small" :theme="drifts?.length ? 'danger' : 'success'" variant="light">
          r{{ entry.confirmBaseline.revision }}
        </t-tag>
        <t-tag v-else size="small" theme="default" variant="light">未确认</t-tag>
      </header>
      <p v-if="entry.confirmBaseline" class="baseline-meta">
        {{ new Date(entry.confirmBaseline.confirmedAt).toLocaleString('zh-CN') }} 确认，锁定词形、释义、变体、例句、来源与同义词
      </p>
      <p v-else class="baseline-meta">该词条尚未确认；确认后将保存受审内容快照和当前修订号。</p>
      <ul class="baseline-checks">
        <li :class="{ ok: confirmation && confirmation.openComments === 0, bad: (confirmation?.openComments ?? 0) > 0 }">
          {{ confirmation?.openComments ? `✕ ${confirmation.openComments} 条未解决意见` : '✓ 未解决意见已处理完' }}
        </li>
        <li :class="{ ok: !drifts?.length, bad: drifts?.length }">
          <template v-if="drifts?.length">✕ 偏离字段：{{ drifts.map((field) => baselineFieldLabels[field]).join('、') }}</template>
          <template v-else>✓ 受审内容与确认基线一致</template>
        </li>
      </ul>
      <t-button size="small" theme="success" block :disabled="!confirmation?.canConfirm" @click="store.confirmEntry(entry.id)">
        {{ entry.confirmBaseline ? '重新确认并更新基线' : '确认词条并建立基线' }}
      </t-button>
      <p v-if="confirmation && !confirmation.canConfirm" class="baseline-hint">{{ confirmation.blockers.join('；') }} 时不能确认。</p>
      <details v-if="entry.confirmBaseline" class="baseline-detail">
        <summary>查看基线内容（r{{ entry.confirmBaseline.revision }}）</summary>
        <dl>
          <template v-for="(label, field) in baselineFieldLabels" :key="field">
            <dt>{{ label }}</dt>
            <dd>{{ baselineSummary(field) }}</dd>
          </template>
        </dl>
      </details>
    </div>

    <div class="review-summary">
      <div><strong>{{ entry.reviewerComments.filter((item) => item.status === 'open').length }}</strong><span>待处理</span></div>
      <div><strong>{{ entry.reviewerComments.filter((item) => item.status === 'resolved').length }}</strong><span>已解决</span></div>
      <div><strong>{{ entry.dialectVariants.length }}</strong><span>方言变体</span></div>
    </div>
    <div class="comment-filter">
      <button :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
      <button :class="{ active: filter === 'open' }" @click="filter = 'open'">待回复</button>
      <button :class="{ active: filter === 'resolved' }" @click="filter = 'resolved'">已解决</button>
    </div>
    <div class="comment-list">
      <article v-for="comment in comments" :key="comment.id" class="comment-card" :class="{ resolved: comment.status === 'resolved' }">
        <header><t-tag size="small" variant="light" :theme="comment.status === 'open' ? 'warning' : 'success'">{{ fieldLabels[comment.field] || comment.field }}</t-tag><span>{{ comment.author }}</span><time>{{ new Date(comment.createdAt).toLocaleDateString('zh-CN') }}</time></header>
        <p>{{ comment.message }}</p>
        <div v-for="reply in comment.replies" :key="reply.id" class="reply"><strong>{{ reply.author }}</strong><span>{{ reply.message }}</span><time>{{ new Date(reply.createdAt).toLocaleString('zh-CN') }}</time></div>
        <div class="reply-box">
          <t-textarea v-model="store.fieldReplyDrafts[comment.id]" :autosize="{ minRows: 1, maxRows: 3 }" placeholder="逐字段回复这条意见…" />
          <t-button size="small" theme="primary" variant="outline" @click="store.replyComment(entry!.id, comment.id, store.fieldReplyDrafts[comment.id] || ''); store.fieldReplyDrafts[comment.id] = ''">回复</t-button>
        </div>
        <button class="resolve-button" @click="store.toggleComment(entry!.id, comment.id)">{{ comment.status === 'open' ? '✓ 标记为解决' : '↺ 重新打开' }}</button>
      </article>
      <t-empty v-if="!comments.length" description="当前筛选下没有审校意见" />
    </div>
    <div class="new-comment">
      <div class="new-comment-title"><strong>新增逐字段意见</strong><span>Ctrl + Enter 提交</span></div>
      <t-select v-model="commentField" size="small">
        <t-option v-for="(label, field) in fieldLabels" :key="field" :value="field" :label="label" />
      </t-select>
      <t-textarea v-model="commentText" :autosize="{ minRows: 2, maxRows: 4 }" placeholder="指出需要修改、补充或确认的内容" @keydown.ctrl.enter="addComment" @keydown.meta.enter="addComment" />
      <t-button block theme="primary" size="small" :disabled="!commentText.trim()" @click="addComment">提交审校意见</t-button>
    </div>
  </aside>
</template>
