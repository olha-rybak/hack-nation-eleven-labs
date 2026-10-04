// Sandbox data for the returns desk. Every customer, order and address is invented.
// The judgment calls live in the data, never in UI text (rules: docs/returns-desk.md):
//   RMA-1041  plain defect, normal customer: replacement
//   RMA-1042  TV arrived broken, box crushed: carrier claim, not a refund; over 200 EUR needs a supervisor
//   RMA-1043  opened espresso machine, changed mind: refund minus restocking fee, over 200 EUR: supervisor
//   RMA-1044  returned 9 of the last 10 orders: flag, don't refund
//   RMA-1045  kettle 4 days outside the window, loyal customer since 2017: goodwill refund
//   RMA-2051  training case only: soundbar, dented box, rattling: carrier claim (the tutor's catch)

export type CaseStatus = 'open' | 'escalated' | 'completed'

export const resolutions = ['Refund', 'Replacement', 'Carrier claim', 'Goodwill refund', 'Reject'] as const
export type Resolution = (typeof resolutions)[number]

export interface Customer {
  name: string
  email: string
  city: string
  since: string
  orders12m: number
  returns12m: number
}

export interface LogEntry {
  at: string
  user: string
  text: string
}

export interface ReturnCase {
  id: string
  orderNo: string
  customer: Customer
  item: string
  sku: string
  price: number
  delivered: string
  carrier: string
  opened: boolean
  packaging: string
  reason: string
  message: string
  resolution: Resolution | ''
  refundAmount: string
  restockingFee: boolean
  note: string
  status: CaseStatus
  log: LogEntry[]
}

export type Dataset = 'expert' | 'training'

export const SHOP = 'Lumen Home & Tech'
export const SYSTEM_DATE = '2026-12-03'
export const RETURN_WINDOW_DAYS = 30
export const RESTOCKING_FEE = 0.15
export const CURRENT_USER: Record<Dataset, string> = { expert: 'M. Brandt', training: 'J. Weber' }

function open(c: Omit<ReturnCase, 'resolution' | 'refundAmount' | 'restockingFee' | 'note' | 'status' | 'log'>): ReturnCase {
  return {
    ...c,
    resolution: '',
    refundAmount: '',
    restockingFee: false,
    note: '',
    status: 'open',
    log: [{ at: `${SYSTEM_DATE} 08:02`, user: 'system', text: 'Return request received via customer portal' }],
  }
}

const expert = (): ReturnCase[] => [
  open({
    id: 'RMA-1041',
    orderNo: 'LH-883012',
    customer: { name: 'Clara Hoffmann', email: 'clara.hoffmann@example.com', city: 'Leipzig', since: '2023-04-11', orders12m: 6, returns12m: 0 },
    item: 'Aria ANC wireless headphones, black',
    sku: 'AUD-ARIA-BK',
    price: 89.0,
    delivered: '2026-11-21',
    carrier: 'DHL',
    opened: true,
    packaging: 'Original box, undamaged',
    reason: 'Defective',
    message: 'The left ear cup stopped working after a week. Charging does not help.',
  }),
  open({
    id: 'RMA-1042',
    orderNo: 'LH-884455',
    customer: { name: 'Tobias Krämer', email: 't.kraemer@example.com', city: 'Dortmund', since: '2021-09-02', orders12m: 4, returns12m: 1 },
    item: 'Vista 55" 4K OLED TV',
    sku: 'TV-VISTA-55',
    price: 649.0,
    delivered: '2026-12-01',
    carrier: 'DHL Freight',
    opened: true,
    packaging: 'Outer box crushed at one corner (customer photo attached)',
    reason: 'Arrived damaged',
    message: 'Unpacked it yesterday and the screen is cracked in the bottom left corner. The box already looked bad when it arrived.',
  }),
  open({
    id: 'RMA-1043',
    orderNo: 'LH-879930',
    customer: { name: 'Sophie Wagner', email: 'sophie.w@example.com', city: 'Freiburg', since: '2024-01-19', orders12m: 3, returns12m: 0 },
    item: 'Barista Pro espresso machine',
    sku: 'KIT-BARISTA-PRO',
    price: 329.0,
    delivered: '2026-11-07',
    carrier: 'Hermes',
    opened: true,
    packaging: 'Original box, opened, all parts included',
    reason: 'Changed my mind',
    message: 'Works fine but it is much louder than I expected. I would like to send it back.',
  }),
  open({
    id: 'RMA-1044',
    orderNo: 'LH-885120',
    customer: { name: 'Jonas Becker', email: 'jonas.becker88@example.com', city: 'Hamburg', since: '2025-06-30', orders12m: 10, returns12m: 9 },
    item: 'Stride 3 running shoes, size 44',
    sku: 'SPT-STRIDE3-44',
    price: 120.0,
    delivered: '2026-11-24',
    carrier: 'DPD',
    opened: false,
    packaging: 'Unopened',
    reason: 'Does not fit',
    message: 'Too small, please refund.',
  }),
  open({
    id: 'RMA-1045',
    orderNo: 'LH-871204',
    customer: { name: 'Helga Schmitt', email: 'h.schmitt@example.com', city: 'Kassel', since: '2017-03-08', orders12m: 41, returns12m: 0 },
    item: 'Brew 1.7 l electric kettle',
    sku: 'KIT-BREW-17',
    price: 45.0,
    delivered: '2026-10-30',
    carrier: 'DHL',
    opened: true,
    packaging: 'Original box',
    reason: 'Defective',
    message: 'The kettle stopped heating this morning. I know it is a bit late, sorry.',
  }),
]

const training = (): ReturnCase[] => [
  open({
    id: 'RMA-2051',
    orderNo: 'LH-886301',
    customer: { name: 'Lukas Fischer', email: 'lukas.fischer@example.com', city: 'Bremen', since: '2022-11-15', orders12m: 5, returns12m: 0 },
    item: 'Pulse 3.1 soundbar with subwoofer',
    sku: 'AUD-PULSE-31',
    price: 279.0,
    delivered: '2026-12-02',
    carrier: 'DHL',
    opened: false,
    packaging: 'Box badly dented on two sides, something rattles inside (customer photo attached)',
    reason: 'Arrived damaged',
    message: 'The box was dented when the driver handed it over and something is loose inside. I have not opened it.',
  }),
  open({
    id: 'RMA-2052',
    orderNo: 'LH-886377',
    customer: { name: 'Mia Schulz', email: 'mia.schulz@example.com', city: 'Bonn', since: '2025-02-03', orders12m: 2, returns12m: 0 },
    item: 'Clear phone case, model 15',
    sku: 'ACC-CASE-15',
    price: 19.0,
    delivered: '2026-11-28',
    carrier: 'Deutsche Post',
    opened: true,
    packaging: 'Original packaging',
    reason: 'Wrong item',
    message: 'I ordered the case for model 15 but got one for model 14.',
  }),
]

export function seed(dataset: Dataset): ReturnCase[] {
  return dataset === 'training' ? training() : expert()
}

export function daysSince(iso: string): number {
  return Math.round((Date.parse(SYSTEM_DATE) - Date.parse(iso)) / 86_400_000)
}
