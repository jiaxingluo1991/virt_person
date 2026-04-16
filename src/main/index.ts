import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { loadConfig } from './config'
import { createAdapters } from './adapters/factory'
import { DialogManager } from './dialog'
import { registerIpcHandlers } from './ipc-handlers'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    frame: false,
    transparent: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: join(__dirname, 'preload.js')
    }
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  const configPath = join(
    process.env.NODE_ENV === 'development' ? process.cwd() : process.resourcesPath,
    'config.json'
  )
  const cfg = loadConfig(configPath)
  const { stt, tts, llm } = createAdapters(cfg)
  const dialog = new DialogManager(stt, tts, llm)
  registerIpcHandlers(dialog)
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
