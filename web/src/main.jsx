import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { isCapacitor } from './lib/platform'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)


// Register service worker for PWA (skip inside Telegram WebApp and Capacitor native)
if ('serviceWorker' in navigator && !window.Telegram?.WebApp?.initData && !isCapacitor()) {
  navigator.serviceWorker.register('/sw.js')
}
