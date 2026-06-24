import React from 'react'
import ReactDOM from 'react-dom/client'
import { ChThemeProvider } from '@custhome/ui'
import '@custhome/ui/styles.css'
import App from './App'
import './styles.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ChThemeProvider storageKey="pr-viewer-theme">
      <App />
    </ChThemeProvider>
  </React.StrictMode>,
)
