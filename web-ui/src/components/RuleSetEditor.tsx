import { RuleCondition, RuleLevel, RuleSet, RuleSetDefinition, ScoringRule } from "../api";
import { cloneRuleDefinition, newCondition, newRule, splitCommaLines, joinCommaLines } from "../collector";

type Props = {
  ruleSet: RuleSet | null;
  draft: RuleSetDefinition;
  onDraftChange: (next: RuleSetDefinition) => void;
  onSave: () => void;
  onClone: () => void;
  onDelete: () => void;
  saving?: boolean;
  deleting?: boolean;
};

const CONDITION_LABELS: Array<{ value: RuleCondition["type"]; label: string }> = [
  { value: "text_contains_any", label: "文本包含任一词" },
  { value: "text_not_contains_any", label: "文本不包含这些词" },
  { value: "author_in", label: "作者在名单中" },
  { value: "author_not_in", label: "作者不在名单中" },
  { value: "author_contains_any", label: "作者名包含" },
  { value: "metric_at_least", label: "互动指标至少" },
  { value: "has_link", label: "包含链接" },
  { value: "has_media", label: "包含媒体" },
  { value: "has_hashtag", label: "包含话题标签" },
  { value: "has_cashtag", label: "包含 cashtag" },
  { value: "has_emoji", label: "包含 emoji" },
  { value: "is_retweet", label: "是转推" },
  { value: "is_reply", label: "是回复" },
  { value: "language_is", label: "语言等于" },
  { value: "age_within_days", label: "发布时间在 N 天内" },
];

function updateLevel(levels: RuleLevel[], index: number, patch: Partial<RuleLevel>) {
  return levels.map((level, idx) => (idx === index ? { ...level, ...patch } : level));
}

function updateRule(rules: ScoringRule[], index: number, patch: Partial<ScoringRule>) {
  return rules.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule));
}

function updateCondition(conditions: RuleCondition[], index: number, patch: Partial<RuleCondition>) {
  return conditions.map((condition, idx) => (idx === index ? { ...condition, ...patch } : condition));
}

export function RuleSetEditor({ ruleSet, draft, onDraftChange, onSave, onClone, onDelete, saving = false, deleting = false }: Props) {
  const current = cloneRuleDefinition(draft);
  const levelOptions = current.levels.map((level) => level.id);

  return (
    <div className="collector-panel">
      <div className="collector-toolbar between">
        <div>
          <div className="collector-title">规则可视化编辑器</div>
          <div className="kv">{ruleSet ? `${ruleSet.name} · v${ruleSet.version}` : "临时规则"}</div>
        </div>
        <div className="collector-toolbar">
          <button type="button" className="ghost" onClick={onClone} disabled={!ruleSet}>
            复制规则集
          </button>
          <button type="button" onClick={onSave} disabled={saving}>
            {saving ? "保存中..." : "保存规则集"}
          </button>
          <button type="button" className="danger" onClick={onDelete} disabled={!ruleSet || Boolean(ruleSet?.is_builtin) || deleting}>
            {deleting ? "删除中..." : "删除规则集"}
          </button>
        </div>
      </div>

      <div className="collector-subtitle" style={{ marginTop: 12 }}>等级映射</div>
      <div className="collector-grid collector-grid-3">
        {current.levels.map((level, index) => (
          <div key={`${level.id}-${index}`} className="collector-card">
            <label className="field">
              <span>等级 ID</span>
              <input value={level.id} onChange={(e) => onDraftChange({ ...current, levels: updateLevel(current.levels, index, { id: e.target.value }) })} />
            </label>
            <label className="field">
              <span>标签</span>
              <input value={level.label} onChange={(e) => onDraftChange({ ...current, levels: updateLevel(current.levels, index, { label: e.target.value }) })} />
            </label>
            <label className="field">
              <span>最低分</span>
              <input type="number" value={level.min_score} onChange={(e) => onDraftChange({ ...current, levels: updateLevel(current.levels, index, { min_score: Number(e.target.value) }) })} />
            </label>
            <label className="field">
              <span>颜色</span>
              <input value={level.color} onChange={(e) => onDraftChange({ ...current, levels: updateLevel(current.levels, index, { color: e.target.value }) })} />
            </label>
          </div>
        ))}
      </div>

      <div className="collector-toolbar between" style={{ marginTop: 16 }}>
        <div className="collector-subtitle">规则块</div>
        <button type="button" className="ghost" onClick={() => onDraftChange({ ...current, rules: [...current.rules, newRule(levelOptions)] })}>
          新增规则
        </button>
      </div>

      <div className="collector-stack">
        {current.rules.map((rule, index) => (
          <div key={rule.id} className="collector-card collector-rule-card">
            <div className="collector-toolbar between">
              <div className="collector-toolbar">
                <input value={rule.name} onChange={(e) => onDraftChange({ ...current, rules: updateRule(current.rules, index, { name: e.target.value }) })} />
                <label className="field checkbox-row">
                  <span>启用</span>
                  <input type="checkbox" checked={rule.enabled} onChange={(e) => onDraftChange({ ...current, rules: updateRule(current.rules, index, { enabled: e.target.checked }) })} />
                </label>
              </div>
              <button type="button" className="ghost" onClick={() => onDraftChange({ ...current, rules: current.rules.filter((_, idx) => idx !== index) })}>
                删除规则
              </button>
            </div>

            <div className="collector-grid collector-grid-4" style={{ marginTop: 8 }}>
              <label className="field">
                <span>条件关系</span>
                <select value={rule.operator} onChange={(e) => onDraftChange({ ...current, rules: updateRule(current.rules, index, { operator: e.target.value as ScoringRule["operator"] }) })}>
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              </label>
              <label className="field">
                <span>动作</span>
                <select value={rule.effect.action} onChange={(e) => onDraftChange({ ...current, rules: updateRule(current.rules, index, { effect: { ...rule.effect, action: e.target.value as ScoringRule["effect"]["action"] } }) })}>
                  <option value="score">加分</option>
                  <option value="exclude">排除</option>
                </select>
              </label>
              <label className="field">
                <span>分数</span>
                <input type="number" value={rule.effect.score} onChange={(e) => onDraftChange({ ...current, rules: updateRule(current.rules, index, { effect: { ...rule.effect, score: Number(e.target.value) } }) })} />
              </label>
              <label className="field">
                <span>等级提示</span>
                <select value={rule.effect.level} onChange={(e) => onDraftChange({ ...current, rules: updateRule(current.rules, index, { effect: { ...rule.effect, level: e.target.value } }) })}>
                  <option value="">不指定</option>
                  {levelOptions.map((level) => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="collector-stack" style={{ marginTop: 12 }}>
              {rule.conditions.map((condition, conditionIndex) => (
                <ConditionEditor
                  key={`${rule.id}-${conditionIndex}`}
                  value={condition}
                  onChange={(next) =>
                    onDraftChange({
                      ...current,
                      rules: updateRule(current.rules, index, {
                        conditions: updateCondition(rule.conditions, conditionIndex, next),
                      }),
                    })
                  }
                  onDelete={() =>
                    onDraftChange({
                      ...current,
                      rules: updateRule(current.rules, index, {
                        conditions: rule.conditions.filter((_, idx) => idx !== conditionIndex),
                      }),
                    })
                  }
                />
              ))}
            </div>
            <button
              type="button"
              className="ghost"
              style={{ marginTop: 10 }}
              onClick={() =>
                onDraftChange({
                  ...current,
                  rules: updateRule(current.rules, index, {
                    conditions: [...rule.conditions, newCondition()],
                  }),
                })
              }
            >
              新增条件
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ConditionEditor({ value, onChange, onDelete }: { value: RuleCondition; onChange: (next: Partial<RuleCondition>) => void; onDelete: () => void }) {
  const usesValues = ["text_contains_any", "text_not_contains_any", "author_in", "author_not_in", "author_contains_any"].includes(value.type);
  const usesMetric = value.type === "metric_at_least";
  const usesSingleValue = ["language_is", "age_within_days"].includes(value.type);
  return (
    <div className="collector-condition-row">
      <select value={value.type} onChange={(e) => onChange({ type: e.target.value as RuleCondition["type"] })}>
        {CONDITION_LABELS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {usesValues && (
        <input value={joinCommaLines(value.values)} onChange={(e) => onChange({ values: splitCommaLines(e.target.value) })} placeholder="逗号分隔" />
      )}
      {usesMetric && (
        <>
          <select value={value.metric || "views"} onChange={(e) => onChange({ metric: e.target.value as RuleCondition["metric"] })}>
            <option value="views">views</option>
            <option value="likes">likes</option>
            <option value="replies">replies</option>
            <option value="retweets">retweets</option>
          </select>
          <input type="number" value={Number(value.value || 0)} onChange={(e) => onChange({ value: Number(e.target.value) })} />
        </>
      )}
      {usesSingleValue && (
        <input value={String(value.value || "")} onChange={(e) => onChange({ value: e.target.value })} />
      )}
      {!usesValues && !usesMetric && !usesSingleValue && <span className="kv">无额外参数</span>}
      <button type="button" className="ghost" onClick={onDelete}>删除</button>
    </div>
  );
}
