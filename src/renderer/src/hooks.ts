import { useCallback } from 'react'
import type { Settings } from '@shared/types'
import { useApp } from './store'
import { translate } from './i18n'

export function useT(): (key: string, params?: Record<string, string | number>) => string {
  const language = useApp((state) => state.settings.language)
  return useCallback(
    (key: string, params?: Record<string, string | number>) => translate(language, key, params),
    [language]
  )
}

export function useSettings(): Settings {
  return useApp((state) => state.settings)
}
