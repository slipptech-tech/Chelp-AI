import '../styles/theme.css'
import '../styles/overlay.css'
import { createRoot } from 'react-dom/client'
import { Overlay } from './Overlay'

const container = document.getElementById('root')
if (container) {
  createRoot(container).render(<Overlay />)
}
