import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import '../styles/theme.css'
import '../styles/markdown.css'
import '../styles/float.css'
import { createRoot } from 'react-dom/client'
import { FloatApp } from './FloatApp'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(<FloatApp />)
}
