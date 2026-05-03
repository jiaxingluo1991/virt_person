import { ipcMain, IpcMainEvent, BrowserWindow } from 'electron'

export function registerIpcHandlers(): void {
  ipcMain.on('window:move', (event: IpcMainEvent, dx: number, dy: number) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const [x, y] = win.getPosition()
    win.setPosition(x + dx, y + dy)
  })
}
