const { app, BrowserWindow, shell } = require("electron");
const { spawn } = require("node:child_process");
const net = require("node:net");
const path = require("node:path");

const apiPort = Number(process.env.PORT ?? 8787);
const webDevUrl = process.env.SLEEPER_AI_WEB_URL ?? "http://127.0.0.1:5173";
const apiUrl = `http://127.0.0.1:${apiPort}`;

let apiProcess = null;
let webProcess = null;
let mainWindow = null;

app.setName("Sleeper AI Team Manager");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  await ensureApiServer();
  await createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});

app.on("before-quit", () => {
  if (apiProcess && !apiProcess.killed) {
    apiProcess.kill();
  }
  if (webProcess && !webProcess.killed) {
    webProcess.kill();
  }
});

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 1040,
    minHeight: 720,
    backgroundColor: "#f7f6f1",
    title: "Sleeper AI Team Manager",
    icon: getAppAssetPath("assets", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (!app.isPackaged) {
    await ensureWebServer();
    await waitForHttp(webDevUrl, 30000);
    await mainWindow.loadURL(webDevUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await mainWindow.loadFile(getAppAssetPath("dist", "web", "index.html"));
}

async function ensureApiServer() {
  if (await isPortOpen(apiPort)) {
    return;
  }

  if (app.isPackaged) {
    apiProcess = spawn(process.execPath, [getUnpackedAssetPath("dist", "api-server.mjs")], {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        PORT: String(apiPort),
        SLEEPER_AI_DATA_DIR: path.join(app.getPath("userData"), "data"),
      },
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    apiProcess = spawn(npmCommand, ["run", "dev", "-w", "@sleeper-ai/api"], {
      cwd: path.resolve(__dirname, "..", "..", ".."),
      env: {
        ...process.env,
        PORT: String(apiPort),
        SLEEPER_AI_DATA_DIR: path.join(app.getPath("userData"), "data"),
        FORCE_COLOR: "1",
      },
      stdio: "inherit",
      shell: process.platform === "win32",
    });
  }

  apiProcess.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Sleeper API exited with code ${code}`);
    }
  });

  await waitForHttp(`${apiUrl}/health`, 30000);
}

async function ensureWebServer() {
  const isRunning = await waitForHttp(webDevUrl, 1200)
    .then(() => true)
    .catch(() => false);
  if (isRunning) {
    return;
  }

  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  webProcess = spawn(npmCommand, ["run", "dev", "-w", "@sleeper-ai/web"], {
    cwd: path.resolve(__dirname, "..", "..", ".."),
    env: {
      ...process.env,
      FORCE_COLOR: "1",
    },
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  webProcess.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`Sleeper web dev server exited with code ${code}`);
    }
  });
}

function getAppAssetPath(...segments) {
  return path.join(__dirname, "..", ...segments);
}

function getUnpackedAssetPath(...segments) {
  if (!app.isPackaged) {
    return getAppAssetPath(...segments);
  }
  return path.join(process.resourcesPath, "app.asar.unpacked", ...segments);
}

function isPortOpen(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function waitForHttp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok || response.status < 500) {
        return;
      }
    } catch {
      // Retry until timeout.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
