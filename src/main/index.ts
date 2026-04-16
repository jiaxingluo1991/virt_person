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
  // 开发时：项目根目录；打包后：electron-builder 将 config.json 放到 resourcesPath
  const configPath = app.isPackaged
    ? join(process.resourcesPath, 'config.json')
    : join(process.cwd(), 'config.json')
  const cfg = loadConfig(configPath)
  const { stt, tts, llm } = createAdapters(cfg)
  const dialog = new DialogManager(stt, tts, llm)
  registerIpcHandlers(dialog)
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
