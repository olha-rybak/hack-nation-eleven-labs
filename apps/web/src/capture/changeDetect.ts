// Cheap client-side change detection, so unchanged frames never cost a network round trip.
// A frame is reduced to a small greyscale thumbnail and compared with the last frame that was
// actually sent (not the previous sample): slow typing accumulates until it is worth sending,
// while a blinking caret, which flips back and forth, never does.

export const THUMB_WIDTH = 160
const CELL_DELTA = 16

export interface Thumb {
  width: number
  height: number
  luma: Uint8Array
}

export function toThumb(rgba: Uint8ClampedArray, width: number, height: number): Thumb {
  const luma = new Uint8Array(width * height)
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    luma[i] = (rgba[p] * 299 + rgba[p + 1] * 587 + rgba[p + 2] * 114) / 1000
  }
  return { width, height, luma }
}

export function changedCells(a: Thumb, b: Thumb): number {
  if (a.width !== b.width || a.height !== b.height) return Number.POSITIVE_INFINITY
  let count = 0
  for (let i = 0; i < a.luma.length; i++) {
    if (Math.abs(a.luma[i] - b.luma[i]) > CELL_DELTA) count++
  }
  return count
}

export function hasChanged(lastSent: Thumb | null, next: Thumb, minCells: number): boolean {
  return lastSent === null || changedCells(lastSent, next) >= minCells
}
