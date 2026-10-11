import { Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import AddScreen from './features/add/AddScreen'
import BackupScreen from './features/backup/BackupScreen'
import CaptureScreen from './features/capture/CaptureScreen'
import DraftsScreen from './features/drafts/DraftsScreen'
import Home from './features/home/Home'
import ItemDetail from './features/item/ItemDetail'
import QuotesScreen from './features/quotes/QuotesScreen'
import StatsScreen from './features/stats/StatsScreen'

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/item/:id" element={<ItemDetail />} />
        <Route path="/add" element={<AddScreen />} />
        <Route path="/match/:id" element={<AddScreen />} />
        <Route path="/backup" element={<BackupScreen />} />
        <Route path="/quotes" element={<QuotesScreen />} />
        <Route path="/stats" element={<StatsScreen />} />
        <Route path="/capture" element={<CaptureScreen />} />
        <Route path="/drafts" element={<DraftsScreen />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </ToastProvider>
  )
}
