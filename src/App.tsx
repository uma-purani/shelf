import { Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import AddScreen from './features/add/AddScreen'
import CaptureScreen from './features/capture/CaptureScreen'
import DraftsScreen from './features/drafts/DraftsScreen'
import Home from './features/home/Home'

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/add" element={<AddScreen />} />
        <Route path="/match/:id" element={<AddScreen />} />
        <Route path="/capture" element={<CaptureScreen />} />
        <Route path="/drafts" element={<DraftsScreen />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </ToastProvider>
  )
}
