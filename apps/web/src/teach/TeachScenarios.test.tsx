import { expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { TeachScenarios } from './TeachScenarios'
vi.mock('../workmap/useWorkMap', async () => {
  const fixture = await import('../../../server/tests/fixtures/workmap_invoices.json')
  return { useWorkMap: () => ({ status: 'ready', map: fixture.default }) }
})
it('does not leak the expert frame or answer anywhere in the initial prediction preview', () => {
  const html = renderToStaticMarkup(<MemoryRouter><TeachScenarios workMapId="demo" /></MemoryRouter>)
  expect(html).toContain('What would you do next?')
  expect(html).not.toContain('<img')
  expect(html).not.toContain('Re-coded from opex')
  expect(html).not.toContain('Equipment over five thousand euros is always capex.')
})
