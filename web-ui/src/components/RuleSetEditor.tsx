import { RuleCondition, RuleLevel, RuleSet, RuleSetDefinition, ScoringRule } from "../api";
import { cloneRuleDefinition, joinCommaLines, newCondition, newRule, splitCommaLines } from "../collector";

type Props = {
  ruleSet: RuleSet | null;
  draft: RuleSetDefinition;
  onDraftChange: (next: RuleSetDefinition) => void;
  disabled?: boolean;
};

const CONDITION_LABELS: Array<{ value: RuleCondition["type"]; label: string }> = [
  { value: "text_contains_any", label: "\u6587\u672c\u5305\u542b\u4efb\u4e00\u8bcd" },
  { value: "text_not_contains_any", label: "\u6587\u672c\u4e0d\u5305\u542b\u8fd9\u4e9b\u8bcd" },
  { value: "author_in", label: "\u4f5c\u8005\u5728\u540d\u5355\u4e2d" },
  { value: "author_not_in", label: "\u4f5c\u8005\u4e0d\u5728\u540d\u5355\u4e2d" },
  { value: "author_contains_any", label: "\u4f5c\u8005\u540d\u5305\u542b" },
  { value: "metric_at_least", label: "\u4e92\u52a8\u6307\u6807\u81f3\u5c11" },
  { value: "has_link", label: "\u5305\u542b\u94fe\u63a5" },
  { value: "has_media", label: "\u5305\u542b\u5a92\u4f53" },
  { value: "has_hashtag", label: "\u5305\u542b\u8bdd\u9898\u6807\u7b7e" },
  { value: "has_cashtag", label: "\u5305\u542b cashtag" },
  { value: "has_emoji", label: "\u5305\u542b emoji" },
  { value: "is_retweet", label: "\u662f\u8f6c\u63a8" },
  { value: "is_reply", label: "\u662f\u56de\u590d" },
  { value: "language_is", label: "\u8bed\u8a00\u7b49\u4e8e" },
  { value: "age_within_days", label: "\u53d1\u5e03\u65f6\u95f4\u5728 N \u5929\u5185" },
];

const TEXT = {
  summaryEyebrow: "RULES",
  summaryTitle: "\u89c4\u5219\u53ef\u89c6\u5316\u7f16\u8f91\u5668",
  summaryDescription:
    "\u5148\u7ef4\u62a4\u7b49\u7ea7\u6620\u5c04\uff0c\u518d\u6309\u89c4\u5219\u5757\u7ec4\u88c5\u6761\u4ef6\u3001\u52a8\u4f5c\u548c\u5206\u503c\uff0c\u8ba9\u624b\u52a8\u6267\u884c\u4e0e\u81ea\u52a8\u4efb\u52a1\u4f7f\u7528\u540c\u4e00\u5957\u5224\u5206\u8bed\u4e49\u3002",
  levelsEyebrow: "LEVELS",
  levelsTitle: "\u7b49\u7ea7\u6620\u5c04",
  levelsDescription: "\u5b9a\u4e49\u4ece\u5206\u6570\u5230\u7b49\u7ea7\u6807\u7b7e\u7684\u5bf9\u5e94\u5173\u7cfb\u3002",
  rulesEyebrow: "RULE BLOCKS",
  rulesTitle: "\u89c4\u5219\u5757",
  rulesDescription: "\u6bcf\u6761\u89c4\u5219\u90fd\u7531\u6761\u4ef6\u3001\u52a8\u4f5c\u548c\u7b49\u7ea7\u63d0\u793a\u7ec4\u6210\uff0c\u53ef\u72ec\u7acb\u542f\u505c\u3002",
  conditionsTitle: "\u6761\u4ef6\u5217\u8868",
  conditionsDescription: "\u4fdd\u6301\u6bcf\u6761\u6761\u4ef6\u53ea\u8868\u8fbe\u4e00\u4e2a\u5224\u65ad\u610f\u56fe\uff0c\u4fbf\u4e8e\u540e\u7eed\u7ef4\u62a4\u3002",
  addRule: "\u65b0\u589e\u89c4\u5219",
  addCondition: "\u65b0\u589e\u6761\u4ef6",
  deleteRule: "\u5220\u9664\u89c4\u5219",
  deleteCondition: "\u5220\u9664",
  enabled: "\u542f\u7528",
  conditionType: "\u6761\u4ef6\u7c7b\u578b",
  conditionValues: "\u5339\u914d\u503c",
  conditionMetric: "\u6307\u6807",
  conditionThreshold: "\u9608\u503c",
  conditionValue: "\u53c2\u6570",
  conditionNone: "\u65e0\u989d\u5916\u53c2\u6570",
  conditionPlaceholder: "\u9017\u53f7\u6216\u6362\u884c\u5206\u9694",
  ruleName: "\u89c4\u5219\u540d\u79f0",
  operator: "\u6761\u4ef6\u5173\u7cfb",
  action: "\u52a8\u4f5c",
  score: "\u5206\u6570",
  levelHint: "\u7b49\u7ea7\u63d0\u793a",
  levelId: "\u7b49\u7ea7 ID",
  levelLabel: "\u6807\u7b7e",
  levelScore: "\u6700\u4f4e\u5206",
  levelColor: "\u989c\u8272",
  scoreAction: "\u52a0\u5206",
  excludeAction: "\u6392\u9664",
  unspecified: "\u4e0d\u6307\u5b9a",
  temporaryRuleSet: "\u4e34\u65f6\u89c4\u5219",
} as const;

function updateLevel(levels: RuleLevel[], index: number, patch: Partial<RuleLevel>) {
  return levels.map((level, idx) => (idx === index ? { ...level, ...patch } : level));
}

function updateRule(rules: ScoringRule[], index: number, patch: Partial<ScoringRule>) {
  return rules.map((rule, idx) => (idx === index ? { ...rule, ...patch } : rule));
}

function updateCondition(conditions: RuleCondition[], index: number, patch: Partial<RuleCondition>) {
  return conditions.map((condition, idx) => (idx === index ? { ...condition, ...patch } : condition));
}

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
};

function SectionHeader({ eyebrow, title, description }: SectionHeaderProps) {
  return (
    <div className="collector-editor-section-header">
      <div className="collector-editor-section-copy">
        <div className="collector-editor-section-eyebrow">{eyebrow}</div>
        <div className="collector-editor-section-title">{title}</div>
        <div className="collector-editor-section-description">{description}</div>
      </div>
    </div>
  );
}

type ConditionEditorProps = {
  ruleId: string;
  index: number;
  value: RuleCondition;
  onChange: (next: Partial<RuleCondition>) => void;
  onDelete: () => void;
  disabled?: boolean;
};

function ConditionEditor({
  ruleId,
  index,
  value,
  onChange,
  onDelete,
  disabled = false,
}: ConditionEditorProps) {
  const usesValues = ["text_contains_any", "text_not_contains_any", "author_in", "author_not_in", "author_contains_any"].includes(value.type);
  const usesMetric = value.type === "metric_at_least";
  const usesSingleValue = ["language_is", "age_within_days"].includes(value.type);

  return (
    <div
      className="collector-condition-card workbench-subsurface workbench-subsurface-muted"
      data-testid={`rule-condition-${ruleId}-${index}`}
    >
      <div className="collector-condition-card-header">
        <div className="collector-condition-card-index">{`\u6761\u4ef6 ${index + 1}`}</div>
        <button
          type="button"
          className="danger workbench-danger-action"
          aria-label={`delete-condition-${ruleId}-${index}`}
          disabled={disabled}
          onClick={onDelete}
        >
          {TEXT.deleteCondition}
        </button>
      </div>

      <div className="collector-condition-row">
        <label className="field">
          <span>{TEXT.conditionType}</span>
          <select disabled={disabled} value={value.type} onChange={(e) => onChange({ type: e.target.value as RuleCondition["type"] })}>
            {CONDITION_LABELS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        {usesValues && (
          <label className="field collector-span-2">
            <span>{TEXT.conditionValues}</span>
            <input
              disabled={disabled}
              value={joinCommaLines(value.values)}
              onChange={(e) => onChange({ values: splitCommaLines(e.target.value) })}
              placeholder={TEXT.conditionPlaceholder}
            />
          </label>
        )}

        {usesMetric && (
          <>
            <label className="field">
              <span>{TEXT.conditionMetric}</span>
              <select disabled={disabled} value={value.metric || "views"} onChange={(e) => onChange({ metric: e.target.value as RuleCondition["metric"] })}>
                <option value="views">views</option>
                <option value="likes">likes</option>
                <option value="replies">replies</option>
                <option value="retweets">retweets</option>
              </select>
            </label>
            <label className="field">
              <span>{TEXT.conditionThreshold}</span>
              <input disabled={disabled} type="number" value={Number(value.value || 0)} onChange={(e) => onChange({ value: Number(e.target.value) })} />
            </label>
          </>
        )}

        {usesSingleValue && (
          <label className="field collector-span-2">
            <span>{TEXT.conditionValue}</span>
            <input disabled={disabled} value={String(value.value || "")} onChange={(e) => onChange({ value: e.target.value })} />
          </label>
        )}

        {!usesValues && !usesMetric && !usesSingleValue && (
          <div className="collector-condition-empty collector-span-2">{TEXT.conditionNone}</div>
        )}
      </div>
    </div>
  );
}

export function RuleSetEditor({ ruleSet, draft, onDraftChange, disabled = false }: Props) {
  const current = cloneRuleDefinition(draft);
  const levelOptions = current.levels.map((level) => level.id);
  const enabledRuleCount = current.rules.filter((rule) => rule.enabled).length;
  const totalConditionCount = current.rules.reduce((sum, rule) => sum + rule.conditions.length, 0);
  const ruleSetLabel = ruleSet ? `${ruleSet.name} · v${ruleSet.version}` : TEXT.temporaryRuleSet;

  return (
    <div className="collector-panel collector-editor-shell rule-set-editor" data-testid="rule-set-editor">
      <section
        className="collector-editor-section collector-editor-section-highlight workbench-summary-panel"
        data-testid="rule-set-summary"
      >
        <SectionHeader
          eyebrow={TEXT.summaryEyebrow}
          title={TEXT.summaryTitle}
          description={TEXT.summaryDescription}
        />
        <div className="collector-editor-section-pills workbench-pill-row">
          <span className="workbench-pill">{ruleSetLabel}</span>
          <span className="workbench-pill">{`${current.levels.length} \u4e2a\u7b49\u7ea7`}</span>
          <span className="workbench-pill">{`${enabledRuleCount} / ${current.rules.length} \u6761\u89c4\u5219\u542f\u7528`}</span>
          <span className="workbench-pill">{`${totalConditionCount} \u6761\u6761\u4ef6`}</span>
        </div>
      </section>

      <section className="collector-editor-section workbench-subsurface" data-testid="rule-set-levels">
        <SectionHeader
          eyebrow={TEXT.levelsEyebrow}
          title={TEXT.levelsTitle}
          description={TEXT.levelsDescription}
        />
        <div className="collector-grid collector-grid-3 collector-level-grid">
          {current.levels.map((level, index) => (
            <div key={`${level.id}-${index}`} className="collector-card collector-level-card">
              <label className="field">
                <span>{TEXT.levelId}</span>
                <input disabled={disabled} value={level.id} onChange={(e) => onDraftChange({ ...current, levels: updateLevel(current.levels, index, { id: e.target.value }) })} />
              </label>
              <label className="field">
                <span>{TEXT.levelLabel}</span>
                <input disabled={disabled} value={level.label} onChange={(e) => onDraftChange({ ...current, levels: updateLevel(current.levels, index, { label: e.target.value }) })} />
              </label>
              <label className="field">
                <span>{TEXT.levelScore}</span>
                <input disabled={disabled} type="number" value={level.min_score} onChange={(e) => onDraftChange({ ...current, levels: updateLevel(current.levels, index, { min_score: Number(e.target.value) }) })} />
              </label>
              <label className="field">
                <span>{TEXT.levelColor}</span>
                <input disabled={disabled} value={level.color} onChange={(e) => onDraftChange({ ...current, levels: updateLevel(current.levels, index, { color: e.target.value }) })} />
              </label>
            </div>
          ))}
        </div>
      </section>

      <section className="collector-editor-section workbench-subsurface" data-testid="rule-set-rules">
        <div className="collector-editor-section-header collector-editor-section-header-between">
          <div className="collector-editor-section-copy">
            <div className="collector-editor-section-eyebrow">{TEXT.rulesEyebrow}</div>
            <div className="collector-editor-section-title">{TEXT.rulesTitle}</div>
            <div className="collector-editor-section-description">{TEXT.rulesDescription}</div>
          </div>
          <button
            type="button"
            className="ghost workbench-secondary-action"
            aria-label="add-scoring-rule"
            disabled={disabled}
            onClick={() => onDraftChange({ ...current, rules: [...current.rules, newRule(levelOptions)] })}
          >
            {TEXT.addRule}
          </button>
        </div>

        <div className="collector-stack collector-rule-stack">
          {current.rules.map((rule, index) => (
            <div
              key={rule.id}
              className="collector-card collector-rule-card collector-rule-shell workbench-subsurface"
              data-testid={`rule-card-${rule.id}`}
            >
              <div className="collector-rule-header">
                <div className="collector-rule-header-main">
                  <label className="field collector-rule-name-field">
                    <span>{TEXT.ruleName}</span>
                    <input disabled={disabled} value={rule.name} onChange={(e) => onDraftChange({ ...current, rules: updateRule(current.rules, index, { name: e.target.value }) })} />
                  </label>
                  <div className="collector-rule-meta workbench-pill-row">
                    <span className="workbench-pill">{rule.enabled ? "\u5df2\u542f\u7528" : "\u5df2\u505c\u7528"}</span>
                    <span className="workbench-pill">{`${rule.conditions.length} \u6761\u6761\u4ef6`}</span>
                    <span className="workbench-pill">{`${rule.operator} \u00b7 ${rule.effect.action === "score" ? TEXT.scoreAction : TEXT.excludeAction}`}</span>
                  </div>
                </div>

                <div className="collector-rule-header-actions">
                  <label className="field checkbox-row">
                    <span>{TEXT.enabled}</span>
                    <input disabled={disabled} type="checkbox" checked={rule.enabled} onChange={(e) => onDraftChange({ ...current, rules: updateRule(current.rules, index, { enabled: e.target.checked }) })} />
                  </label>
                  <button
                    type="button"
                    className="danger workbench-danger-action"
                    aria-label={`delete-rule-${rule.id}`}
                    disabled={disabled}
                    onClick={() => onDraftChange({ ...current, rules: current.rules.filter((_, idx) => idx !== index) })}
                  >
                    {TEXT.deleteRule}
                  </button>
                </div>
              </div>

              <div className="collector-grid collector-grid-4 collector-rule-config">
                <label className="field">
                  <span>{TEXT.operator}</span>
                  <select disabled={disabled} value={rule.operator} onChange={(e) => onDraftChange({ ...current, rules: updateRule(current.rules, index, { operator: e.target.value as ScoringRule["operator"] }) })}>
                    <option value="AND">AND</option>
                    <option value="OR">OR</option>
                  </select>
                </label>
                <label className="field">
                  <span>{TEXT.action}</span>
                  <select disabled={disabled} value={rule.effect.action} onChange={(e) => onDraftChange({ ...current, rules: updateRule(current.rules, index, { effect: { ...rule.effect, action: e.target.value as ScoringRule["effect"]["action"] } }) })}>
                    <option value="score">{TEXT.scoreAction}</option>
                    <option value="exclude">{TEXT.excludeAction}</option>
                  </select>
                </label>
                <label className="field">
                  <span>{TEXT.score}</span>
                  <input disabled={disabled} type="number" value={rule.effect.score} onChange={(e) => onDraftChange({ ...current, rules: updateRule(current.rules, index, { effect: { ...rule.effect, score: Number(e.target.value) } }) })} />
                </label>
                <label className="field">
                  <span>{TEXT.levelHint}</span>
                  <select disabled={disabled} value={rule.effect.level} onChange={(e) => onDraftChange({ ...current, rules: updateRule(current.rules, index, { effect: { ...rule.effect, level: e.target.value } }) })}>
                    <option value="">{TEXT.unspecified}</option>
                    {levelOptions.map((level) => (
                      <option key={level} value={level}>
                        {level}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="collector-rule-condition-area">
                <div className="collector-rule-subheader">
                  <div>
                    <div className="collector-rule-subtitle">{TEXT.conditionsTitle}</div>
                    <div className="kv">{TEXT.conditionsDescription}</div>
                  </div>
                </div>

                <div className="collector-stack collector-condition-list">
                  {rule.conditions.map((condition, conditionIndex) => (
                    <ConditionEditor
                      key={`${rule.id}-${conditionIndex}`}
                      ruleId={rule.id}
                      index={conditionIndex}
                      value={condition}
                      onChange={(next) =>
                        onDraftChange({
                          ...current,
                          rules: updateRule(current.rules, index, {
                            conditions: updateCondition(rule.conditions, conditionIndex, next),
                          }),
                        })
                      }
                      disabled={disabled}
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
              </div>

              <button
                type="button"
                className="ghost workbench-secondary-action"
                aria-label={`add-condition-${rule.id}`}
                disabled={disabled}
                onClick={() =>
                  onDraftChange({
                    ...current,
                    rules: updateRule(current.rules, index, {
                      conditions: [...rule.conditions, newCondition()],
                    }),
                  })
                }
              >
                {TEXT.addCondition}
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
