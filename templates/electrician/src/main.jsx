import './theme.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

// A single-file export opens from disk, where only hash routes (#/services) resolve.
const singleFile = Boolean(window.WEBSITE_SINGLE_FILE)
const Router = singleFile ? HashRouter : BrowserRouter
const routerProps = singleFile ? {} : { basename: window.WEBSITE_BASE || "/" }

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router {...routerProps}>
      <App />
    </Router>
  </StrictMode>
)
