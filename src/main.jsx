import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { GoogleOAuthProvider } from '@react-oauth/google'
import './global.css'
import App from './App.jsx'

// Promise.try 폴리필 — pdf.js가 사용하는 ES2025 API.
// Electron 30(Chromium 118)에는 없어 PDF 뷰어가 무한 로딩됨.
// (fake worker가 메인 컨텍스트에서 돌므로 여기 폴리필이 적용됨)
if (typeof Promise.try !== 'function') {
  Promise.try = function (fn, ...args) {
    return new Promise((resolve) => resolve(fn(...args)));
  };
}

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </StrictMode>,
)
