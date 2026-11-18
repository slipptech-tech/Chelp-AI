import { Children, isValidElement, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import { Check, Copy } from 'lucide-react'
import { useT } from '../hooks'

function CodeBlock({ children }: { children?: ReactNode }) {
  const t = useT()
  const preRef = useRef<HTMLPreElement>(null)
  const [copied, setCopied] = useState(false)

  const child = Children.toArray(children)[0]
  const className =
    isValidElement<{ className?: string }>(child) && child.props.className
      ? child.props.className
      : ''
  const language = /language-([\w-]+)/.exec(className)?.[1] ?? 'code'

  const copy = (): void => {
    const text = preRef.current?.innerText ?? ''
    window.chelp.clipboard.write(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="code-block">
      <div className="code-head">
        <span className="code-lang">{language}</span>
        <button type="button" className="code-copy" onClick={copy}>
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? t('common.copied') : t('common.copy')}</span>
        </button>
      </div>
      <pre ref={preRef}>{children}</pre>
    </div>
  )
}

export function Markdown({ content, compact }: { content: string; compact?: boolean }) {
  return (
    <div className={`md ${compact ? 'md-compact' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          a: ({ href, children }) => (
            <a
              href={href}
              onClick={(event) => {
                event.preventDefault()
                if (href && /^https?:\/\//i.test(href)) window.chelp.app.openExternal(href)
              }}
            >
              {children}
            </a>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
