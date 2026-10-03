# T-100 · Fake ERP with the three invoices
**Lane A · depends on: T-002**

A believable AP screen inside `apps/web/src/erp`: invoice list, detail view with supplier, amount, date,
cost center field, asset number field, approval button, Save. Seed data must hide the judgment calls the
brief describes:

- **INV-4471** — €7,200 equipment, supplier *Weber Maschinenbau*. Opex code 4711 prefilled; the correct
  answer is capex 0400, and capex requires an asset number.
- **INV-4472** — *Nordtec GmbH*, December, duplicate of a November line. The correct answer is hold.
- **INV-4473** — *Vltava s.r.o.*, Czech subsidiary. The correct answer is route for a second approval.

Plus a fourth invoice held back for the Teach demo (T-303), never shown to the expert.

All data is fake and obviously so. No real company names, no real IBANs.

**Acceptance:** a person who has never seen the repo can process all three invoices in 5–10 minutes
without being told what to do, and the UI never reveals the three rules in text.
