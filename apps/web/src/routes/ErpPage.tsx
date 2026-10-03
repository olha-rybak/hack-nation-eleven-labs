// The ERP is the app the expert shares. It must not import anything from the
// apprentice side: the apprentice only ever sees it through screen pixels.

export function ErpPage() {
  return (
    <div className="erp">
      <header className="erp-bar">Nordwind ERP · Accounts payable</header>
      <main className="erp-body">
        <p>Invoice list and detail view arrive with T-100.</p>
      </main>
    </div>
  )
}
