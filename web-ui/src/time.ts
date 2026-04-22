function pad(value: number) {
  return String(value).padStart(2, "0");
}

const MONTH_INDEX: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function fallbackText(value: string) {
  const base = value
    .replace(/\.\d+/, "")
    .replace("T", " ")
    .replace(/(?:Z|[+-]\d\d:\d\d)$/, "")
    .trim();
  if (!base) return "--";
  return base.endsWith("UTC+8") ? base : `${base} UTC+8`;
}

function parseXNativeTimestamp(value: string) {
  const match = value.match(/^[A-Za-z]{3}\s+([A-Za-z]{3})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+([+-])(\d{2})(\d{2})\s+(\d{4})$/);
  if (!match) return null;

  const monthIndex = MONTH_INDEX[match[1]];
  if (monthIndex === undefined) return null;

  const day = Number(match[2]);
  const hour = Number(match[3]);
  const minute = Number(match[4]);
  const second = Number(match[5]);
  const sign = match[6] === "+" ? 1 : -1;
  const offsetHour = Number(match[7]);
  const offsetMinute = Number(match[8]);
  const year = Number(match[9]);

  if ([day, hour, minute, second, offsetHour, offsetMinute, year].some((part) => Number.isNaN(part))) {
    return null;
  }

  const offsetTotalMinutes = sign * (offsetHour * 60 + offsetMinute);
  return new Date(Date.UTC(year, monthIndex, day, hour, minute, second) - offsetTotalMinutes * 60 * 1000);
}

function parseSupportedTimestamp(value: string) {
  if (/(?:Z|[+-]\d\d:\d\d)$/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }
  return parseXNativeTimestamp(value);
}

export function formatUtcPlus8Time(value?: string | null, fallback = "--") {
  if (!value) return fallback;

  const normalized = value.trim().replace(/\.\d+(?=(?:Z|[+-]\d\d:\d\d)$)/, "");
  if (!normalized) return fallback;

  const date = parseSupportedTimestamp(normalized);
  if (!date || Number.isNaN(date.getTime())) {
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
