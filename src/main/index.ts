import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerIpcHandlers } from './ipc-handlers'

function createWindow(resourcesPath: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 300,
    height: 700,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
      additionalArguments: [`--resources-path=${resourcesPath}`]
    }
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  const resourcesPath = app.isPackaged
    ? process.resourcesPath
    : join(process.cwd(), 'resources')

  registerIpcHandlers()
  createWindow(resourcesPath)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
