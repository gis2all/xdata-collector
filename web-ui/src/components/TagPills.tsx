import type { CSSProperties } from "react";

const TAG_PALETTE = [
  { bg: "#dbeafe", border: "#60a5fa", fg: "#1e3a8a" },
  { bg: "#dcfce7", border: "#4ade80", fg: "#14532d" },
  { bg: "#ffedd5", border: "#fb923c", fg: "#7c2d12" },
  { bg: "#fce7f3", border: "#f472b6", fg: "#831843" },
  { bg: "#ede9fe", border: "#8b5cf6", fg: "#4c1d95" },
  { bg: "#ccfbf1", border: "#2dd4bf", fg: "#134e4a" },
  { bg: "#fee2e2", border: "#f87171", fg: "#7f1d1d" },
  { bg: "#e0e7ff", border: "#818cf8", fg: "#312e81" },
  { bg: "#fef9c3", border: "#eab308", fg: "#713f12" },
  { bg: "#f0fdf4", border: "#22c55e", fg: "#166534" },
  { bg: "#cffafe", border: "#06b6d4", fg: "#164e63" },
  { bg: "#fae8ff", border: "#d946ef", fg: "#701a75" },
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
