import { useEffect, useState } from 'react'
import { useT } from '../hooks'

const KEYS = [
  'assistant.think.1',
  'assistant.think.2',
  'assistant.think.3',
  'assistant.think.4',
  'assistant.think.5'
]

const INTERVAL = 2400

export function ThinkingText({ active = true }: { active?: boolean }) {
  const t = useT()
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!active) {
      setIndex(0)
      return
    }
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % KEYS.length)
    }, INTERVAL)
    return () => window.clearInterval(timer)
  }, [active])

  return (
    <span className="thinking-text" key={index}>
      {t(KEYS[index])}
    </span>
  )
}
