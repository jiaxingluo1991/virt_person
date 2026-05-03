import { contextBridge, ipcRenderer } from 'electron'

const resourcesPathArg = process.argv.find(a => a.startsWith('--resources-path='))
const resourcesPath = resourcesPathArg ? resourcesPathArg.slice('--resources-path='.length) : ''

contextBridge.exposeInMainWorld('electronAPI', {
  resourcesPath,
  moveWindow: (dx: number, dy: number) => ipcRenderer.send('window:move', dx, dy)
})
