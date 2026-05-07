import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css' // <-- IMPORTANT: Ensure this file exists and contains Tailwind directives

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
