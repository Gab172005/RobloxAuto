import { app, BrowserWindow, Menu, shell } from 'electron';
import http from 'node:http';
import path from 'node:path';

const DEV_URL = process.env.ROFORGE_UI_URL || 'http://localhost:5173';
const PROD_URL = process.env.ROFORGE_SERVER_URL || 'http://127.0.0.1:4310';

function probeUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForStudioUrl(timeoutMs = 30_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeUrl(DEV_URL)) return DEV_URL;
    if (await probeUrl(`${PROD_URL}/api/health`)) return PROD_URL;
    await new Promise((r) => setTimeout(r, 500));
  }
  return DEV_URL;
}

let mainWindow: BrowserWindow | null = null;

async function createMainWindow(): Promise<void> {
  const targetUrl = await waitForStudioUrl();

  mainWindow = new BrowserWindow({
    width: 1460,
    height: 920,
    minWidth: 1120,
    minHeight: 700,
    title: 'RoForge Studio — Multi-Agent Roblox Game Factory',
    backgroundColor: '#090b12',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Open external links (Roblox Creator Hub, Rojo docs, etc.) in the default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  await mainWindow.loadURL(targetUrl);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  void createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

