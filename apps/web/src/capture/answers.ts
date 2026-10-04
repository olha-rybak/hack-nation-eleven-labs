// Turns the live conversation into question/answer pairs for the knowledge graph (T-110):
// after an ask_now, the agent's next line is the question and the expert's next line the answer.
// An agent line that isn't a question (the prompt's "Carry on.") means it chose not to ask.

export interface Answer {
  event_id: string
  question: string
  answer: string
}

export class AnswerPairer {
  private eventId: string | null = null
  private question: string | null = null

  ask(eventId: string): void {
    this.eventId = eventId
    this.question = null
  }

  agent(text: string): void {
    if (this.eventId && !this.question) {
      if (text.trim().endsWith('?')) this.question = text.trim()
      else this.eventId = null
    }
  }

  expert(text: string): Answer | null {
    if (!this.eventId || !this.question) return null
    const answer = { event_id: this.eventId, question: this.question, answer: text.trim() }
    this.eventId = this.question = null
    return answer
  }
}
