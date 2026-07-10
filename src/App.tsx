import React, { useState, useEffect, useCallback } from 'react';
import SprintPlannerApp from './components/SprintPlanner';
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
import { User } from 'firebase/auth';

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
  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [sheetsAccessStatus, setSheetsAccessStatus] = useState<"checking" | "ready" | "missing">("missing");
  const [user, setUser] = useState<User | null>(null);
  const [spreadsheetId, setSpreadsheetId] = useState<string | null>(localStorage.getItem("spreadsheetId"));
  const [data, setData] = useState<any[] | null>(null);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isConnectingSheets, setIsConnectingSheets] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const restoreSheetsForUser = async (hasSheetsAccess: boolean) => {
      if (hasSheetsAccess) {
        if (!cancelled) setSheetsAccessStatus("ready");
        return;
      }

      setSheetsAccessStatus("checking");
      const restored = await restoreSheetsAccess();
      if (!cancelled) {
        setSheetsAccessStatus(restored ? "ready" : "missing");
      }
    };

    const unsubscribe = initAuth(
      (user, hasSheetsAccess) => {
        if (cancelled) return;
        setUser(user);
        setAuthStatus("authenticated");
        void restoreSheetsForUser(hasSheetsAccess);
      },
      () => {
        if (cancelled) return;
        setUser(null);
        setAuthStatus("unauthenticated");
        setSheetsAccessStatus("missing");
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
      setSheetsAccessStatus("missing");
      throw new Error("Google Sheets access is not connected");
    }

    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    };
  }, []);

  const handleSheetsUnauthorized = useCallback(() => {
    clearSheetsAccessToken();
    setSheetsAccessStatus("missing");
    setData(null);
  }, []);

  const fetchSheetData = useCallback(async (id: string) => {
    setLoadingSheet(true);
    try {
      const headers = await getHeaders();
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/Sprints!A:D`, { headers });
      if (res.ok) {
        const json = await res.json();
        const rows = json.values || [];
        setData(rows.map((row: any, index: number) => index === 0 ? { row } : { index_: index, id: crypto.randomUUID(), row }));
      } else {
        if (res.status === 401) handleSheetsUnauthorized();
        else alert("Failed to fetch sheet data");
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSheet(false);
    }
  }, [getHeaders, handleSheetsUnauthorized]);

  useEffect(() => {
    if (authStatus === "authenticated" && sheetsAccessStatus === "ready" && spreadsheetId) {
      fetchSheetData(spreadsheetId);
    }
  }, [authStatus, sheetsAccessStatus, spreadsheetId, fetchSheetData]);

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
        const headerRes = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${newId}/values/Sprints!A1:D1?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ values: [['Task Name', 'Start Date', 'Duration (Days)', 'Status']] })
        });
        if (headerRes.status === 401) {
          handleSheetsUnauthorized();
          return;
        }
        if (!headerRes.ok) {
          const text = await headerRes.text();
          console.error("Failed to create sheet headers:", headerRes.status, text);
          alert(`Sheet was created, but headers could not be added (Status: ${headerRes.status}). See console for details.`);
          return;
        }

        setSpreadsheetId(newId);
        localStorage.setItem("spreadsheetId", newId);
      } else {
        const text = await res.text();
        console.error("Failed to create sheet:", res.status, text);
        if (res.status === 401) {
          handleSheetsUnauthorized();
          return;
        }
        alert(`Failed to create sheet (Status: ${res.status}). See console for details.`);
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
        setSheetsAccessStatus("ready");
      }
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleReconnectSheets = async () => {
    setIsConnectingSheets(true);
    try {
      const result = await connectSheetsAccess();
      setUser(result.user);
      setAuthStatus("authenticated");
      setSheetsAccessStatus("ready");
    } catch (err) {
      console.error('Google Sheets reconnect failed:', err);
    } finally {
      setIsConnectingSheets(false);
    }
  };

  const handleLogout = async () => {
    await googleLogout();
    setAuthStatus("unauthenticated");
    setSheetsAccessStatus("missing");
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
      const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sprints!A${index+1}:D${index+1}?valueInputOption=USER_ENTERED`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ values: [updatedRow] })
      });
      if (res.status === 401) handleSheetsUnauthorized();
    }
  };

  const getSheetId = async () => {
    const headers = await getHeaders();
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, { headers });
    if (res.status === 401) {
      handleSheetsUnauthorized();
      throw new Error("Google Sheets access expired");
    }
    const json = await res.json();
    return json.sheets?.find((s: any) => s.properties?.title === 'Sprints')?.properties?.sheetId || 0;
  };

  const deleteItem = async (index: number) => {
    const confirmed = window.confirm("Are you sure you want to delete this task? This action cannot be undone.");
    if (!confirmed) return false;

    setData((prev) => {
      if (!prev) return null;
      const filtered = prev.filter((item: any) => item.index_ !== index);
      return filtered.map((item, idx) => idx === 0 ? item : { ...item, index_: idx });
    });

    const sheetId = await getSheetId();
    const headers = await getHeaders();
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
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
    if (res.status === 401) {
      handleSheetsUnauthorized();
      return false;
    }
    return true;
  };

  const insertItem = async (afterIndex: number | undefined, rowPatch: any[]) => {
    const maxIndex = data ? Math.max(0, ...data.slice(1).map((item: any) => item.index_ || 0)) : 0;
    const newItem = { index_: maxIndex + 1, id: crypto.randomUUID(), row: rowPatch };
    setData((prev) => prev ? [...prev, newItem] : [newItem]);

    const headers = await getHeaders();
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sprints!A:D:append?valueInputOption=USER_ENTERED`, {
      method: "POST",
      headers,
      body: JSON.stringify({ values: [rowPatch] })
    });
    if (res.status === 401) handleSheetsUnauthorized();
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
      return newData.map((item, idx) => idx === 0 ? item : { ...item, index_: idx });
    });

    const sheetId = await getSheetId();
    const headers = await getHeaders();
    const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
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
    if (res.status === 401) handleSheetsUnauthorized();
  };

  if (authStatus === "loading") {
    return <LoadingCard title="Opening Sprint Planner" description="Restoring your session..." />;
  }

  if (authStatus === "unauthenticated") {
    if (!isFirebaseConfigured) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full text-center ui-fade-up">
            <h1 className="text-2xl font-black text-slate-800 mb-4">Firebase Setup Required</h1>
            <p className="text-sm text-slate-600 mb-6 text-left">
              To deploy this app and use Google Authentication on your own domain, you must configure a Firebase project.
            </p>
            <div className="text-left text-sm text-slate-700 space-y-4 mb-6">
              <p>1. Create a Firebase project at <strong>console.firebase.google.com</strong></p>
              <p>2. Enable <strong>Google Authentication</strong> in the Firebase Console.</p>
              <p>3. Add your deployment domain (e.g. <code>miickiie.github.io</code>) to the <strong>Authorized domains</strong> list in Authentication settings.</p>
              <p>4. Add your Firebase config values as GitHub Secrets or environment variables (e.g. <code>VITE_FIREBASE_API_KEY</code>).</p>
            </div>
            <p className="text-xs text-slate-500">
              Note: This is required because third-party deployment requires your own Firebase project for authentication.
            </p>
          </div>
        </div>
      );
    }

    if (!isGoogleClientConfigured) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-lg w-full text-center ui-fade-up">
            <h1 className="text-2xl font-black text-slate-800 mb-4">Google OAuth Setup Required</h1>
            <p className="text-sm text-slate-600 mb-6 text-left">
              Add your Google OAuth web client ID as <code>VITE_GOOGLE_CLIENT_ID</code> so the app can request Google Sheets access through Google Identity Services.
            </p>
            <p className="text-xs text-slate-500 text-left">
              Firebase restores the signed-in user, but Google Sheets API calls need a separate OAuth access token.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full text-center ui-fade-up">
          <h1 className="text-2xl font-black text-slate-800 mb-2">Sprint Planner</h1>
          <p className="text-sm text-slate-500 mb-6">Sign in with Google to sync your sprints to Google Sheets.</p>
          <button 
            onClick={handleLogin}
            disabled={isLoggingIn}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl ui-interactive ui-focus-ring flex justify-center items-center gap-2"
          >
            {isLoggingIn ? "Signing in..." : "Continue with Google"}
          </button>
        </div>
      </div>
    );
  }

  if (authStatus === "authenticated" && sheetsAccessStatus === "checking") {
    return <LoadingCard title="Restoring Google Sheets" description="Checking whether Google can refresh Sheets access silently..." />;
  }

  if (authStatus === "authenticated" && sheetsAccessStatus === "missing") {
    if (!isGoogleClientConfigured) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center ui-fade-up">
            <h1 className="text-2xl font-black text-slate-800 mb-2">Google OAuth Setup Required</h1>
            <p className="text-sm text-slate-500 mb-6">
              You are signed in{user?.email ? ` as ${user.email}` : ""}, but Sheets access requires <code>VITE_GOOGLE_CLIENT_ID</code>.
            </p>
            <button onClick={handleLogout} className="text-sm text-red-500 hover:underline ui-focus-ring rounded-md">Sign out</button>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center ui-fade-up">
          <h1 className="text-2xl font-black text-slate-800 mb-2">Reconnect Google Sheets</h1>
          <p className="text-sm text-slate-500 mb-6">
            You are still signed in{user?.email ? ` as ${user.email}` : ""}. Reconnect Google Sheets access to load or edit your planner.
          </p>
          <button
            onClick={handleReconnectSheets}
            disabled={isConnectingSheets}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl ui-interactive ui-focus-ring flex justify-center items-center gap-2"
          >
            {isConnectingSheets ? "Reconnecting..." : "Reconnect Google Sheets"}
          </button>
          <button onClick={handleLogout} className="mt-6 text-sm text-red-500 hover:underline ui-focus-ring rounded-md">Sign out</button>
        </div>
      </div>
    );
  }

  if (!spreadsheetId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center ui-fade-up">
          <h2 className="text-xl font-bold mb-4">Setup Your Planner</h2>
          <p className="text-sm text-slate-500 mb-6">We'll create a new Google Sheet to store your sprint data.</p>
          <div className="flex gap-4 flex-col">
            <button 
              onClick={createSheet}
              disabled={loadingSheet}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold py-3 px-4 rounded-xl ui-interactive ui-focus-ring"
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
                className="w-full px-4 py-2 border rounded-lg mb-2 ui-focus-ring"
              />
              <button type="submit" className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-4 rounded-xl ui-interactive ui-focus-ring">
                Connect Existing Sheet
              </button>
            </form>
          </div>
          <button onClick={handleLogout} className="mt-8 text-sm text-red-500 hover:underline ui-focus-ring rounded-md">Logout</button>
        </div>
      </div>
    );
  }

  if (!data) {
    return <LoadingCard title="Loading Sheet" description="Preparing the planner timeline..." />;
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
        className="fixed bottom-4 left-4 bg-white/80 backdrop-blur px-3 py-1.5 rounded-lg border text-xs font-bold text-slate-500 hover:text-slate-800 z-[999] shadow-sm ui-interactive ui-focus-ring"
      >
        Sign Out ({user?.email})
      </button>
    </>
  );
}
