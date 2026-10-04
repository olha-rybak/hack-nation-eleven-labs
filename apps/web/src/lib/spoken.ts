// The voice agent may write delivery cues for its speech engine, like "[Warmly] Got it." They are
// how it sounds, not what it said, so they are left out wherever its words are shown or read.
const CUE = /\[[^\]\n]{1,32}\]\s*/g

export function spoken(text: string): string {
  return text.replace(CUE, '').trim()
}
