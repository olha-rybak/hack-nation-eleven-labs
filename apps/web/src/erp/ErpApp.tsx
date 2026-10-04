// The ERP is the app the expert shares. It must not import anything from the
// apprentice side: the apprentice only ever sees it through screen pixels.

import { useEffect } from 'react'
import { Link, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router'
import { COMPANY, SYSTEM_DATE, type Dataset } from './data'
import { formatDate } from './format'
import { InvoiceDetail } from './InvoiceDetail'
import { InvoiceList } from './InvoiceList'
import { Payments, Reports, VendorDetail, VendorList } from './modules'
import { ErpContext, useErp, useErpState } from './store'
import './erp.css'

export function ErpApp() {
  const [params] = useSearchParams()
  const dataset: Dataset = params.get('case') === 'training' ? 'training' : 'expert'
  return <ErpSession key={dataset} dataset={dataset} />
}

function ErpSession({ dataset }: { dataset: Dataset }) {
  const state = useErpState(dataset)

  // The tab title is what the expert picks in the browser's share dialog.
  useEffect(() => {
    const previous = document.title
    document.title = 'Nordwind ERP'
    return () => {
      document.title = previous
    }
  }, [])

  return (
    <ErpContext.Provider value={state}>
      <div className="erp">
        <header className="erp-header">
          <span className="erp-logo">Nordwind ERP</span>
          <span className="erp-company">{COMPANY}</span>
          <span className="erp-header-right">
            Posting date {formatDate(SYSTEM_DATE)} · User {state.user}
            <button type="button" className="erp-link-button" onClick={state.reset}>
              Reset sandbox
            </button>
          </span>
        </header>
        <div className="erp-frame">
          <nav className="erp-nav" aria-label="Modules">
            <span className="erp-nav-group">Accounts payable</span>
            <ModuleLink to="/erp" also="/erp/invoices">
              Incoming invoices
            </ModuleLink>
            <ModuleLink to="/erp/payments">Payments</ModuleLink>
            <ModuleLink to="/erp/vendors">Vendor master</ModuleLink>
            <ModuleLink to="/erp/reports">Reports</ModuleLink>
          </nav>
          <main className="erp-main">
            <Routes>
              <Route index element={<InvoiceList />} />
              <Route path="invoices/:id" element={<DetailRoute />} />
              <Route path="payments" element={<Payments />} />
              <Route path="vendors" element={<VendorList />} />
              <Route path="vendors/:id" element={<VendorRoute />} />
              <Route path="reports" element={<Reports />} />
            </Routes>
          </main>
        </div>
        <StatusBar />
      </div>
    </ErpContext.Provider>
  )
}

function DetailRoute() {
  const { id = '' } = useParams()
  return <InvoiceDetail key={id} id={id} />
}

function VendorRoute() {
  const { id = '' } = useParams()
  return <VendorDetail id={id} />
}

// An invoice opened from Payments or a vendor still belongs to Incoming invoices.
function ModuleLink({ to, also, children }: { to: string; also?: string; children: React.ReactNode }) {
  const { pathname } = useLocation()
  const active = pathname === to || (to !== '/erp' && pathname.startsWith(`${to}/`)) || (also !== undefined && pathname.startsWith(also))
  return (
    <Link to={{ pathname: to, search: location.search }} className={`erp-nav-item${active ? ' active' : ''}`}>
      {children}
    </Link>
  )
}

function StatusBar() {
  const { message } = useErp()
  return (
    <footer className="erp-status" role="status">
      {message}
    </footer>
  )
}
