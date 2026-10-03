// The ERP is the app the expert shares. It must not import anything from the
// apprentice side: the apprentice only ever sees it through screen pixels.

import { Link, Route, Routes, useParams, useSearchParams } from 'react-router'
import { COMPANY, SYSTEM_DATE, type Dataset } from './data'
import { formatDate } from './format'
import { InvoiceDetail } from './InvoiceDetail'
import { InvoiceList } from './InvoiceList'
import { ErpContext, useErp, useErpState } from './store'
import './erp.css'

export function ErpApp() {
  const [params] = useSearchParams()
  const dataset: Dataset = params.get('case') === 'training' ? 'training' : 'expert'
  return <ErpSession key={dataset} dataset={dataset} />
}

function ErpSession({ dataset }: { dataset: Dataset }) {
  const state = useErpState(dataset)

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
            <Link to={{ pathname: '/erp', search: location.search }} className="erp-nav-item active">
              Incoming invoices
            </Link>
            <span className="erp-nav-item disabled">Payments</span>
            <span className="erp-nav-item disabled">Vendor master</span>
            <span className="erp-nav-item disabled">Reports</span>
          </nav>
          <main className="erp-main">
            <Routes>
              <Route index element={<InvoiceList />} />
              <Route path="invoices/:id" element={<DetailRoute />} />
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

function StatusBar() {
  const { message } = useErp()
  return (
    <footer className="erp-status" role="status">
      {message}
    </footer>
  )
}
