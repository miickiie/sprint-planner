import express from "express";
import { google } from "googleapis";
import path from "path";
import { createServer as createViteServer } from "vite";

const app = express();
const PORT = 3000;

app.use(express.json());

// Check auth middleware
const requireAuth = (req: any, res: any, next: any) => {
  const token = req.headers.authorization?.split("Bearer ")[1];
  if (!token) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  req.token = token;
  next();
};

function getOAuthClient(token: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: token });
  return oauth2Client;
}

// Create a new sheet
app.post("/api/sheets/create", requireAuth, async (req: any, res) => {
  try {
    const oauth2Client = getOAuthClient(req.token);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    const response = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: "Sprint Planner - " + new Date().toISOString().split('T')[0]
        },
        sheets: [
          {
            properties: { title: 'Sprints' }
          }
        ]
      }
    });
    
    const spreadsheetId = response.data.spreadsheetId;
    
    // Add headers
    await sheets.spreadsheets.values.update({
      spreadsheetId: spreadsheetId!,
      range: 'Sprints!A1:D1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['Task Name', 'Start Date', 'Duration (Days)', 'Status']]
      }
    });

    res.json({ spreadsheetId });
  } catch (error: any) {
    console.error("Create sheet error", error);
    res.status(500).json({ error: error.message });
  }
});

// Fetch data from sheet
app.get("/api/sheets/:id/data", requireAuth, async (req: any, res) => {
  try {
    const oauth2Client = getOAuthClient(req.token);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: req.params.id,
      range: 'Sprints!A:D',
    });
    
    const rows = response.data.values || [];
    
    // Convert to the format expected by the frontend
    const data = rows.map((row, index) => {
      if (index === 0) return { row }; // Header
      return { index_: index, row };
    });
    
    res.json({ data });
  } catch (error: any) {
    console.error("Get data error", error);
    res.status(500).json({ error: error.message });
  }
});

// Update an item in the sheet
app.put("/api/sheets/:id/rows/:rowIndex", requireAuth, async (req: any, res) => {
  try {
    const oauth2Client = getOAuthClient(req.token);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    const rowIndex = parseInt(req.params.rowIndex) + 1; // 0-based index to 1-based row number
    const rowPatch = req.body.rowPatch;
    
    const getResponse = await sheets.spreadsheets.values.get({
      spreadsheetId: req.params.id,
      range: `Sprints!A${rowIndex}:D${rowIndex}`,
    });
    
    const currentRow = getResponse.data.values ? getResponse.data.values[0] : ['', '', '', ''];
    const newRow = [...currentRow];
    
    for (let i = 0; i < rowPatch.length; i++) {
      if (rowPatch[i] !== undefined) {
        newRow[i] = rowPatch[i];
      }
    }
    
    await sheets.spreadsheets.values.update({
      spreadsheetId: req.params.id,
      range: `Sprints!A${rowIndex}:D${rowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [newRow]
      }
    });
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("Update error", error);
    res.status(500).json({ error: error.message });
  }
});

// Insert a new item
app.post("/api/sheets/:id/rows", requireAuth, async (req: any, res) => {
  try {
    const oauth2Client = getOAuthClient(req.token);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    const rowPatch = req.body.rowPatch;
    
    await sheets.spreadsheets.values.append({
      spreadsheetId: req.params.id,
      range: 'Sprints!A:D',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [rowPatch]
      }
    });
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("Insert error", error);
    res.status(500).json({ error: error.message });
  }
});

// Delete an item
app.delete("/api/sheets/:id/rows/:rowIndex", requireAuth, async (req: any, res) => {
  try {
    const oauth2Client = getOAuthClient(req.token);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    const rowIndex = parseInt(req.params.rowIndex);
    
    const sheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: req.params.id
    });
    const sheetId = sheetInfo.data.sheets?.find(s => s.properties?.title === 'Sprints')?.properties?.sheetId || 0;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: req.params.id,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: rowIndex,
                endIndex: rowIndex + 1
              }
            }
          }
        ]
      }
    });
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("Delete error", error);
    res.status(500).json({ error: error.message });
  }
});

// Move an item
app.post("/api/sheets/:id/rows/move", requireAuth, async (req: any, res) => {
  try {
    const oauth2Client = getOAuthClient(req.token);
    const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
    
    const { fromIndex, toIndex } = req.body;
    
    const sheetInfo = await sheets.spreadsheets.get({
      spreadsheetId: req.params.id
    });
    const sheetId = sheetInfo.data.sheets?.find(s => s.properties?.title === 'Sprints')?.properties?.sheetId || 0;

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: req.params.id,
      requestBody: {
        requests: [
          {
            moveDimension: {
              source: {
                sheetId: sheetId,
                dimension: 'ROWS',
                startIndex: fromIndex,
                endIndex: fromIndex + 1
              },
              destinationIndex: toIndex > fromIndex ? toIndex + 1 : toIndex
            }
          }
        ]
      }
    });
    
    res.json({ success: true });
  } catch (error: any) {
    console.error("Move error", error);
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
