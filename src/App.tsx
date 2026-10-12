import { Route, Routes } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import AddScreen from './features/add/AddScreen'
import BackupScreen from './features/backup/BackupScreen'
import CaptureScreen from './features/capture/CaptureScreen'
import DraftsScreen from './features/drafts/DraftsScreen'
import DroppedScreen from './features/dropped/DroppedScreen'
import Home from './features/home/Home'
import ItemDetail from './features/item/ItemDetail'
import QuotesScreen from './features/quotes/QuotesScreen'
import { IsbnQueueRunner } from './features/scan/IsbnQueueRunner'
import ScanScreen from './features/scan/ScanScreen'
import StatsScreen from './features/stats/StatsScreen'

export default function App() {
  return (
    <ToastProvider>
      <IsbnQueueRunner />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/item/:id" element={<ItemDetail />} />
        <Route path="/add" element={<AddScreen />} />
        <Route path="/match/:id" element={<AddScreen />} />
        <Route path="/scan" element={<ScanScreen />} />
        <Route path="/backup" element={<BackupScreen />} />
        <Route path="/quotes" element={<QuotesScreen />} />
        <Route path="/stats" element={<StatsScreen />} />
        <Route path="/capture" element={<CaptureScreen />} />
        <Route path="/drafts" element={<DraftsScreen />} />
        <Route path="/dropped" element={<DroppedScreen />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </ToastProvider>
  )
}
