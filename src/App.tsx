import React, { useCallback, useEffect, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import SprintPlannerApp from './components/SprintPlanner';
import {
  ACTIVE_PERIOD_STORAGE_KEY,
  DEFAULT_ACTIVE_PERIOD_ID,
  DEFAULT_PERIOD_IDS,
  LEGACY_PERIOD_RANGE_STORAGE_KEY,
  PERIOD_IDS_STORAGE_KEY,
  getInitialActivePeriodId,
  getInitialPeriodIds,
  normalizePeriodIds,
  periodIdForDate,
  periodIdToTabTitle,
  shiftPeriodId,
  tabTitleToPeriodId,
} from './periods';
import {
  clearSheetsAccessToken,
  connectSheetsAccess,
  getAccessToken,
  googleSignIn,
  initAuth,
  isFirebaseConfigured,
  isGoogleClientConfigured,
  logout as googleLogout,
  restoreSheetsAccess,
} from './auth';

type SheetCell = string | number | boolean | null;

type PlannerRow = {
  id?: string;
  index_: number;
  row: SheetCell[];
};

type SheetProperties = {
  sheetId: number;
  title: string;
  index?: number;
  hidden?: boolean;
};

type SpreadsheetMetadata = {
  spreadsheetId: string;
  sheets?: Array<{ properties?: SheetProperties }>;
};

type ValuesResponse = {
  values?: SheetCell[][];
};

type AppendValuesResponse = {
  updates?: {
    updatedRange?: string;
  };
};

type SheetOperationStatus = 'idle' | 'loading' | 'migrating' | 'adding' | 'removing';
type SheetsFetch = (url: string, init?: RequestInit) => Promise<Response>;

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';
const SHEET_HEADERS: SheetCell[] = ['Task Name', 'Start Date', 'Duration (Days)', 'Status'];
const LEGACY_SHEET_TITLE = 'Sprints';
const LEGACY_BACKUP_TITLE = 'Sprints (legacy backup)';

const quoteSheetTitle = (title: string) => `'${title.replace(/'/g, "''")}'`;
const sheetRange = (title: string, a1: string) => `${quoteSheetTitle(title)}!${a1}`;
const valuesUrl = (spreadsheetId: string, title: string, a1: string) => (
  `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(sheetRange(title, a1))}`
);

const getSheetProperties = (metadata: SpreadsheetMetadata) => (
  (metadata.sheets || []).flatMap((sheet) => sheet.properties ? [sheet.properties] : [])
);

const findSheetByTitle = (metadata: SpreadsheetMetadata, title: string) => (
  getSheetProperties(metadata).find((sheet) => sheet.title === title) || null
);

const requireSheetByTitle = (metadata: SpreadsheetMetadata, title: string) => {
  const sheet = findSheetByTitle(metadata, title);
  if (!sheet) throw new Error(`Google Sheets tab "${title}" was not found.`);
  return sheet;
};

const normalizeRow = (row: SheetCell[]) => (
  Array.from({ length: 4 }, (_, index) => row[index] ?? '')
);

const rowKey = (row: SheetCell[]) => JSON.stringify(normalizeRow(row));

const getRowsMissingFromTarget = (sourceRows: SheetCell[][], targetRows: SheetCell[][]) => {
  const targetCounts = new Map<string, number>();
  targetRows.forEach((row) => {
    const key = rowKey(row);
    targetCounts.set(key, (targetCounts.get(key) || 0) + 1);
  });

  const consumedCounts = new Map<string, number>();
  return sourceRows.filter((row) => {
    const key = rowKey(row);
    const consumed = consumedCounts.get(key) || 0;
    consumedCounts.set(key, consumed + 1);
    return consumed >= (targetCounts.get(key) || 0);
  });
};

const parseAppendedRowIndex = (updatedRange?: string) => {
  const match = /!A(\d+)(?::[A-Z]+\d+)?$/.exec(updatedRange || '');
  return match ? Number(match[1]) - 1 : null;
};

const toPlannerRows = (rows: SheetCell[][]): PlannerRow[] => (
  rows.map((row, index) => index === 0
    ? { index_: 0, row }
    : { index_: index, id: crypto.randomUUID(), row })
);

function LoadingCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center ui-fade-up">
        <div className="flex justify-center gap-1.5 mb-5" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="h-2 w-2 rounded-full bg-blue-500 ui-soft-pulse"
              style={{ animationDelay: `${index * 140}ms` }}
            />
          ))}
        </div>
        <h1 className="text-xl font-black text-slate-800 mb-2">{title}</h1>
        <p className="text-sm text-slate-500">{description}</p>
      </div>
    </div>
  );
}

export default function App() {
  const [authStatus, setAuthStatus] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [sheetsAccessStatus, setSheetsAccessStatus] = useState<'checking' | 'ready' | 'missing'>('missing');
  const [user, setUser] = useState<User | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(localStorage.getItem('spreadsheetId'));
  const [data, setData] = useState<PlannerRow[] | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isConnectingSheets, setIsConnectingSheets] = useState(false);
  const [periodIds, setPeriodIds] = useState<string[]>(getInitialPeriodIds);
  const [activePeriodId, setActivePeriodId] = useState(() => getInitialActivePeriodId(getInitialPeriodIds()));
  const [sheetReady, setSheetReady] = useState(false);
  const [sheetOperationStatus, setSheetOperationStatus] = useState<SheetOperationStatus>('idle');
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [setupNonce, setSetupNonce] = useState(0);
  const [dataRefreshNonce, setDataRefreshNonce] = useState(0);
  const loadRequestRef = useRef(0);
  const activePeriodIdRef = useRef(activePeriodId);
  const setupFlightRef = useRef<{ key: string; promise: Promise<string[]> } | null>(null);
  activePeriodIdRef.current = activePeriodId;

  useEffect(() => {
    try {
      localStorage.setItem(PERIOD_IDS_STORAGE_KEY, JSON.stringify(periodIds));
      localStorage.removeItem(LEGACY_PERIOD_RANGE_STORAGE_KEY);
    } catch {
      // The planner still works for the current session when storage is unavailable.
    }
  }, [periodIds]);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_PERIOD_STORAGE_KEY, activePeriodId);
    } catch {
      // The selected quarter remains in memory for this session.
    }
  }, [activePeriodId]);

  useEffect(() => {
    let cancelled = false;
    const restoreSheetsForUser = async (hasSheetsAccess: boolean) => {
      if (hasSheetsAccess) {
        if (!cancelled) setSheetsAccessStatus('ready');
        return;
      }

      setSheetsAccessStatus('checking');
      const restored = await restoreSheetsAccess();
      if (!cancelled) setSheetsAccessStatus(restored ? 'ready' : 'missing');
    };

    const unsubscribe = initAuth(
      (restoredUser, hasSheetsAccess) => {
        if (cancelled) return;
        setUser(restoredUser);
        setAuthStatus('authenticated');
        void restoreSheetsForUser(hasSheetsAccess);
      },
      () => {
        if (cancelled) return;
        setUser(null);
        setAuthStatus('unauthenticated');
        setSheetsAccessStatus('missing');
      }
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const getHeaders = useCallback(async () => {
    const token = await getAccessToken();
    if (!token) {
      setSheetsAccessStatus('missing');
      throw new Error('Google Sheets access is not connected.');
    }

    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }, []);

  const handleSheetsUnauthorized = useCallback(() => {
    clearSheetsAccessToken();
    setupFlightRef.current = null;
    setSheetsAccessStatus('missing');
    setSheetReady(false);
    setData(null);
  }, []);

  const sheetsFetch = useCallback<SheetsFetch>(async (url, init = {}) => {
    const headers = await getHeaders();
    const response = await fetch(url, { ...init, headers });
    if (response.status === 401) {
      handleSheetsUnauthorized();
      throw new Error('Google Sheets access expired.');
    }
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Google Sheets request failed (${response.status}): ${details || response.statusText}`);
    }
    return response;
  }, [getHeaders, handleSheetsUnauthorized]);

  const fetchMetadata = useCallback(async (id: string) => {
    const fields = encodeURIComponent('spreadsheetId,sheets(properties(sheetId,title,index,hidden))');
    const response = await sheetsFetch(`${SHEETS_API}/${id}?fields=${fields}`);
    return response.json() as Promise<SpreadsheetMetadata>;
  }, [sheetsFetch]);

  const fetchValues = useCallback(async (id: string, title: string, a1 = 'A:D') => {
    const response = await sheetsFetch(valuesUrl(id, title, a1));
    const json = await response.json() as ValuesResponse;
    return json.values || [];
  }, [sheetsFetch]);

  const writeValues = useCallback(async (id: string, title: string, a1: string, values: SheetCell[][]) => {
    await sheetsFetch(`${valuesUrl(id, title, a1)}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values }),
    });
  }, [sheetsFetch]);

  const appendValues = useCallback(async (id: string, title: string, values: SheetCell[][]) => {
    const response = await sheetsFetch(`${valuesUrl(id, title, 'A:D')}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values: values.map(normalizeRow) }),
    });
    return response.json() as Promise<AppendValuesResponse>;
  }, [sheetsFetch]);

  const batchUpdate = useCallback(async (id: string, requests: unknown[]) => {
    const response = await sheetsFetch(`${SHEETS_API}/${id}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({ requests }),
    });
    return response.json();
  }, [sheetsFetch]);

  const ensureHeaders = useCallback(async (id: string, title: string) => {
    const firstRow = await fetchValues(id, title, 'A1:D1');
    const isBlank = !firstRow[0] || firstRow[0].every((cell) => cell === null || String(cell).trim() === '');
    if (isBlank) await writeValues(id, title, 'A1:D1', [SHEET_HEADERS]);
  }, [fetchValues, writeValues]);

  const ensureQuarterTabs = useCallback(async (id: string, ids: string[], suppliedMetadata?: SpreadsheetMetadata) => {
    let metadata = suppliedMetadata || await fetchMetadata(id);
    const existingTitles = new Set(getSheetProperties(metadata).map((sheet) => sheet.title));
    const missingTitles = ids.map(periodIdToTabTitle).filter((title) => !existingTitles.has(title));

    if (missingTitles.length > 0) {
      await batchUpdate(id, missingTitles.map((title) => ({ addSheet: { properties: { title } } })));
      metadata = await fetchMetadata(id);
    }

    await Promise.all(ids.map((periodId) => ensureHeaders(id, periodIdToTabTitle(periodId))));
    return metadata;
  }, [batchUpdate, ensureHeaders, fetchMetadata]);

  const migrateLegacySheet = useCallback(async (
    id: string,
    metadata: SpreadsheetMetadata,
    fallbackPeriodId: string,
    currentPeriodIds: string[]
  ) => {
    const legacySheet = findSheetByTitle(metadata, LEGACY_SHEET_TITLE);
    if (!legacySheet) return { metadata, periodIds: currentPeriodIds, migrated: false };

    setSheetOperationStatus('migrating');
    const legacyValues = await fetchValues(id, LEGACY_SHEET_TITLE, 'A:D');
    const legacyRows = legacyValues.slice(1).filter((row) => row.some((cell) => cell !== null && String(cell).trim() !== ''));
    const groupedRows = new Map<string, SheetCell[][]>();

    legacyRows.forEach((row) => {
      const targetPeriodId = periodIdForDate(String(row[1] ?? '')) || fallbackPeriodId || DEFAULT_ACTIVE_PERIOD_ID;
      const group = groupedRows.get(targetPeriodId) || [];
      group.push(normalizeRow(row));
      groupedRows.set(targetPeriodId, group);
    });

    const migratedPeriodIds = normalizePeriodIds([...currentPeriodIds, ...groupedRows.keys()]);
    metadata = await ensureQuarterTabs(id, migratedPeriodIds, metadata);

    for (const [periodId, sourceRows] of groupedRows) {
      const title = periodIdToTabTitle(periodId);
      const targetValues = await fetchValues(id, title, 'A2:D');
      const missingRows = getRowsMissingFromTarget(sourceRows, targetValues);
      if (missingRows.length > 0) await appendValues(id, title, missingRows);
    }

    const titles = new Set(getSheetProperties(metadata).map((sheet) => sheet.title));
    let backupTitle = LEGACY_BACKUP_TITLE;
    let suffix = 2;
    while (titles.has(backupTitle)) {
      backupTitle = `Sprints (legacy backup ${suffix})`;
      suffix += 1;
    }

    await batchUpdate(id, [{
      updateSheetProperties: {
        properties: { sheetId: legacySheet.sheetId, title: backupTitle, hidden: true },
        fields: 'title,hidden',
      },
    }]);

    return {
      metadata: await fetchMetadata(id),
      periodIds: migratedPeriodIds,
      migrated: true,
    };
  }, [appendValues, batchUpdate, ensureQuarterTabs, fetchMetadata, fetchValues]);

  useEffect(() => {
    if (authStatus !== 'authenticated' || sheetsAccessStatus !== 'ready' || !spreadsheetId) return;

    let cancelled = false;
    const setupKey = `${spreadsheetId}:${setupNonce}`;
    setSheetReady(false);
    setData(null);
    setSheetError(null);
    setSheetOperationStatus('loading');

    if (setupFlightRef.current?.key !== setupKey) {
      const storedPeriodIds = [...periodIds];
      const setupActivePeriodId = activePeriodId;
      const promise = (async () => {
        let metadata = await fetchMetadata(spreadsheetId);
        const metadataPeriodIds = getSheetProperties(metadata).flatMap((sheet) => {
          const periodId = tabTitleToPeriodId(sheet.title);
          return periodId ? [periodId] : [];
        });
        const setupPeriodIds = normalizePeriodIds([...storedPeriodIds, ...metadataPeriodIds]);
        const fallbackPeriodId = setupPeriodIds.includes(setupActivePeriodId)
          ? setupActivePeriodId
          : setupPeriodIds[0] || DEFAULT_ACTIVE_PERIOD_ID;
        const migration = await migrateLegacySheet(spreadsheetId, metadata, fallbackPeriodId, setupPeriodIds);
        metadata = migration.metadata;
        const nextPeriodIds = migration.periodIds.length > 0 ? migration.periodIds : [...DEFAULT_PERIOD_IDS];
        await ensureQuarterTabs(spreadsheetId, nextPeriodIds, metadata);
        return nextPeriodIds;
      })();
      setupFlightRef.current = { key: setupKey, promise };
      const clearSetupFlight = () => {
        if (setupFlightRef.current?.promise === promise) setupFlightRef.current = null;
      };
      void promise.then(clearSetupFlight, clearSetupFlight);
    }

    void setupFlightRef.current.promise
      .then((nextPeriodIds) => {
        if (cancelled) return;
        setPeriodIds(nextPeriodIds);
        if (!nextPeriodIds.includes(activePeriodIdRef.current)) setActivePeriodId(nextPeriodIds[0]);
        setSheetReady(true);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setSheetError(error instanceof Error ? error.message : 'Unable to prepare the spreadsheet.');
      })
      .finally(() => {
        if (!cancelled) setSheetOperationStatus('idle');
      });

    return () => { cancelled = true; };
    // setupNonce intentionally retries the same spreadsheet after a recoverable error.
  }, [authStatus, sheetsAccessStatus, spreadsheetId, setupNonce, fetchMetadata, ensureQuarterTabs, migrateLegacySheet]);

  useEffect(() => {
    if (!sheetReady || !spreadsheetId || !periodIds.includes(activePeriodId)) return;

    const requestId = ++loadRequestRef.current;
    const loadActiveQuarter = async () => {
      setData(null);
      setSheetError(null);
      setSheetOperationStatus('loading');
      try {
        const title = periodIdToTabTitle(activePeriodId);
        const rows = await fetchValues(spreadsheetId, title, 'A:D');
        if (loadRequestRef.current === requestId) setData(toPlannerRows(rows));
      } catch (error) {
        console.error(error);
        if (loadRequestRef.current === requestId) {
          setSheetError(error instanceof Error ? error.message : 'Unable to load the selected quarter.');
        }
      } finally {
        if (loadRequestRef.current === requestId) setSheetOperationStatus('idle');
      }
    };

    void loadActiveQuarter();
  }, [activePeriodId, dataRefreshNonce, fetchValues, periodIds, sheetReady, spreadsheetId]);

  const createSheet = async () => {
    setLoadingSheet(true);
    setSheetError(null);
    try {
      const response = await sheetsFetch(SHEETS_API, {
        method: 'POST',
        body: JSON.stringify({
          properties: { title: `Quarterly Cockpit - ${new Date().toISOString().split('T')[0]}` },
          sheets: periodIds.map((periodId) => ({ properties: { title: periodIdToTabTitle(periodId) } })),
        }),
      });
      const created = await response.json() as SpreadsheetMetadata;
      if (!created.spreadsheetId) throw new Error('Google Sheets did not return a spreadsheet ID.');
      await Promise.all(periodIds.map((periodId) => ensureHeaders(created.spreadsheetId, periodIdToTabTitle(periodId))));
      setSpreadsheetId(created.spreadsheetId);
      localStorage.setItem('spreadsheetId', created.spreadsheetId);
    } catch (error) {
      console.error(error);
      setSheetError(error instanceof Error ? error.message : 'Unable to create the spreadsheet.');
    } finally {
      setLoadingSheet(false);
    }
  };

  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setAuthStatus('authenticated');
        setSheetsAccessStatus('ready');
      }
    } catch (error) {
      console.error('Login failed:', error);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleReconnectSheets = async () => {
    setIsConnectingSheets(true);
    try {
      const result = await connectSheetsAccess();
      setUser(result.user);
      setAuthStatus('authenticated');
      setSheetsAccessStatus('ready');
    } catch (error) {
      console.error('Google Sheets reconnect failed:', error);
    } finally {
      setIsConnectingSheets(false);
    }
  };

  const handleLogout = async () => {
    await googleLogout();
    setAuthStatus('unauthenticated');
    setSheetsAccessStatus('missing');
    setSpreadsheetId(null);
    localStorage.removeItem('spreadsheetId');
    setData(null);
    setSheetReady(false);
    setUser(null);
  };

  const reportMutationError = (message: string, error: unknown) => {
    console.error(error);
    window.alert(message);
    setDataRefreshNonce((value) => value + 1);
  };

  const ensureWritablePeriod = async (periodId: string) => {
    if (!spreadsheetId) throw new Error('No spreadsheet is connected.');
    await ensureQuarterTabs(spreadsheetId, [periodId]);
    setPeriodIds((current) => normalizePeriodIds([...current, periodId]));
  };

  const deleteSheetRow = async (id: string, title: string, rowIndex: number, metadata?: SpreadsheetMetadata) => {
    const currentMetadata = metadata || await fetchMetadata(id);
    const sheet = requireSheetByTitle(currentMetadata, title);
    await batchUpdate(id, [{
      deleteDimension: {
        range: { sheetId: sheet.sheetId, dimension: 'ROWS', startIndex: rowIndex, endIndex: rowIndex + 1 },
      },
    }]);
  };

  const updateItem = async (index: number, rowPatch: SheetCell[]) => {
    if (!spreadsheetId || !data) return false;
    const sourcePeriodId = activePeriodId;
    const sourceTitle = periodIdToTabTitle(sourcePeriodId);
    const sourceItem = data.find((item) => item.index_ === index);
    if (!sourceItem) return false;

    const updatedRow = normalizeRow(sourceItem.row);
    rowPatch.forEach((cell, cellIndex) => {
      if (cell !== undefined) updatedRow[cellIndex] = cell;
    });
    const targetPeriodId = periodIdForDate(String(updatedRow[1] ?? '')) || sourcePeriodId;

    try {
      if (targetPeriodId === sourcePeriodId) {
        await writeValues(spreadsheetId, sourceTitle, `A${index + 1}:D${index + 1}`, [updatedRow]);
        setData((current) => activePeriodIdRef.current === sourcePeriodId
          ? current?.map((item) => item.index_ === index ? { ...item, row: updatedRow } : item) || null
          : current);
        return true;
      }

      await ensureWritablePeriod(targetPeriodId);
      const targetTitle = periodIdToTabTitle(targetPeriodId);
      const appendResult = await appendValues(spreadsheetId, targetTitle, [updatedRow]);
      const appendedIndex = parseAppendedRowIndex(appendResult.updates?.updatedRange);
      if (appendedIndex === null) {
        throw new Error('Google Sheets appended the destination row without returning its row number; the source row was left unchanged.');
      }

      try {
        await deleteSheetRow(spreadsheetId, sourceTitle, index);
      } catch (error) {
        try {
          await deleteSheetRow(spreadsheetId, targetTitle, appendedIndex);
        } catch (rollbackError) {
          console.error('Could not roll back the target row after a failed move:', rollbackError);
        }
        throw error;
      }

      if (activePeriodIdRef.current === sourcePeriodId) setActivePeriodId(targetPeriodId);
      return true;
    } catch (error) {
      reportMutationError('The work item could not be saved. The active quarter will be reloaded.', error);
      return false;
    }
  };

  const deleteItem = async (index: number) => {
    if (!spreadsheetId) return false;
    const sourcePeriodId = activePeriodId;
    const confirmed = window.confirm('Are you sure you want to delete this task? This action cannot be undone.');
    if (!confirmed) return false;

    try {
      await deleteSheetRow(spreadsheetId, periodIdToTabTitle(sourcePeriodId), index);
      setData((current) => {
        if (!current || activePeriodIdRef.current !== sourcePeriodId) return current;
        return current
          .filter((item) => item.index_ !== index)
          .map((item) => item.index_ > index ? { ...item, index_: item.index_ - 1 } : item);
      });
      return true;
    } catch (error) {
      reportMutationError('The work item could not be deleted. The active quarter will be reloaded.', error);
      return false;
    }
  };

  const insertItem = async (_afterIndex: number | undefined, rowPatch: SheetCell[]) => {
    if (!spreadsheetId) return false;
    const sourcePeriodId = activePeriodId;
    const normalized = normalizeRow(rowPatch);
    const targetPeriodId = periodIdForDate(String(normalized[1] ?? '')) || sourcePeriodId;

    try {
      await ensureWritablePeriod(targetPeriodId);
      const targetTitle = periodIdToTabTitle(targetPeriodId);
      const result = await appendValues(spreadsheetId, targetTitle, [normalized]);
      const appendedIndex = parseAppendedRowIndex(result.updates?.updatedRange);

      if (targetPeriodId !== sourcePeriodId) {
        if (activePeriodIdRef.current === sourcePeriodId) setActivePeriodId(targetPeriodId);
      } else if (appendedIndex !== null) {
        setData((current) => activePeriodIdRef.current === sourcePeriodId && current
          ? [...current, { index_: appendedIndex, id: crypto.randomUUID(), row: normalized }]
          : current);
      } else {
        setDataRefreshNonce((value) => value + 1);
      }
      return true;
    } catch (error) {
      reportMutationError('The work item could not be added. The active quarter will be reloaded.', error);
      return false;
    }
  };

  const moveItem = async (fromIndex: number, toIndex: number) => {
    if (!spreadsheetId || fromIndex === toIndex) return false;
    const sourcePeriodId = activePeriodId;
    const title = periodIdToTabTitle(sourcePeriodId);

    try {
      const metadata = await fetchMetadata(spreadsheetId);
      const sheet = requireSheetByTitle(metadata, title);
      await batchUpdate(spreadsheetId, [{
        moveDimension: {
          source: { sheetId: sheet.sheetId, dimension: 'ROWS', startIndex: fromIndex, endIndex: fromIndex + 1 },
          destinationIndex: toIndex > fromIndex ? toIndex + 1 : toIndex,
        },
      }]);

      if (activePeriodIdRef.current === sourcePeriodId) setDataRefreshNonce((value) => value + 1);
      return true;
    } catch (error) {
      reportMutationError('The work item could not be reordered. The active quarter will be reloaded.', error);
      return false;
    }
  };

  const addPeriod = async (direction: 'previous' | 'next') => {
    if (!spreadsheetId || sheetOperationStatus !== 'idle') return false;
    const edgeId = direction === 'previous' ? periodIds[0] : periodIds[periodIds.length - 1];
    const nextId = shiftPeriodId(edgeId || DEFAULT_ACTIVE_PERIOD_ID, direction === 'previous' ? -1 : 1);
    setSheetOperationStatus('adding');
    try {
      await ensureWritablePeriod(nextId);
      setActivePeriodId(nextId);
      return true;
    } catch (error) {
      reportMutationError('The quarter could not be added.', error);
      return false;
    } finally {
      setSheetOperationStatus('idle');
    }
  };

  const removePeriod = async (periodId: string) => {
    if (!spreadsheetId || periodIds.length <= 1 || sheetOperationStatus !== 'idle') return false;
    const removedIndex = periodIds.indexOf(periodId);
    if (removedIndex < 0) return false;

    setSheetOperationStatus('removing');
    try {
      const metadata = await fetchMetadata(spreadsheetId);
      const sheet = requireSheetByTitle(metadata, periodIdToTabTitle(periodId));
      await batchUpdate(spreadsheetId, [{ deleteSheet: { sheetId: sheet.sheetId } }]);

      const nextPeriodIds = periodIds.filter((id) => id !== periodId);
      const nextActiveId = nextPeriodIds[Math.min(removedIndex, nextPeriodIds.length - 1)];
      setPeriodIds(nextPeriodIds);
      setActivePeriodId(nextActiveId);
      return true;
    } catch (error) {
      reportMutationError('The quarter tab could not be deleted.', error);
      return false;
    } finally {
      setSheetOperationStatus('idle');
    }
  };

  if (authStatus === 'loading') {
    return <LoadingCard title="Opening Quarterly Cockpit" description="Restoring your session..." />;
  }

  if (authStatus === 'unauthenticated') {
    if (!isFirebaseConfigured) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full text-center ui-fade-up">
            <h1 className="text-2xl font-black text-slate-800 mb-4">Firebase Setup Required</h1>
            <p className="text-sm text-slate-600 mb-6 text-left">To deploy this app and use Google Authentication on your own domain, configure a Firebase project.</p>
            <div className="text-left text-sm text-slate-700 space-y-4 mb-6">
              <p>1. Create a Firebase project at <strong>console.firebase.google.com</strong></p>
              <p>2. Enable <strong>Google Authentication</strong> in the Firebase Console.</p>
              <p>3. Add your deployment domain to the <strong>Authorized domains</strong> list.</p>
              <p>4. Add your Firebase config values as GitHub Secrets or environment variables.</p>
            </div>
          </div>
        </div>
      );
    }

    if (!isGoogleClientConfigured) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full text-center ui-fade-up">
            <h1 className="text-2xl font-black text-slate-800 mb-4">Google OAuth Setup Required</h1>
            <p className="text-sm text-slate-600 text-left">Add your Google OAuth web client ID as <code>VITE_GOOGLE_CLIENT_ID</code> so the app can request Google Sheets access.</p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center ui-fade-up">
          <h1 className="text-2xl font-black text-slate-800 mb-2">Quarterly Cockpit</h1>
          <p className="text-sm text-slate-500 mb-6">Sign in with Google to sync your sprint plan to Google Sheets.</p>
          <button onClick={handleLogin} disabled={isLoggingIn} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl ui-interactive ui-focus-ring">
            {isLoggingIn ? 'Signing in...' : 'Continue with Google'}
          </button>
        </div>
      </div>
    );
  }

  if (sheetsAccessStatus === 'checking') {
    return <LoadingCard title="Restoring Google Sheets" description="Checking whether Google can refresh Sheets access silently..." />;
  }

  if (sheetsAccessStatus === 'missing') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center ui-fade-up">
          <h1 className="text-2xl font-black text-slate-800 mb-2">{isGoogleClientConfigured ? 'Reconnect Google Sheets' : 'Google OAuth Setup Required'}</h1>
          <p className="text-sm text-slate-500 mb-6">
            You are still signed in{user?.email ? ` as ${user.email}` : ''}. {isGoogleClientConfigured ? 'Reconnect Google Sheets access to continue.' : 'Sheets access requires VITE_GOOGLE_CLIENT_ID.'}
          </p>
          {isGoogleClientConfigured && (
            <button onClick={handleReconnectSheets} disabled={isConnectingSheets} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl ui-interactive ui-focus-ring">
              {isConnectingSheets ? 'Reconnecting...' : 'Reconnect Google Sheets'}
            </button>
          )}
          <button onClick={handleLogout} className="mt-6 text-sm text-red-500 hover:underline ui-focus-ring rounded-md">Sign out</button>
        </div>
      </div>
    );
  }

  if (!spreadsheetId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center ui-fade-up">
          <h2 className="text-xl font-bold mb-4">Set Up Your Planner</h2>
          <p className="text-sm text-slate-500 mb-6">Create a Google Sheet with one tab per quarter, or connect an existing planner.</p>
          {sheetError && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm font-bold text-red-700">{sheetError}</p>}
          <div className="flex gap-4 flex-col">
            <button onClick={createSheet} disabled={loadingSheet} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl ui-interactive ui-focus-ring">
              {loadingSheet ? 'Creating...' : 'Create New Sheet'}
            </button>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
              <div className="relative flex justify-center text-sm"><span className="bg-white px-2 text-slate-500">Or use existing</span></div>
            </div>
            <form onSubmit={(event) => {
              event.preventDefault();
              const id = String(new FormData(event.currentTarget).get('spreadsheetId') || '').trim();
              if (id) {
                setSheetError(null);
                setSpreadsheetId(id);
                localStorage.setItem('spreadsheetId', id);
              }
            }}>
              <input name="spreadsheetId" placeholder="Paste Spreadsheet ID" className="w-full px-4 py-2 border rounded-lg mb-2 ui-focus-ring" />
              <button type="submit" className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl ui-interactive ui-focus-ring">Connect Existing Sheet</button>
            </form>
          </div>
          <button onClick={handleLogout} className="mt-8 text-sm text-red-500 hover:underline ui-focus-ring rounded-md">Logout</button>
        </div>
      </div>
    );
  }

  if (sheetError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center ui-fade-up">
          <h1 className="text-xl font-black text-slate-800 mb-2">Google Sheet Needs Attention</h1>
          <p className="text-sm text-slate-500 mb-6 break-words">{sheetError}</p>
          <button onClick={() => setSetupNonce((value) => value + 1)} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-xl ui-interactive ui-focus-ring">Retry</button>
          <button onClick={() => {
            setSpreadsheetId(null);
            setSheetReady(false);
            setData(null);
            setSheetError(null);
            localStorage.removeItem('spreadsheetId');
          }} className="mt-4 text-sm font-bold text-slate-500 hover:text-slate-800 ui-focus-ring rounded-md">Choose another sheet</button>
        </div>
      </div>
    );
  }

  if (!data) {
    const description = sheetOperationStatus === 'migrating'
      ? 'Splitting the legacy Sprints tab into quarter tabs...'
      : 'Preparing the selected quarter...';
    return <LoadingCard title="Loading Sheet" description={description} />;
  }

  return (
    <>
      <SprintPlannerApp
        data={data}
        updateItem={updateItem}
        deleteItem={deleteItem}
        insertItem={insertItem}
        moveItem={moveItem}
        followLink={() => window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`, '_blank', 'noopener,noreferrer')}
        periodIds={periodIds}
        activePeriodId={activePeriodId}
        onSelectPeriod={setActivePeriodId}
        onAddPeriod={addPeriod}
        onRemovePeriod={removePeriod}
        sheetOperationStatus={sheetOperationStatus}
      />
      <button onClick={handleLogout} className="fixed bottom-4 left-4 bg-white/90 backdrop-blur px-3 py-1.5 rounded-lg border text-xs font-bold text-slate-500 hover:text-slate-800 z-[999] shadow-sm ui-interactive ui-focus-ring">
        Sign Out ({user?.email})
      </button>
    </>
  );
}
