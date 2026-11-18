import type { ChelpAPI } from '@shared/types'

export interface OverlayContext {
  image: string
  imageWidth: number
  imageHeight: number
  cssWidth: number
  cssHeight: number
  label: string
}

export interface OverlayAPI {
  context: () => Promise<OverlayContext | null>
  complete: (rect: { x: number; y: number; width: number; height: number } | null) => void
  cancel: () => void
}

declare global {
  interface Window {
    chelp: ChelpAPI
    chelpOverlay: OverlayAPI
  }
}

export {}
