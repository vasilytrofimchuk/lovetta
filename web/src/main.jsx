import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)

// Register service worker for PWA (skip inside Telegram WebApp)
if ('serviceWorker' in navigator && !window.Telegram?.WebApp?.initData) {
  navigator.serviceWorker.register('/sw.js')
}
