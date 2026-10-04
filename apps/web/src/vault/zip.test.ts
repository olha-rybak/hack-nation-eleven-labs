import { describe, expect, it } from 'vitest'
import { crc32, makeZip } from './zip'

describe('makeZip', () => {
  const zip = makeZip([
    { name: 'a/one.md', data: 'hello' },
    { name: 'two.md', data: 'wörld ·' },
    { name: 'three.md', data: '' },
  ])
  const view = new DataView(zip.buffer)

  it('starts with a local file header', () => {
    expect([...zip.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
  })

  it('ends with an end-of-central-directory record for every entry', () => {
    const eocd = zip.length - 22
    expect(view.getUint32(eocd, true)).toBe(0x06054b50)
    expect(view.getUint16(eocd + 8, true)).toBe(3)
    expect(view.getUint16(eocd + 10, true)).toBe(3)
    const centralStart = view.getUint32(eocd + 16, true)
    expect(view.getUint32(centralStart, true)).toBe(0x02014b50)
    expect(view.getUint32(eocd + 12, true)).toBe(eocd - centralStart)
  })

  it('sets the UTF-8 flag', () => {
    expect(view.getUint16(6, true) & 0x0800).toBe(0x0800)
  })

  it('computes standard CRC32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})
