import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { loadConfig } from './config'
import { createAdapters } from './adapters/factory'
import { DialogManager } from './dialog'
import { registerIpcHandlers } from './ipc-handlers'

function createWindow(resourcesPath: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js'),
      additionalArguments: [`--resources-path=${resourcesPath}`]
    }
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
    win.webContents.openDevTools()
  }

  return win
}

app.whenReady().then(() => {
  const isPackaged = app.isPackaged
  const configPath = isPackaged
    ? join(process.resourcesPath, 'config.json')
    : join(process.cwd(), 'config.json')

  const resourcesPath = isPackaged
    ? process.resourcesPath
    : join(process.cwd(), 'resources')

  const cfg = loadConfig(configPath)
  const { stt, tts, llm } = createAdapters(cfg)
  const dialog = new DialogManager(stt, tts, llm)
  registerIpcHandlers(dialog)
  createWindow(resourcesPath)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
