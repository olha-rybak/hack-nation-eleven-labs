// Minimal store-only ZIP writer (no compression), enough for a folder of markdown.

export interface ZipFile {
  name: string
  data: string | Uint8Array
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function dosDateTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((Math.max(d.getFullYear(), 1980) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  }
}

export function makeZip(files: ZipFile[], now = new Date()): Uint8Array<ArrayBuffer> {
  const enc = new TextEncoder()
  const entries = files.map((f) => {
    const name = enc.encode(f.name)
    const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data
    return { name, data, crc: crc32(data) }
  })
  const { time, date } = dosDateTime(now)
  const locals = entries.reduce((n, e) => n + 30 + e.name.length + e.data.length, 0)
  const central = entries.reduce((n, e) => n + 46 + e.name.length, 0)
  const out = new Uint8Array(locals + central + 22)
  const view = new DataView(out.buffer)
  let p = 0
  const u16 = (v: number) => {
    view.setUint16(p, v, true)
    p += 2
  }
  const u32 = (v: number) => {
    view.setUint32(p, v, true)
    p += 4
  }
  const offsets: number[] = []

  for (const e of entries) {
    offsets.push(p)
    u32(0x04034b50)
    u16(20)
    u16(0x0800) // bit 11: UTF-8 names
    u16(0) // stored
    u16(time)
    u16(date)
    u32(e.crc)
    u32(e.data.length)
    u32(e.data.length)
    u16(e.name.length)
    u16(0)
    out.set(e.name, p)
    p += e.name.length
    out.set(e.data, p)
    p += e.data.length
  }

  const centralStart = p
  entries.forEach((e, i) => {
    u32(0x02014b50)
    u16(20)
    u16(20)
    u16(0x0800)
    u16(0)
    u16(time)
    u16(date)
    u32(e.crc)
    u32(e.data.length)
    u32(e.data.length)
    u16(e.name.length)
    u16(0)
    u16(0)
    u16(0)
    u16(0)
    u32(0)
    u32(offsets[i]!)
    out.set(e.name, p)
    p += e.name.length
  })

  const centralSize = p - centralStart
  u32(0x06054b50)
  u16(0)
  u16(0)
  u16(entries.length)
  u16(entries.length)
  u32(centralSize)
  u32(centralStart)
  u16(0)
  return out
}
