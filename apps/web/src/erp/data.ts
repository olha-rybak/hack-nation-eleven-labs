// Sandbox data. Every company, person, VAT id and document number is invented.
// The judgment calls live in the data, never in UI text:
//   INV-4471  equipment over the capex line, prefilled with an opex cost center
//   INV-4472  same line as Nordtec's November invoice INV-4459 (duplicate, hold)
//   INV-4473  group company in CZ; last month's invoice INV-4469 had two approvers
//   INV-4474  training case only: equipment from a supplier not in the vendor master

export type InvoiceStatus = 'open' | 'on_hold' | 'in_approval' | 'posted' | 'paid'

export interface Supplier {
  id: string
  name: string
  street: string
  city: string
  country: string
  vatId: string
  vendorNo: string | null
  groupCompany: string | null
  since: string | null
}

export interface LineItem {
  description: string
  qty: number
  unit: string
  unitPrice: number
}

export interface LogEntry {
  at: string
  user: string
  text: string
}

export interface Invoice {
  id: string
  supplierId: string
  supplierRef: string
  invoiceDate: string
  dueDate: string
  receivedDate: string
  poNumber: string | null
  lines: LineItem[]
  vatRate: number
  vatNote: string | null
  costCenter: string
  assetNumber: string
  comment: string
  approvers: string[]
  status: InvoiceStatus
  documentNo: string | null
  log: LogEntry[]
}

export type Dataset = 'expert' | 'training'

export const COMPANY = 'Kessler Antriebstechnik GmbH'
export const SYSTEM_DATE = '2026-12-03'
export const CURRENT_USER: Record<Dataset, string> = { expert: 'S. Keller', training: 'L. Vogt' }

export const costCenters = [
  { code: '0400', name: 'Machines and equipment' },
  { code: '0410', name: 'Tools and fixtures' },
  { code: '4620', name: 'External production services' },
  { code: '4711', name: 'Repairs and maintenance' },
  { code: '4800', name: 'Office supplies' },
  { code: '4950', name: 'IT services' },
]

export const approvers = [
  { name: 'K. Sommer', role: 'Head of Accounts Payable' },
  { name: 'M. Novák', role: 'Finance, Vltava s.r.o.' },
  { name: 'H. Lange', role: 'Controller' },
  { name: 'T. Brandt', role: 'Purchasing' },
]

export const assetsUnderConstruction = [
  { number: 'AN-20931', name: 'Spindle unit HSK-63, machining center 3' },
  { number: 'AN-20877', name: 'Cooling unit, hall B' },
  { number: 'AN-20940', name: 'Hydraulic power unit, press line 2' },
  { number: 'AN-20952', name: 'Measuring station, quality lab' },
]

export const suppliers: Supplier[] = [
  { id: 's-weber', name: 'Weber Maschinenbau GmbH', street: 'Industriestraße 12', city: '70565 Stuttgart', country: 'DE', vatId: 'DE000000101', vendorNo: '100231', groupCompany: null, since: '2009-03-02' },
  { id: 's-nordtec', name: 'Nordtec GmbH', street: 'Hafenweg 3', city: '28217 Bremen', country: 'DE', vatId: 'DE000000202', vendorNo: '100418', groupCompany: null, since: '2014-06-17' },
  { id: 's-vltava', name: 'Vltava s.r.o.', street: 'Na Poříčí 8', city: '110 00 Praha', country: 'CZ', vatId: 'CZ00000303', vendorNo: '100977', groupCompany: 'Kessler Group', since: '2018-01-09' },
  { id: 's-haller', name: 'Haller Büro & Papier KG', street: 'Marktplatz 5', city: '71032 Böblingen', country: 'DE', vatId: 'DE000000404', vendorNo: '100052', groupCompany: null, since: '2006-11-20' },
  { id: 's-mertens', name: 'Mertens Industriebedarf GmbH', street: 'Am Bahnhof 21', city: '73728 Esslingen', country: 'DE', vatId: 'DE000000505', vendorNo: '100310', groupCompany: null, since: '2011-05-04' },
  { id: 's-brenner', name: 'Brenner Fluidtechnik KG', street: 'Talstraße 40', city: '89073 Ulm', country: 'DE', vatId: 'DE000000606', vendorNo: null, groupCompany: null, since: null },
]

const hoseSet: LineItem = { description: 'Hydraulic hose set DN12, pressed fittings', qty: 24, unit: 'pcs', unitPrice: 76.5 }

const history: Invoice[] = [
  {
    id: 'INV-4459', supplierId: 's-nordtec', supplierRef: 'NT-2026-1187', invoiceDate: '2026-11-04', dueDate: '2026-11-18', receivedDate: '2026-11-05',
    poNumber: '4500018407', lines: [hoseSet], vatRate: 0.19, vatNote: null,
    costCenter: '4711', assetNumber: '', comment: '', approvers: ['K. Sommer'], status: 'paid', documentNo: '5100041702',
    log: [
      { at: '2026-11-06 09:12', user: 'S. Keller', text: 'Sent for approval to K. Sommer' },
      { at: '2026-11-06 11:40', user: 'K. Sommer', text: 'Approved' },
      { at: '2026-11-06 11:52', user: 'S. Keller', text: 'Posted, document 5100041702' },
    ],
  },
  {
    id: 'INV-4462', supplierId: 's-haller', supplierRef: 'R-88213', invoiceDate: '2026-11-12', dueDate: '2026-11-26', receivedDate: '2026-11-13',
    poNumber: null, lines: [{ description: 'Copy paper A4, 80 g', qty: 40, unit: 'reams', unitPrice: 4.79 }, { description: 'Toner cartridges, black', qty: 3, unit: 'pcs', unitPrice: 31.0 }], vatRate: 0.19, vatNote: null,
    costCenter: '4800', assetNumber: '', comment: '', approvers: ['K. Sommer'], status: 'paid', documentNo: '5100041766',
    log: [{ at: '2026-11-13 14:05', user: 'S. Keller', text: 'Posted, document 5100041766' }],
  },
  {
    id: 'INV-4465', supplierId: 's-weber', supplierRef: 'WM-26-08544', invoiceDate: '2026-11-18', dueDate: '2026-12-02', receivedDate: '2026-11-19',
    poNumber: '4500018512', lines: [{ description: 'Service visit, machining center 3, incl. travel', qty: 1, unit: 'job', unitPrice: 640.0 }], vatRate: 0.19, vatNote: null,
    costCenter: '4711', assetNumber: '', comment: '', approvers: ['K. Sommer'], status: 'paid', documentNo: '5100041811',
    log: [{ at: '2026-11-20 10:31', user: 'S. Keller', text: 'Posted, document 5100041811' }],
  },
  {
    id: 'INV-4468', supplierId: 's-mertens', supplierRef: 'ME-552190', invoiceDate: '2026-11-21', dueDate: '2026-12-05', receivedDate: '2026-11-24',
    poNumber: '4500018599', lines: [{ description: 'Cut-resistant gloves, size 9', qty: 50, unit: 'pairs', unitPrice: 8.25 }], vatRate: 0.19, vatNote: null,
    costCenter: '4711', assetNumber: '', comment: '', approvers: ['K. Sommer'], status: 'posted', documentNo: '5100041859',
    log: [{ at: '2026-11-24 15:47', user: 'S. Keller', text: 'Posted, document 5100041859' }],
  },
  {
    id: 'INV-4469', supplierId: 's-vltava', supplierRef: 'VLT-2026-0352', invoiceDate: '2026-10-31', dueDate: '2026-11-14', receivedDate: '2026-11-03',
    poNumber: '4500018310', lines: [{ description: 'Machining of gear housings GH-210, batch 10/2026', qty: 390, unit: 'pcs', unitPrice: 9.8 }], vatRate: 0, vatNote: 'Reverse charge, intra-EU supply',
    costCenter: '4620', assetNumber: '', comment: '', approvers: ['K. Sommer', 'M. Novák'], status: 'paid', documentNo: '5100041633',
    log: [
      { at: '2026-11-03 10:02', user: 'S. Keller', text: 'Sent for approval to K. Sommer, M. Novák' },
      { at: '2026-11-03 13:15', user: 'K. Sommer', text: 'Approved' },
      { at: '2026-11-04 08:41', user: 'M. Novák', text: 'Approved' },
      { at: '2026-11-04 09:03', user: 'S. Keller', text: 'Posted, document 5100041633' },
    ],
  },
]

const openForExpert: Invoice[] = [
  {
    id: 'INV-4471', supplierId: 's-weber', supplierRef: 'WM-26-08812', invoiceDate: '2026-11-27', dueDate: '2026-12-11', receivedDate: '2026-11-30',
    poNumber: '4500018821', lines: [{ description: 'Spindle unit HSK-63, complete, incl. mounting kit', qty: 1, unit: 'pcs', unitPrice: 7200.0 }], vatRate: 0.19, vatNote: null,
    costCenter: '4711', assetNumber: '', comment: '', approvers: ['K. Sommer'], status: 'open', documentNo: null,
    log: [{ at: '2026-11-30 08:15', user: 'System', text: 'Received by e-invoice import' }],
  },
  {
    id: 'INV-4472', supplierId: 's-nordtec', supplierRef: 'NT-2026-1342', invoiceDate: '2026-12-02', dueDate: '2026-12-16', receivedDate: '2026-12-02',
    poNumber: '4500018407', lines: [hoseSet], vatRate: 0.19, vatNote: null,
    costCenter: '4711', assetNumber: '', comment: '', approvers: ['K. Sommer'], status: 'open', documentNo: null,
    log: [{ at: '2026-12-02 08:10', user: 'System', text: 'Received by e-invoice import' }],
  },
  {
    id: 'INV-4473', supplierId: 's-vltava', supplierRef: 'VLT-2026-0391', invoiceDate: '2026-11-30', dueDate: '2026-12-14', receivedDate: '2026-12-01',
    poNumber: '4500018650', lines: [{ description: 'Machining of gear housings GH-210, batch 11/2026', qty: 400, unit: 'pcs', unitPrice: 9.8 }], vatRate: 0, vatNote: 'Reverse charge, intra-EU supply',
    costCenter: '4620', assetNumber: '', comment: '', approvers: ['K. Sommer'], status: 'open', documentNo: null,
    log: [{ at: '2026-12-01 08:12', user: 'System', text: 'Received by e-invoice import' }],
  },
]

const openForTraining: Invoice[] = [
  {
    id: 'INV-4474', supplierId: 's-brenner', supplierRef: 'BF-1029', invoiceDate: '2026-12-01', dueDate: '2026-12-15', receivedDate: '2026-12-02',
    poNumber: null, lines: [{ description: 'Hydraulic power unit HPU-40, 7.5 kW, incl. commissioning', qty: 1, unit: 'pcs', unitPrice: 9400.0 }], vatRate: 0.19, vatNote: null,
    costCenter: '4711', assetNumber: '', comment: '', approvers: ['K. Sommer'], status: 'open', documentNo: null,
    log: [{ at: '2026-12-02 08:31', user: 'System', text: 'Received by e-invoice import, supplier not found in vendor master' }],
  },
]

export function seed(dataset: Dataset): Invoice[] {
  const open = dataset === 'training' ? openForTraining : openForExpert
  return structuredClone([...open, ...history])
}

export function supplierOf(invoice: Invoice): Supplier {
  const supplier = suppliers.find((s) => s.id === invoice.supplierId)
  if (!supplier) throw new Error(`Unknown supplier ${invoice.supplierId}`)
  return supplier
}

export function totals(invoice: Invoice) {
  const net = invoice.lines.reduce((sum, line) => sum + line.qty * line.unitPrice, 0)
  const vat = Math.round(net * invoice.vatRate * 100) / 100
  return { net, vat, gross: net + vat }
}
