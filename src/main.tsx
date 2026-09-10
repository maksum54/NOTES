import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Elemen #root tidak ditemukan')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Service worker: hanya di production, supaya dev server tidak ikut ter-cache.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err: unknown) => console.warn('[sw] gagal register', err))
  })
}
