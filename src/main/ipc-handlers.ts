import { ipcMain, IpcMainEvent, BrowserWindow } from 'electron'
import { DialogManager } from './dialog'

export function registerIpcHandlers(dialog: DialogManager): void {
  ipcMain.on('audio:data', async (event: IpcMainEvent, data: ArrayBuffer) => {
    try {
      const audioBuffer = await dialog.processAudio(Buffer.from(data))
      event.reply('tts:audio', audioBuffer.buffer.slice(
        audioBuffer.byteOffset,
        audioBuffer.byteOffset + audioBuffer.byteLength
      ))
      event.reply('speak:start')
    } catch (err) {
      console.error('Dialog error:', err)
      event.reply('dialog:error', String(err))
    }
  })

  ipcMain.on('dialog:clear', () => {
    dialog.clearHistory()
  })

  ipcMain.on('window:move', (event: IpcMainEvent, dx: number, dy: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const [x, y] = win.getPosition()
    win.setPosition(x + dx, y + dy)
  })
}
