const money = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatMoney(value: number): string {
  return `${money.format(value)} EUR`
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}.${m}.${y}`
}

export function formatDateTime(value: string): string {
  return `${formatDate(value)} ${value.slice(11, 16)}`
}
