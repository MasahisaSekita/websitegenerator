import './theme.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={window.WEBSITE_BASE || "/"}>
      <App />
    </BrowserRouter>
  </StrictMode>
)
