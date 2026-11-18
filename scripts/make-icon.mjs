import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

// Mirrors src/renderer/src/components/Logo.tsx so the executable, installer,
// tray and in-app mark stay visually identical.
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 32 32">
  <defs>
    <linearGradient id="bg" x1="16" y1="0" x2="16" y2="32" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1c1729"/>
      <stop offset="1" stop-color="#0a0910"/>
    </linearGradient>
    <linearGradient id="arc" x1="6" y1="7" x2="26" y2="27" gradientUnits="userSpaceOnUse">
      <stop stop-color="#c4b5fd"/>
      <stop offset="1" stop-color="#7c5cff"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="9" fill="url(#bg)"/>
  <rect x="0.6" y="0.6" width="30.8" height="30.8" rx="8.4" fill="none" stroke="#ffffff" stroke-opacity="0.09"/>
  <circle cx="16" cy="16" r="7.4" fill="none" stroke="url(#arc)" stroke-width="3.3" stroke-linecap="round" stroke-dasharray="41 6.5" transform="rotate(28 16 16)"/>
  <path d="M16 10.9c.62 3.04 1.46 3.88 4.5 4.5-3.04.62-3.88 1.46-4.5 4.5-.62-3.04-1.46-3.88-4.5-4.5 3.04-.62 3.88-1.46 4.5-4.5Z" fill="#ffffff"/>
</svg>`

const root = path.resolve(import.meta.dirname, '..')
const png = await sharp(Buffer.from(svg)).resize(1024, 1024).png({ compressionLevel: 9 }).toBuffer()

for (const dir of ['resources', 'build']) {
  fs.mkdirSync(path.join(root, dir), { recursive: true })
  fs.writeFileSync(path.join(root, dir, 'icon.png'), png)
}

console.log(`icon written from Logo.tsx: ${png.length} bytes`)
