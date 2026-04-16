import { execFile } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import ffmpegPath from 'ffmpeg-static'

const execFileAsync = promisify(execFile)

export async function convertToWav(inputBuffer: Buffer): Promise<Buffer> {
  const tmpIn = join(tmpdir(), `vp-in-${Date.now()}.webm`)
  const tmpOut = join(tmpdir(), `vp-out-${Date.now()}.wav`)

  try {
    writeFileSync(tmpIn, inputBuffer)
    await execFileAsync(ffmpegPath!, [
      '-y', '-i', tmpIn,
      '-ar', '16000',
      '-ac', '1',
      '-f', 'wav',
      tmpOut
    ])
    return readFileSync(tmpOut)
  } finally {
    try { unlinkSync(tmpIn) } catch {}
    try { unlinkSync(tmpOut) } catch {}
  }
}
