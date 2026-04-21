const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const mime = require("mime-types");
const XLSX = require("xlsx");

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 920,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#081226",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (!BrowserWindow.getAllWindows().length) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

function parseMediaUrls(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

async function resolveMediaFile(filePath) {
  try {
    const normalizedPath = String(filePath || "").trim();

    if (!normalizedPath) {
      return null;
    }

    const stat = await fs.stat(normalizedPath);

    if (!stat.isFile()) {
      return null;
    }

    const fileBuffer = await fs.readFile(normalizedPath);
    const mimeType = mime.lookup(normalizedPath) || "application/octet-stream";

    return {
      originalPath: normalizedPath,
      filename: path.basename(normalizedPath),
      mimeType,
      size: stat.size,
      buffer: {
        type: "Buffer",
        data: Array.from(fileBuffer),
      },
    };
  } catch (error) {
    return null;
  }
}

function normalizeRowObject(row) {
  const result = {};

  Object.entries(row || {}).forEach(([key, value]) => {
    const normalizedKey = String(key || "").trim();
    if (!normalizedKey) {
      return;
    }

    result[normalizedKey] = value == null ? "" : String(value);
  });

  return result;
}

async function mapRowToPost(row, rowIndex) {
  const data = normalizeRowObject(row);
  const mediaPaths = parseMediaUrls(data.media_urls);

  const resolvedMediaResults = await Promise.all(
    mediaPaths.map((mediaPath) => resolveMediaFile(mediaPath)),
  );

  const mediaFiles = resolvedMediaResults.filter(Boolean);
  const missingMedia = mediaPaths.filter(
    (mediaPath, index) => !resolvedMediaResults[index],
  );

  return {
    rowNumber: rowIndex + 2,
    data,
    mediaFiles,
    missingMedia,
  };
}

async function parseSpreadsheetFile(filePath) {
  const workbook = XLSX.readFile(filePath, {
    cellDates: false,
    raw: false,
  });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    return { posts: [] };
  }

  const sheet = workbook.Sheets[firstSheetName];

  const rows = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    raw: false,
  });

  const posts = await Promise.all(
    rows.map((row, index) => mapRowToPost(row, index)),
  );

  return { posts };
}

function buildMultipartPreview(post) {
  const previewEntries = [];

  Object.entries(post?.data || {}).forEach(([key, value]) => {
    previewEntries.push({
      key,
      value: String(value ?? ""),
      type: "field",
    });
  });

  (post?.mediaFiles || []).forEach((file) => {
    previewEntries.push({
      key: "media",
      value: `${file.filename} (${file.mimeType}, ${file.size} bytes)`,
      type: "file",
    });
  });

  return {
    note: 'FormData prepared as: all spreadsheet columns as fields, files from media_urls appended under key "media".',
    previewEntries,
  };
}

async function uploadPosts({ posts, endpoint }) {
  const results = [];

  for (const post of posts || []) {
    const formData = new FormData();

    Object.entries(post?.data || {}).forEach(([key, value]) => {
      formData.append(key, String(value ?? ""));
    });

    for (const file of post?.mediaFiles || []) {
      let uint8 = null;

      if (file?.buffer?.type === "Buffer" && Array.isArray(file.buffer.data)) {
        uint8 = new Uint8Array(file.buffer.data);
      } else if (Array.isArray(file?.buffer)) {
        uint8 = new Uint8Array(file.buffer);
      }

      if (!uint8) {
        continue;
      }

      const blob = new Blob([uint8], {
        type: file.mimeType || "application/octet-stream",
      });

      formData.append("media", blob, file.filename);
    }

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: formData,
      });

      const bodyText = await response.text();

      results.push({
        rowNumber: post.rowNumber,
        ok: response.ok,
        status: response.status,
        body: bodyText,
      });
    } catch (error) {
      results.push({
        rowNumber: post.rowNumber,
        ok: false,
        status: 0,
        body: error instanceof Error ? error.message : "Upload failed",
      });
    }
  }

  return results;
}

ipcMain.handle("pick-spreadsheet", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [
      {
        name: "Spreadsheet files",
        extensions: ["xlsx", "xls", "csv"],
      },
    ],
  });

  if (result.canceled || !result.filePaths[0]) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("parse-spreadsheet", async (_event, filePath) => {
  return parseSpreadsheetFile(filePath);
});

ipcMain.handle("build-multipart-preview", async (_event, post) => {
  return buildMultipartPreview(post);
});

ipcMain.handle("upload-posts", async (_event, payload) => {
  return uploadPosts(payload);
});
