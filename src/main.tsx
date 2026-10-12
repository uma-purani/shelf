import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { requestPersistence } from './data/db'
import { startHealthMonitor } from './services/healthMonitor'

void requestPersistence()
void startHealthMonitor()
// The previous covers cache held opaque responses that Chrome counts at several MB each; covers now
// use cover-images-v2 with real-size entries. The old cache is just images, so drop it.
void globalThis.caches?.delete('cover-images')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
