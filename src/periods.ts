export type Period = {
  id: string;
  label: string;
  start: Date;
  end: Date;
};

export const DEFAULT_PERIODS: Period[] = [
  { id: 'Q3-26', label: 'Q3 2026', start: new Date(2026, 5, 29), end: new Date(2026, 8, 27) },
  { id: 'Q4-26', label: 'Q4 2026', start: new Date(2026, 8, 28), end: new Date(2027, 0, 3) },
  { id: 'Q1-27', label: 'Q1 2027', start: new Date(2027, 0, 4), end: new Date(2027, 2, 28) },
  { id: 'Q2-27', label: 'Q2 2027', start: new Date(2027, 2, 29), end: new Date(2027, 5, 27) },
  { id: 'Q3-27', label: 'Q3 2027', start: new Date(2027, 5, 28), end: new Date(2027, 8, 26) },
  { id: 'Q4-27', label: 'Q4 2027', start: new Date(2027, 8, 27), end: new Date(2028, 0, 2) },
];

export const DEFAULT_ACTIVE_PERIOD_ID = 'Q3-26';
export const DEFAULT_PERIOD_IDS = DEFAULT_PERIODS.map((period) => period.id);
export const PERIOD_IDS_STORAGE_KEY = 'sprintPlannerPeriodIds';
export const ACTIVE_PERIOD_STORAGE_KEY = 'sprintPlannerActivePeriodId';
export const LEGACY_PERIOD_RANGE_STORAGE_KEY = 'sprintPlannerPeriodRange';

const MAX_STORED_PERIODS = 40;

const addDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

export const parsePeriodId = (id: string) => {
  const match = /^Q([1-4])-(\d{2})$/.exec(id);
  if (!match) return null;
  return { quarter: Number(match[1]), year: 2000 + Number(match[2]) };
};

export const periodSortValue = (id: string) => {
  const parsed = parsePeriodId(id);
  return parsed ? parsed.year * 4 + parsed.quarter : Number.NaN;
};

const makePeriodId = (quarter: number, year: number) => `Q${quarter}-${String(year).slice(-2)}`;

export const shiftPeriodId = (id: string, offset: number) => {
  const parsed = parsePeriodId(id);
  if (!parsed) return id;
  const shifted = parsed.year * 4 + (parsed.quarter - 1) + offset;
  const year = Math.floor(shifted / 4);
  const quarter = ((shifted % 4) + 4) % 4 + 1;
  return makePeriodId(quarter, year);
};

const mondayOnOrBefore = (date: Date) => {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
};

const firstMondayOnOrAfter = (date: Date) => {
  const day = date.getDay();
  return addDays(date, day === 0 ? 1 : (8 - day) % 7);
};

const getQuarterStart = (id: string) => {
  const parsed = parsePeriodId(id);
  if (!parsed) return new Date(DEFAULT_PERIODS[0].start);
  if (parsed.quarter === 1) return firstMondayOnOrAfter(new Date(parsed.year, 0, 1));
  return mondayOnOrBefore(new Date(parsed.year, (parsed.quarter - 1) * 3, 1));
};

export const buildPeriod = (id: string): Period => {
  const parsed = parsePeriodId(id);
  if (!parsed) return DEFAULT_PERIODS[0];

  const defaultPeriod = DEFAULT_PERIODS.find((period) => period.id === id);
  if (defaultPeriod) return defaultPeriod;

  const start = getQuarterStart(id);
  return {
    id,
    label: `Q${parsed.quarter} ${parsed.year}`,
    start,
    end: addDays(getQuarterStart(shiftPeriodId(id, 1)), -1),
  };
};

export const periodIdToTabTitle = (id: string) => buildPeriod(id).label;

export const tabTitleToPeriodId = (title: string) => {
  const match = /^Q([1-4]) (20\d{2})$/.exec(title.trim());
  return match ? makePeriodId(Number(match[1]), Number(match[2])) : null;
};

export const periodIdForDate = (value: string | Date) => {
  let date: Date;
  if (value instanceof Date) {
    date = value;
  } else {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
    if (dateOnly) {
      const year = Number(dateOnly[1]);
      const month = Number(dateOnly[2]) - 1;
      const day = Number(dateOnly[3]);
      date = new Date(year, month, day);
      if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) return null;
    } else {
      date = new Date(value);
    }
  }
  if (Number.isNaN(date.getTime())) return null;
  const localDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const calendarQuarter = Math.floor(localDate.getMonth() / 3) + 1;
  const candidate = makePeriodId(calendarQuarter, localDate.getFullYear());

  for (const offset of [-1, 0, 1]) {
    const id = shiftPeriodId(candidate, offset);
    const period = buildPeriod(id);
    if (localDate >= period.start && localDate <= period.end) return id;
  }

  return candidate;
};

export const normalizePeriodIds = (ids: string[]) => (
  [...new Set(ids.filter((id) => parsePeriodId(id)))]
    .sort((left, right) => periodSortValue(left) - periodSortValue(right))
    .slice(0, MAX_STORED_PERIODS)
);

export const buildPeriodRangeIds = (startId: string, endId: string) => {
  if (!parsePeriodId(startId) || !parsePeriodId(endId) || periodSortValue(startId) > periodSortValue(endId)) {
    return [...DEFAULT_PERIOD_IDS];
  }

  const ids: string[] = [];
  let currentId = startId;
  while (periodSortValue(currentId) <= periodSortValue(endId) && ids.length < MAX_STORED_PERIODS) {
    ids.push(currentId);
    currentId = shiftPeriodId(currentId, 1);
  }
  return ids;
};

export const getInitialPeriodIds = () => {
  if (typeof window === 'undefined') return [...DEFAULT_PERIOD_IDS];

  try {
    const storedIds = JSON.parse(window.localStorage.getItem(PERIOD_IDS_STORAGE_KEY) || 'null');
    if (Array.isArray(storedIds)) {
      const normalized = normalizePeriodIds(storedIds);
      if (normalized.length > 0) return normalized;
    }

    const legacyRange = JSON.parse(window.localStorage.getItem(LEGACY_PERIOD_RANGE_STORAGE_KEY) || 'null');
    if (typeof legacyRange?.startId === 'string' && typeof legacyRange?.endId === 'string') {
      return buildPeriodRangeIds(legacyRange.startId, legacyRange.endId);
    }
  } catch {
    // Fall through to the built-in quarter range.
  }

  return [...DEFAULT_PERIOD_IDS];
};

export const getInitialActivePeriodId = (periodIds: string[]) => {
  if (typeof window !== 'undefined') {
    const storedId = window.localStorage.getItem(ACTIVE_PERIOD_STORAGE_KEY);
    if (storedId && periodIds.includes(storedId)) return storedId;
  }
  return periodIds.includes(DEFAULT_ACTIVE_PERIOD_ID) ? DEFAULT_ACTIVE_PERIOD_ID : periodIds[0];
};
