import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

// Note: no React.StrictMode — the canvas game engines use imperative effects
// and double-mounting them in dev would double-run the RAF loops.
createRoot(document.getElementById('root')).render(<App />)
