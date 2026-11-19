import type { ClipboardEvent } from 'react'

export async function clipboardImage(
  event: ClipboardEvent<HTMLTextAreaElement>
): Promise<string | null> {
  const data = event.clipboardData
  if (!data) return null
  if (data.getData('text/plain').trim()) return null
  const items = Array.from(data.items ?? [])
  const item = items.find((entry) => entry.kind === 'file' && entry.type.startsWith('image/'))
  const file =
    item?.getAsFile() ?? Array.from(data.files ?? []).find((entry) => entry.type.startsWith('image/'))
  if (!file) return null
  event.preventDefault()
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'))
    reader.readAsDataURL(file)
  })
}
