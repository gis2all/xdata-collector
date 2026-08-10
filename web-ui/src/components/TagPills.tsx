import type { CSSProperties } from "react";

const TAG_PALETTE = [
  { bg: "var(--tag-0-bg)", border: "var(--tag-0-border)", fg: "var(--tag-0-fg)" },
  { bg: "var(--tag-1-bg)", border: "var(--tag-1-border)", fg: "var(--tag-1-fg)" },
  { bg: "var(--tag-2-bg)", border: "var(--tag-2-border)", fg: "var(--tag-2-fg)" },
  { bg: "var(--tag-3-bg)", border: "var(--tag-3-border)", fg: "var(--tag-3-fg)" },
  { bg: "var(--tag-4-bg)", border: "var(--tag-4-border)", fg: "var(--tag-4-fg)" },
  { bg: "var(--tag-5-bg)", border: "var(--tag-5-border)", fg: "var(--tag-5-fg)" },
  { bg: "var(--tag-6-bg)", border: "var(--tag-6-border)", fg: "var(--tag-6-fg)" },
  { bg: "var(--tag-7-bg)", border: "var(--tag-7-border)", fg: "var(--tag-7-fg)" },
  { bg: "var(--tag-8-bg)", border: "var(--tag-8-border)", fg: "var(--tag-8-fg)" },
  { bg: "var(--tag-9-bg)", border: "var(--tag-9-border)", fg: "var(--tag-9-fg)" },
  { bg: "var(--tag-10-bg)", border: "var(--tag-10-border)", fg: "var(--tag-10-fg)" },
  { bg: "var(--tag-11-bg)", border: "var(--tag-11-border)", fg: "var(--tag-11-fg)" },
];

function hashTag(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function tagColorStyle(tag: string): CSSProperties {
  const normalized = tag.trim().toLowerCase();
  const color = TAG_PALETTE[hashTag(normalized) % TAG_PALETTE.length];
  return {
    background: color.bg,
    borderColor: color.border,
    color: color.fg,
  };
}

type TagPillsProps = {
  tags?: string[] | null;
  className?: string;
};

export function TagPills({ tags, className }: TagPillsProps) {
  const values = Array.isArray(tags) ? tags.map((tag) => tag.trim()).filter(Boolean) : [];
  if (!values.length) return <span className="tag-pills-empty">--</span>;

  return (
    <span className={["tag-pills", className].filter(Boolean).join(" ")}>
      {values.map((tag, index) => (
        <span key={`${tag}-${index}`} className="tag-pill" style={tagColorStyle(tag)}>
          {tag}
        </span>
      ))}
    </span>
  );
}
