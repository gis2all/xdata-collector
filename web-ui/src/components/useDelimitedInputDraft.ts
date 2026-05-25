import { useEffect, useRef, useState } from "react";

type UseDelimitedInputDraftOptions = {
  value: string[] | undefined;
  parse: (raw: string) => string[];
  format: (items: string[] | undefined) => string;
  onValueChange: (items: string[]) => void;
};

function normalizeItems(value: string[] | undefined): string[] {
  return Array.isArray(value) ? [...value] : [];
}

function sameItems(left: string[] | undefined, right: string[] | undefined): boolean {
  const a = normalizeItems(left);
  const b = normalizeItems(right);
  if (a.length !== b.length) return false;
  return a.every((item, index) => item === b[index]);
}

export function useDelimitedInputDraft({ value, parse, format, onValueChange }: UseDelimitedInputDraftOptions) {
  const [draft, setDraft] = useState(() => format(value));
  const [editing, setEditing] = useState(false);
  const lastParsedRef = useRef<string[]>(normalizeItems(value));

  useEffect(() => {
    const nextItems = normalizeItems(value);
    if (editing && sameItems(nextItems, lastParsedRef.current)) {
      return;
    }
    lastParsedRef.current = nextItems;
    setDraft(format(nextItems));
    setEditing(false);
  }, [editing, format, value]);

  function handleChange(raw: string) {
    const parsed = parse(raw);
    lastParsedRef.current = parsed;
    setEditing(true);
    setDraft(raw);
    onValueChange(parsed);
  }

  function handleFocus() {
    setEditing(true);
  }

  function handleBlur() {
    const parsed = parse(draft);
    lastParsedRef.current = parsed;
    setEditing(false);
    setDraft(format(parsed));
  }

  return {
    draft,
    handleChange,
    handleFocus,
    handleBlur,
  };
}
