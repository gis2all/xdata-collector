function pad(value: number) {
  return String(value).padStart(2, "0");
}

function fallbackText(value: string) {
  const base = value
    .replace(/\.\d+/, "")
    .replace("T", " ")
    .replace(/(?:Z|[+-]\d\d:\d\d)$/, "")
    .trim();
  if (!base) return "--";
  return base.endsWith("UTC+8") ? base : `${base} UTC+8`;
}

export function formatUtcPlus8Time(value?: string | null, fallback = "--") {
  if (!value) return fallback;

  const normalized = value.trim().replace(/\.\d+(?=(?:Z|[+-]\d\d:\d\d)$)/, "");
  if (!normalized) return fallback;

  if (!/(?:Z|[+-]\d\d:\d\d)$/.test(normalized)) {
    return fallbackText(normalized);
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return fallbackText(normalized);
  }

  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = shifted.getUTCFullYear();
  const mm = pad(shifted.getUTCMonth() + 1);
  const dd = pad(shifted.getUTCDate());
  const hh = pad(shifted.getUTCHours());
  const mi = pad(shifted.getUTCMinutes());
  const ss = pad(shifted.getUTCSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss} UTC+8`;
}
