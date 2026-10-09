import { ToastProvider } from './components/Toast'
import Home from './features/home/Home'

export default function App() {
  return (
    <ToastProvider>
      <Home />
    </ToastProvider>
  )
}
