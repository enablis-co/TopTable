import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
// Self-hosted, not a Google Fonts <link>: KB-1 says everything is local, and a CDN font
// is the one thing that can fail on a venue's wifi and take the whole brand down with it.
import '@fontsource/ibm-plex-sans/400.css'
import '@fontsource/ibm-plex-sans/500.css'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('index.html is missing the #root element')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
