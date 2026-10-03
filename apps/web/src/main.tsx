import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Shell } from './components/Shell'
import { CapturePage } from './routes/CapturePage'
import { ErpPage } from './routes/ErpPage'
import { MapPage } from './routes/MapPage'
import { NotFound } from './routes/NotFound'
import { TeachPage } from './routes/TeachPage'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/erp" element={<ErpPage />} />
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/capture" replace />} />
          <Route path="capture" element={<CapturePage />} />
          <Route path="map/:sessionId" element={<MapPage />} />
          <Route path="teach/:workMapId" element={<TeachPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
