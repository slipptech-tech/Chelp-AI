import { Cpu, Plug } from 'lucide-react'
import type { ProviderKind } from '@shared/types'
import deepseekLogo from '../assets/providers/deepseek.svg'
import openaiLogo from '../assets/providers/openai.svg'
import openrouterLogo from '../assets/providers/openrouter.svg'
import geminiLogo from '../assets/providers/googlegemini.svg'

const LOGOS: Partial<Record<ProviderKind, string>> = {
  deepseek: deepseekLogo,
  openai: openaiLogo,
  openrouter: openrouterLogo,
  gemini: geminiLogo
}

export function ProviderLogo({
  kind,
  size = 'normal'
}: {
  kind: ProviderKind
  size?: 'normal' | 'large'
}) {
  const logo = LOGOS[kind]
  return (
    <span
      className={`provider-avatar kind-${kind}${size === 'large' ? ' is-large' : ''}`}
      aria-hidden="true"
    >
      {logo ? (
        <img className="provider-logo" src={logo} alt="" draggable={false} />
      ) : kind === 'local' ? (
        <Cpu className="provider-logo-fallback" strokeWidth={1.8} />
      ) : (
        <Plug className="provider-logo-fallback" strokeWidth={2} />
      )}
    </span>
  )
}
