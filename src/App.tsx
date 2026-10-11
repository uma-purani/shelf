import { Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import AddScreen from './features/add/AddScreen'
import Home from './features/home/Home'

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/add" element={<AddScreen />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </ToastProvider>
  )
}
