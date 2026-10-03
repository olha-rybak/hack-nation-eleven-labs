import { describe, expect, it } from 'vitest'
import { changedCells, hasChanged, toThumb, type Thumb } from './changeDetect'

const MIN = 12

const W = 160
const H = 100

function blank(value = 240): Thumb {
  return { width: W, height: H, luma: new Uint8Array(W * H).fill(value) }
}

function paint(base: Thumb, x0: number, y0: number, w: number, h: number, value: number): Thumb {
  const luma = base.luma.slice()
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) luma[y * W + x] = value
  return { ...base, luma }
}

describe('change detection', () => {
  it('always sends the first frame', () => {
    expect(hasChanged(null, blank(), MIN)).toBe(true)
  })

  it('ignores an identical frame', () => {
    expect(hasChanged(blank(), blank(), MIN)).toBe(false)
  })

  it('ignores capture noise on a still screen (measured: 4-6 cells)', () => {
    let noisy = blank()
    for (const [x, y] of [[3, 4], [90, 12], [150, 70], [20, 95], [60, 33], [110, 50]]) noisy = paint(noisy, x, y, 1, 1, 200)
    expect(changedCells(blank(), noisy)).toBe(6)
    expect(hasChanged(blank(), noisy, MIN)).toBe(false)
  })

  it('ignores a caret-sized flicker', () => {
    const caret = paint(blank(), 80, 50, 1, 2, 20)
    expect(changedCells(blank(), caret)).toBe(2)
    expect(hasChanged(blank(), caret, MIN)).toBe(false)
  })

  it('ignores small brightness noise below the cell delta', () => {
    expect(hasChanged(blank(240), blank(230), MIN)).toBe(false)
  })

  it('sends a changed field value', () => {
    const edited = paint(blank(), 40, 30, 12, 2, 30)
    expect(hasChanged(blank(), edited, MIN)).toBe(true)
  })

  it('accumulates slow typing against the last sent frame', () => {
    const lastSent = blank()
    let typed = lastSent
    for (let i = 0; i < 5; i++) typed = paint(typed, 40 + i, 30, 1, 2, 30)
    expect(hasChanged(lastSent, typed, MIN)).toBe(false)
    typed = paint(typed, 45, 30, 1, 2, 30)
    expect(hasChanged(lastSent, typed, MIN)).toBe(true)
  })

  it('treats a resolution change as a change', () => {
    expect(hasChanged(blank(), { width: 120, height: 75, luma: new Uint8Array(120 * 75) }, MIN)).toBe(true)
  })

  it('converts RGBA to luma', () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255])
    expect(Array.from(toThumb(rgba, 4, 1).luma)).toEqual([76, 149, 29, 255])
  })
})
