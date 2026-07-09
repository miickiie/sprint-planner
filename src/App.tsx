import React, { useState, useEffect, useCallback } from 'react';
import SprintPlannerApp from './components/SprintPlanner';
import { initAuth, googleSignIn, logout as googleLogout, getAccessToken } from './auth';
import { User } from 'firebase/auth';

export default function App() {
  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [user, setUser] = useState<User | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(localStorage.getItem("spreadsheetId"));
  const [data, setData] = useState<any[] | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  useEffect(() => {
    const unsubscribe = initAuth(
      (user) => {
        setUser(user);
        setAuthStatus("authenticated");
      },
      () => {
        setUser(null);
        setAuthStatus("unauthenticated");
      }
    );
    return () => unsubscribe();
  }, []);

  const getHeaders = async () => {
    const token = await getAccessToken();
    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  };

  const fetchSheetData = useCallback(async (id: string) => {
    setLoadingSheet(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Sprints!A:D`, { headers });
      if (res.ok) {
        const json = await res.json();
        const rows = json.values || [];
        setData(rows.map((row: any, index: number) => index === 0 ? { row } : { index_: index, row }));
      } else {
        if (res.status === 401) setAuthStatus("unauthenticated");
        else alert("Failed to fetch sheet data");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSheet(false);
    }
  }, []);

  useEffect(() => {
    if (authStatus === "authenticated" && spreadsheetId) {
      fetchSheetData(spreadsheetId);
    }
  }, [authStatus, spreadsheetId, fetchSheetData]);

  const createSheet = async () => {
    setLoadingSheet(true);
    try {
      const headers = await getHeaders();
      const res = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
        method: "POST",
        headers,
        body: JSON.stringify({
          properties: { title: "Sprint Planner - " + new Date().toISOString().split('T')[0] },
          sheets: [{ properties: { title: 'Sprints' } }]
        })
      });
      if (res.ok) {
        const json = await res.json();
        const newId = json.spreadsheetId;
        
        // Add headers
        await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${newId}/values/Sprints!A1:D1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ values: [['Task Name', 'Start Date', 'Duration (Days)', 'Status']] })
        });

        setSpreadsheetId(newId);
        localStorage.setItem("spreadsheetId", newId);
      } else {
        alert("Failed to create sheet");
      }
    } catch (e) {
      console.error(e);
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
        setAuthStatus("authenticated");
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await googleLogout();
    setAuthStatus("unauthenticated");
    setSpreadsheetId(null);
    localStorage.removeItem("spreadsheetId");
    setData(null);
    setUser(null);
  };

  const updateItem = async (index: number, rowPatch: any[]) => {
    let updatedRow: any[] = [];
    setData((prev) => 
      prev ? prev.map((item: any) => {
        if (item.index_ === index) {
          const newRow = [...item.row];
          for (let i = 0; i < rowPatch.length; i++) {
            if (rowPatch[i] !== undefined) {
              newRow[i] = rowPatch[i];
            }
          }
          updatedRow = newRow;
          return { ...item, row: newRow };
        }
        return item;
      }) : null
    );

    if (updatedRow.length > 0) {
      const headers = await getHeaders();
      await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sprints!A${index+1}:D${index+1}?valueInputOption=USER_ENTERED`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ values: [updatedRow] })
      });
    }
  };

  const getSheetId = async () => {
    const headers = await getHeaders();
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers });
    const json = await res.json();
    return json.sheets?.find((s: any) => s.properties?.title === 'Sprints')?.properties?.sheetId || 0;
  };

  const deleteItem = async (index: number) => {
    const confirmed = window.confirm("Are you sure you want to delete this task? This action cannot be undone.");
    if (!confirmed) return;

    setData((prev) => prev ? prev.filter((item: any) => item.index_ !== index) : null);

    const sheetId = await getSheetId();
    const headers = await getHeaders();
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: index,
              endIndex: index + 1
            }
          }
        }]
      })
    });
  };

  const insertItem = async (afterIndex: number | undefined, rowPatch: any[]) => {
    const maxIndex = data ? Math.max(0, ...data.slice(1).map((item: any) => item.index_ || 0)) : 0;
    const newItem = { index_: maxIndex + 1, row: rowPatch };
    setData((prev) => prev ? [...prev, newItem] : [newItem]);

    const headers = await getHeaders();
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sprints!A:D:append?valueInputOption=USER_ENTERED`, {
      method: "POST",
      headers,
      body: JSON.stringify({ values: [rowPatch] })
    });
  };

  const moveItem = async (fromIndex: number, toIndex: number) => {
    setData((prev) => {
      if (!prev) return null;
      const newData = [...prev];
      const fromItemIdx = newData.findIndex((item: any) => item.index_ === fromIndex);
      const toItemIdx = newData.findIndex((item: any) => item.index_ === toIndex);
      
      if (fromItemIdx > 0 && toItemIdx > 0) {
        const [movedItem] = newData.splice(fromItemIdx, 1);
        newData.splice(toItemIdx, 0, movedItem);
      }
      return newData;
    });

    const sheetId = await getSheetId();
    const headers = await getHeaders();
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        requests: [{
          moveDimension: {
            source: {
              sheetId,
              dimension: 'ROWS',
              startIndex: fromIndex,
              endIndex: fromIndex + 1
            },
            destinationIndex: toIndex > fromIndex ? toIndex + 1 : toIndex
          }
        }]
      })
    });
  };

  if (authStatus === "loading") {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  if (authStatus === "unauthenticated") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center">
          <h1 className="text-2xl font-black text-slate-800 mb-2">Sprint Planner</h1>
          <p className="text-sm text-slate-500 mb-6">Sign in with Google to sync your sprints to Google Sheets.</p>
          <button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl transition-colors flex justify-center items-center gap-2"
          >
            {isLoggingIn ? "Signing in..." : "Continue with Google"}
          </button>
        </div>
      </div>
    );
  }

  if (!spreadsheetId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center">
          <h2 className="text-xl font-bold mb-4">Setup Your Planner</h2>
          <p className="text-sm text-slate-500 mb-6">We'll create a new Google Sheet to store your sprint data.</p>
          <div className="flex gap-4 flex-col">
            <button 
              onClick={createSheet}
              disabled={loadingSheet}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl transition-colors"
            >
              {loadingSheet ? "Creating..." : "Create New Sheet"}
            </button>
            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-2 text-slate-500">Or use existing</span>
              </div>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const fd = new FormData(e.currentTarget);
              const id = fd.get("spreadsheetId") as string;
              if (id) {
                setSpreadsheetId(id);
                localStorage.setItem("spreadsheetId", id);
              }
            }}>
              <input 
                name="spreadsheetId"
                placeholder="Paste Spreadsheet ID"
                className="w-full px-4 py-2 border rounded-lg mb-2"
              />
              <button type="submit" className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl transition-colors">
                Connect Existing Sheet
              </button>
            </form>
          </div>
          <button onClick={handleLogout} className="mt-8 text-sm text-red-500 hover:underline">Logout</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="min-h-screen flex items-center justify-center">Loading Sheet...</div>;
  }

  return (
    <>
      <SprintPlannerApp 
        data={data}
        updateItem={updateItem}
        deleteItem={deleteItem}
        insertItem={insertItem}
        moveItem={moveItem}
        followLink={() => window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}`, "_blank")}
      />
      <button 
        onClick={handleLogout}
        className="fixed bottom-4 left-4 bg-white/80 backdrop-blur px-3 py-1.5 rounded-lg border text-xs font-bold text-slate-500 hover:text-slate-800 z-[999] shadow-sm"
      >
        Sign Out ({user?.email})
      </button>
    </>
  );
}
