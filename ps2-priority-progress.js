(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  } else {
    root.Ps2PriorityProgress = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const PRIORITY_SUFFIXES = [
    '0.1', '0.2', '0.3', '1', '2', '3', '4', '5', '6', '7.1', '7.2', '8', '9', '10',
    '11.1', '11.2', '11.3', '12.1', '12.2', '12.3', '13.1', '13.2', '13.3', '14', '15', '16',
  ];
  const WORK_INTERVALS = [[8, 0, 13, 0], [14, 0, 17, 15]];
  const FIXED_HOLIDAYS = ['01-01', '04-25', '05-01', '06-10', '08-15', '10-05', '11-01', '12-01', '12-25'];
  const DAY_MS = 24 * 60 * 60 * 1000;

  function normalizePriority(value) {
    return String(value == null ? '' : value)
      .trim()
      .replace(/^P/i, '')
      .replace(/[,_]/g, '.')
      .replace(/\s+/g, '');
  }

  function normalizeHeader(value) {
    return String(value == null ? '' : value).trim().toUpperCase().replace(/\s+/g, '').replace(/[,_]/g, '.');
  }

  function columnLetterToIndex(value) {
    let index = 0;
    for (const char of String(value || '').toUpperCase()) {
      if (char < 'A' || char > 'Z') return -1;
      index = index * 26 + char.charCodeAt(0) - 64;
    }
    return index - 1;
  }

  function getCellValue(row, index) {
    const cell = row && Array.isArray(row.c) ? row.c[index] : null;
    return cell && cell.v != null ? cell.v : (cell && cell.f != null ? cell.f : null);
  }

  function getHeaderLabel(col) {
    return col && (col.label || col.id) || '';
  }

  function resolveSeriesIndex(table, prefix, suffix) {
    if (!table || !Array.isArray(table.cols)) return -1;
    const target = `${prefix}${suffix}`;
    const targetIndex = PRIORITY_SUFFIXES.indexOf(suffix);
    if (targetIndex < 0) return -1;

    const directIndex = table.cols.findIndex(col => normalizeHeader(getHeaderLabel(col)) === normalizeHeader(target));
    if (directIndex >= 0) return directIndex;

    const absoluteStart = columnLetterToIndex(prefix === 'T' ? 'DX' : 'EX');
    const absoluteTarget = absoluteStart + targetIndex;
    const idIndex = table.cols.findIndex(col => columnLetterToIndex(col && col.id) === absoluteTarget);
    if (idIndex >= 0) return idIndex;

    const firstColumnWithId = table.cols.findIndex(col => columnLetterToIndex(col && col.id) >= 0);
    if (firstColumnWithId >= 0) {
      const firstSheetIndex = columnLetterToIndex(table.cols[firstColumnWithId].id);
      const relativeIndex = firstColumnWithId + absoluteTarget - firstSheetIndex;
      if (relativeIndex >= 0 && relativeIndex < table.cols.length) return relativeIndex;
    }

    const siblingIndex = table.cols.findIndex(col => {
      const match = normalizeHeader(getHeaderLabel(col)).match(new RegExp(`^${prefix}(.+)$`));
      return match && PRIORITY_SUFFIXES.includes(normalizePriority(match[1]));
    });
    if (siblingIndex >= 0) {
      const siblingSuffix = normalizePriority(getHeaderLabel(table.cols[siblingIndex]).slice(prefix.length));
      return siblingIndex + PRIORITY_SUFFIXES.indexOf(suffix) - PRIORITY_SUFFIXES.indexOf(siblingSuffix);
    }

    if (table.cols.length > absoluteTarget) return absoluteTarget;
    if (table.cols.length > targetIndex) return targetIndex;
    return -1;
  }

  function readSeriesValue(table, row, prefix, priority) {
    const suffix = normalizePriority(priority);
    if (!PRIORITY_SUFFIXES.includes(suffix)) return null;
    return getCellValue(row, resolveSeriesIndex(table, prefix, suffix));
  }

  function getCompletionSignal(table, row, priority) {
    if (!table || !Array.isArray(table.cols)) return null;
    const suffix = normalizePriority(priority);
    if (!PRIORITY_SUFFIXES.includes(suffix)) return null;
    const header = `P${suffix}`;
    const index = table.cols.findIndex(col => normalizeHeader(getHeaderLabel(col)) === normalizeHeader(header));
    if (index < 0 || normalizeHeader(getHeaderLabel(table.cols[index + 1])) !== '%') return null;
    return getCellValue(row, index + 1);
  }

  function usesTimeProgress(priority) {
    return ['0.1', '0.2', '0.3', '11.1', '11.2', '11.3'].includes(normalizePriority(priority));
  }

  function getPriorityPercentage(table, row, priority) {
    if (!table || !Array.isArray(table.cols)) return null;
    const suffix = normalizePriority(priority);
    if (!PRIORITY_SUFFIXES.includes(suffix)) return null;
    const index = table.cols.findIndex(col => normalizeHeader(getHeaderLabel(col)) === normalizeHeader(`P${suffix}`));
    if (index < 0 || normalizeHeader(getHeaderLabel(table.cols[index + 1])) !== '%') return null;

    const cell = row && Array.isArray(row.c) ? row.c[index + 1] : null;
    const value = cell && typeof cell.v === 'number' ? cell.v : cell && (cell.f != null ? cell.f : cell.v);
    if (value == null || String(value).trim() === '') return null;
    if (typeof value === 'number') {
      const percent = Math.abs(value) <= 1 ? value * 100 : value;
      return Math.round(percent * 10) / 10;
    }

    const text = String(value).trim().replace(',', '.');
    const percentMatch = text.match(/^([+-]?\d+(?:\.\d+)?)\s*%$/);
    const numericMatch = text.match(/^[+-]?\d+(?:\.\d+)?$/);
    if (!percentMatch && !numericMatch) return null;
    const numeric = Number((percentMatch || numericMatch)[1]);
    const percent = !percentMatch && Math.abs(numeric) <= 1 ? numeric * 100 : numeric;
    return Math.round(percent * 10) / 10;
  }

  function isExactlyComplete(value) {
    if (typeof value === 'number') return value === 1 || value === 100;
    if (value == null) return false;
    const text = String(value).trim().replace(',', '.');
    const percentMatch = text.match(/^([+-]?\d+(?:\.\d+)?)\s*%$/);
    if (percentMatch) return Number(percentMatch[1]) === 100;
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) return false;
    const numeric = Number(text);
    return numeric === 1 || numeric === 100;
  }

  function makeLocalDate(year, month, day, hours = 0, minutes = 0, seconds = 0, milliseconds = 0) {
    const date = new Date(year, month, day, hours, minutes, seconds, milliseconds);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function dateFromTimeParts(parts, referenceDate) {
    const [hours, minutes = 0, seconds = 0, milliseconds = 0] = parts;
    if (hours > 23 || minutes > 59 || seconds > 59) return null;
    return makeLocalDate(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate(), hours, minutes, seconds, milliseconds);
  }

  function parseStart(value, now = new Date()) {
    if (value == null || String(value).trim() === '') return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);
    if (Array.isArray(value) && value.length >= 2) return dateFromTimeParts(value, now);

    if (typeof value === 'number') {
      if (value >= 1) {
        const date = new Date(Date.UTC(1899, 11, 30) + value * DAY_MS);
        return makeLocalDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(), date.getUTCMilliseconds());
      }
      return dateFromTimeParts([0, 0, 0, Math.round(value * DAY_MS)], now);
    }

    const text = String(value).trim();
    const dateValue = text.match(/^Date\((\d+),(\d+),(\d+)(?:,(\d+),(\d+),(\d+)(?:,(\d+))?)?\)$/);
    if (dateValue) {
      return makeLocalDate(
        Number(dateValue[1]), Number(dateValue[2]), Number(dateValue[3]),
        Number(dateValue[4] || 0), Number(dateValue[5] || 0), Number(dateValue[6] || 0), Number(dateValue[7] || 0)
      );
    }

    const timeOnly = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
    if (timeOnly) {
      return dateFromTimeParts([
        Number(timeOnly[1]), Number(timeOnly[2]), Number(timeOnly[3] || 0), Number((timeOnly[4] || '').padEnd(3, '0') || 0),
      ], now);
    }

    const portugueseDateTime = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
    if (portugueseDateTime) {
      return makeLocalDate(
        Number(portugueseDateTime[3]), Number(portugueseDateTime[2]) - 1, Number(portugueseDateTime[1]),
        Number(portugueseDateTime[4] || 0), Number(portugueseDateTime[5] || 0), Number(portugueseDateTime[6] || 0)
      );
    }

    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function parseDuration(value) {
    if (value == null || String(value).trim() === '') return null;
    if (Array.isArray(value) && value.length >= 2) {
      const [hours, minutes = 0, seconds = 0, milliseconds = 0] = value.map(Number);
      return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
    }
    if (typeof value === 'number') return value > 0 ? value * DAY_MS : null;

    const text = String(value).trim();
    const dateDuration = text.match(/^Date\(\d+,\d+,\d+,(\d+),(\d+),(\d+)(?:,(\d+))?\)$/);
    if (dateDuration) {
      const [, hours, minutes, seconds, milliseconds = '0'] = dateDuration;
      return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 1000 + Number(milliseconds);
    }

    const timeDuration = text.match(/^(\d+):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
    if (!timeDuration) return null;
    const hours = Number(timeDuration[1]);
    const minutes = Number(timeDuration[2]);
    const seconds = Number(timeDuration[3] || 0);
    const milliseconds = Number((timeDuration[4] || '').padEnd(3, '0') || 0);
    if (minutes > 59 || seconds > 59) return null;
    return ((hours * 60 + minutes) * 60 + seconds) * 1000 + milliseconds;
  }

  function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function isWorkday(date) {
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) return false;
    const monthDay = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    if (FIXED_HOLIDAYS.includes(monthDay)) return false;
    const easter = easterSunday(date.getFullYear());
    const goodFriday = new Date(easter);
    goodFriday.setDate(goodFriday.getDate() - 2);
    const carnival = new Date(easter);
    carnival.setDate(carnival.getDate() - 47);
    const isGoodFriday = date.getMonth() === goodFriday.getMonth() && date.getDate() === goodFriday.getDate();
    const isCarnival = date.getMonth() === carnival.getMonth() && date.getDate() === carnival.getDate();
    return !isGoodFriday && !isCarnival;
  }

  function getWorkElapsed(start, end) {
    if (!(start instanceof Date) || !(end instanceof Date) || end <= start) return 0;
    let elapsed = 0;
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    const lastDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());

    while (day <= lastDay) {
      if (isWorkday(day)) {
        for (const [fromHour, fromMinute, toHour, toMinute] of WORK_INTERVALS) {
          const intervalStart = new Date(day);
          intervalStart.setHours(fromHour, fromMinute, 0, 0);
          const intervalEnd = new Date(day);
          intervalEnd.setHours(toHour, toMinute, 0, 0);
          const overlapStart = Math.max(start.getTime(), intervalStart.getTime());
          const overlapEnd = Math.min(end.getTime(), intervalEnd.getTime());
          elapsed += Math.max(0, overlapEnd - overlapStart);
        }
      }
      day.setDate(day.getDate() + 1);
    }
    return elapsed;
  }

  function calculateProgress(startValue, durationValue, completionSignal, now = new Date()) {
    if (isExactlyComplete(completionSignal)) return 100;
    const start = parseStart(startValue, now);
    const duration = parseDuration(durationValue);
    if (!start || duration == null || duration <= 0) return null;
    const elapsed = getWorkElapsed(start, now);
    const completedParts = Math.min(5, Math.floor(elapsed / (duration / 6)));
    return Math.round((completedParts * 100 / 6) * 10) / 10;
  }

  function formatPercent(value) {
    return Number(value).toFixed(1).replace('.', ',');
  }

  return {
    PRIORITY_SUFFIXES,
    calculateProgress,
    formatPercent,
    getCompletionSignal,
    getPriorityPercentage,
    isExactlyComplete,
    normalizePriority,
    parseDuration,
    parseStart,
    readSeriesValue,
    usesTimeProgress,
  };
});