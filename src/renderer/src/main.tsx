import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/theme.css'
import './styles/markdown.css'
import './styles/app.css'
import { createRoot } from 'react-dom/client'
import { App } from './App'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(<App />)
}
