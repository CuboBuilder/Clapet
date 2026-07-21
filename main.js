const { app, BrowserWindow, ipcMain, screen, Menu } = require('electron');
const path = require('path');

let mainWindow;

Menu.setApplicationMenu(null);

app.userAgentFallback = app.userAgentFallback
  .replace(/Electron\/\S+\s*/g, '')
  .replace(/\s+Electron\S*/g, '');

app.commandLine.appendSwitch('in-process-gpu');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 187,
    height: 204,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    minWidth: 187,
    minHeight: 204,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.setPosition(300, 300);
  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  let isDragging = false;

  ipcMain.on('start-drag', () => { isDragging = true; });
  ipcMain.on('move-window', (e, { deltaX, deltaY }) => {
    if (!isDragging) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + deltaX, y + deltaY);
  });
  ipcMain.on('end-drag', () => { isDragging = false; });

  ipcMain.handle('get-window-position', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    const [x, y] = mainWindow.getPosition();
    const bounds = mainWindow.getBounds();
    return { x, y, width: bounds.width, height: bounds.height, screenWidth: screen.getPrimaryDisplay().workAreaSize.width };
  });

  ipcMain.on('wander-move', (e, { deltaX, deltaY }) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(x + deltaX, y + deltaY);
  });

  ipcMain.handle('set-window-pos', (e, { x, y }) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    mainWindow.setPosition(Math.round(x), Math.round(y));
  });

  ipcMain.handle('get-screen-info', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    const displays = screen.getAllDisplays();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const d of displays) {
      const b = d.workArea;
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.width);
      maxY = Math.max(maxY, b.y + b.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  });

  ipcMain.handle('resize-window', async (e, { width, height, x, y }) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    await new Promise(resolve => {
      const onResize = () => { mainWindow.removeListener('resize', onResize); resolve(); };
      mainWindow.on('resize', onResize);
      if (x !== undefined && y !== undefined) mainWindow.setBounds({ x, y, width, height });
      else mainWindow.setSize(width, height);
      setTimeout(resolve, 200);
    });
  });

  setInterval(() => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const cursor = screen.getCursorScreenPoint();
        const [winX, winY] = mainWindow.getPosition();
        mainWindow.webContents.send('cursor-move', {
          clientX: cursor.x - winX,
          clientY: cursor.y - winY,
        });
      } catch (e) {}
    }
  }, 16);

  mainWindow.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown') {
      if (input.key === 'F12' ||
          ((input.control || input.meta) && input.shift &&
           (input.key === 'I' || input.key === 'J' || input.key === 'C'))) {
        e.preventDefault();
      }
    }
  });

  mainWindow.webContents.on('devtools-opened', () => {
    mainWindow.webContents.closeDevTools();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
