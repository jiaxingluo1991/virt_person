import { contextBridge, ipcRenderer } from 'electron'

// 从 additionalArguments 读取 resourcesPath，在沙箱下可靠
const resourcesPathArg = process.argv.find(a => a.startsWith('--resources-path='))
const resourcesPath = resourcesPathArg ? resourcesPathArg.slice('--resources-path='.length) : ''

contextBridge.exposeInMainWorld('electronAPI', {
  resourcesPath,
  sendAudio: (buffer: ArrayBuffer) => ipcRenderer.send('audio:data', buffer),
  clearDialog: () => ipcRenderer.send('dialog:clear'),
  onTtsAudio: (cb: (buf: ArrayBuffer) => void) =>
    ipcRenderer.on('tts:audio', (_e, buf) => cb(buf)),
  onSpeakStart: (cb: () => void) =>
    ipcRenderer.on('speak:start', cb),
  onSpeakEnd: (cb: () => void) =>
    ipcRenderer.on('speak:end', cb),
  onDialogError: (cb: (msg: string) => void) =>
    ipcRenderer.on('dialog:error', (_e, msg) => cb(msg)),
  moveWindow: (dx: number, dy: number) => ipcRenderer.send('window:move', dx, dy)
})
