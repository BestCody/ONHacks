import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

if (import.meta.env.PROD && window.location.hostname === 'onhacks.ca') {
  const beacon = document.createElement('script')
  beacon.type = 'module'
  beacon.src = 'https://static.cloudflareinsights.com/beacon.min.js'
  beacon.dataset.cfBeacon = JSON.stringify({ token: 'd79df64b47584b24978ecc062939b660' })
  document.head.append(beacon)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
