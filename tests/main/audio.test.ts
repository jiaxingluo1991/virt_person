import { describe, it, expect } from 'vitest'
import { convertToWav } from '../../src/main/audio'

describe('convertToWav', () => {
  it('rejects on invalid audio data', async () => {
    await expect(convertToWav(Buffer.alloc(100))).rejects.toThrow()
  })
})
