import { createRoot } from 'react-dom/client'
import './styles/global.css'
import App from './App'

// No StrictMode: the globe is an imperative three.js instance and the app
// store opens realtime/storage listeners — double-mounting them in dev
// creates duplicate canvases and subscriptions.
createRoot(document.getElementById('root')!).render(<App />)
