import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  sendAudio: (buffer: ArrayBuffer) => ipcRenderer.send('audio:data', buffer),
  clearDialog: () => ipcRenderer.send('dialog:clear'),
  onTtsAudio: (cb: (buf: ArrayBuffer) => void) =>
    ipcRenderer.on('tts:audio', (_e, buf) => cb(buf)),
  onSpeakStart: (cb: () => void) =>
    ipcRenderer.on('speak:start', cb),
  onSpeakEnd: (cb: () => void) =>
    ipcRenderer.on('speak:end', cb),
  onDialogError: (cb: (msg: string) => void) =>
    ipcRenderer.on('dialog:error', (_e, msg) => cb(msg))
})
