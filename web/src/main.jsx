import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { isCapacitor } from './lib/platform'

// The web app runs only inside the iOS app (2026-11-04). A browser — including an in-app browser,
// which the server cannot tell from the app — goes to the App Store page. Email links for password
// reset and email confirmation still open here. Local development and tests are not gated.
const EMAIL_LINK_PAGES = /^\/my\/(reset-password|verify-email)\/?$/
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$/
const browserVisit = !isCapacitor()
  && !LOCAL_HOST.test(window.location.hostname)
  && !EMAIL_LINK_PAGES.test(window.location.pathname)

if (browserVisit) {
  window.location.replace('/get-app')
} else {
  ReactDOM.createRoot(document.getElementById('root')).render(<App />)
}


// Register service worker for PWA (skip inside Capacitor native)
if (!browserVisit && 'serviceWorker' in navigator && !isCapacitor()) {
  navigator.serviceWorker.register('/sw.js')
}
