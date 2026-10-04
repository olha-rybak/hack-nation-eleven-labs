import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { Shell } from './components/Shell'
import { ErpApp } from './erp/ErpApp'
import { CapturePage } from './routes/CapturePage'
import { DebriefPage } from './routes/DebriefPage'
import { MapPage } from './routes/MapPage'
import { NotFound } from './routes/NotFound'
import { TeachPage } from './routes/TeachPage'
import { VaultPage } from './routes/VaultPage'
import { ShopApp } from './shop/ShopApp'
import './styles/global.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/erp/*" element={<ErpApp />} />
        <Route path="/shop/*" element={<ShopApp />} />
        <Route element={<Shell />}>
          <Route index element={<Navigate to="/capture" replace />} />
          <Route path="capture" element={<CapturePage />} />
          <Route path="debrief/:sessionId" element={<DebriefPage />} />
          <Route path="map/:sessionId" element={<MapPage />} />
          <Route path="teach/:workMapId" element={<TeachPage />} />
          <Route path="vault/:sessionId" element={<VaultPage />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
