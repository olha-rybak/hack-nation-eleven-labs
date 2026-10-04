import { useSessionFeed } from '../session/useSessionFeed'
import { Transcript } from './Transcript'

interface Props {
  sessionId: string | null
  title: string
}

export function SidePanel({ sessionId, title }: Props) {
  const lines = useSessionFeed(sessionId).transcript
  return <Transcript title={title} lines={lines} empty="The conversation appears here as it is transcribed." />
}
