// Builds the invoice PDF directly with jsPDF (text/vector drawing, not a screenshot).
// This keeps file size small and text crisp/selectable, unlike html2canvas-based exports.
//
// This file is dynamically imported only when the user clicks "Download PDF" —
// jsPDF never loads into the main bundle, so it costs nothing for users who don't use it.
//
// Layout mirrors the client's real paper letterhead: the logo and project
// watermarks run down the left ~135pt of the page (baked into
// invoice-letterhead.png), so all invoice content — Billed to / Invoice
// details side by side, an itemized Description/Amount list, and the
// Subtotal/Tax/Total breakdown — is drawn in the column to the right of that.

import { printGeneratedPdf } from "./printPdf"
import letterheadUrl from "../assets/invoice-letterhead.png"

function loadLetterhead() {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("Failed to load invoice letterhead"))
    img.src = letterheadUrl
  })
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const UTILITY_LABELS = {
  electricity: "Electricity",
  gas: "Gas",
  water: "Water",
  internet: "Internet",
  other: "Other utility",
}

const formatDateLong = (d) => {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
}

const formatMoney = (n) => `PKR ${Number(n || 0).toLocaleString("en-PK")}`

export async function generateInvoicePdf(invoice, utilityCharges = [], discountCharges = [], securityInstallments = [], bankInfo = "", options = {}) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "pt", format: "a4" })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  // Everything is drawn clear of the logos column on the left.
  const contentLeft = 135
  const marginRight = 40
  const colWidth = (pageWidth - marginRight - contentLeft) / 2
  const maxTextWidth = pageWidth - marginRight - contentLeft - 20

  const brand = [24, 95, 165]   // matches --color-brand-500
  const gray900 = [17, 24, 39]
  const gray700 = [55, 65, 81]
  const gray500 = [107, 114, 128]
  const gray400 = [156, 163, 175]
  const green = [22, 163, 74]
  const red = [220, 38, 38]

  const letterheadImg = await loadLetterhead()
  doc.addImage(letterheadImg, "PNG", 0, 0, pageWidth, pageHeight)

  let y = 118

  // Title row — "INVOICE" on the left, invoice number/status on the right.
  // No company name/tagline here; the letterhead's logo already carries that.
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.setTextColor(...gray900)
  doc.text("INVOICE", contentLeft, y)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(...gray900)
  doc.text(invoice.invoice_number || "", pageWidth - marginRight, y, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.setTextColor(...brand)
  doc.text((invoice.status || "").toUpperCase(), pageWidth - marginRight, y + 16, { align: "right" })

  y += 40
  doc.setDrawColor(230, 230, 230)
  doc.line(contentLeft, y, pageWidth - marginRight, y)
  y += 28

  // Billed to / Invoice details — two columns
  const tenant = invoice.tenants

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(...gray400)
  doc.text("BILLED TO", contentLeft, y)
  doc.text("INVOICE DETAILS", contentLeft + colWidth, y)
  y += 16

  doc.setFont("helvetica", "bold")
  doc.setFontSize(11)
  doc.setTextColor(...gray900)
  doc.text(tenant?.full_name || "—", contentLeft, y)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...gray500)
  const detailRows = [
    ["Invoice number", invoice.invoice_number || "—"],
    ["Period", `${MONTHS[invoice.month - 1] || ""} ${invoice.year || ""}`],
    ["Due date", formatDateLong(invoice.due_date)],
  ]
  if (invoice.paid_date) detailRows.push(["Paid on", formatDateLong(invoice.paid_date)])
  if (invoice.payment_method) detailRows.push(["Payment method", invoice.payment_method.replace(/_/g, " ")])

  let detailY = y
  detailRows.forEach(([label, value]) => {
    doc.setTextColor(...gray400)
    doc.text(label, contentLeft + colWidth, detailY)
    doc.setTextColor(...gray900)
    doc.text(String(value), pageWidth - marginRight, detailY, { align: "right" })
    detailY += 14
  })

  y += 14
  doc.setTextColor(...gray500)
  doc.text(tenant?.phone || "", contentLeft, y)
  y += 14
  doc.text(invoice.buildings?.name || "", contentLeft, y)
  y += 14
  doc.text(invoice.units?.unit_number || "", contentLeft, y)

  y = Math.max(y, detailY) + 28
  doc.setDrawColor(230, 230, 230)
  doc.line(contentLeft, y, pageWidth - marginRight, y)
  y += 24

  // Charges table
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(...gray400)
  doc.text("DESCRIPTION", contentLeft, y)
  doc.text("AMOUNT", pageWidth - marginRight, y, { align: "right" })
  y += 8
  doc.setDrawColor(230, 230, 230)
  doc.line(contentLeft, y, pageWidth - marginRight, y)
  y += 18

  const lineItems = [
    [`Monthly rent — ${MONTHS[invoice.month - 1] || ""} ${invoice.year || ""}`, invoice.rent_amount],
  ]
  if (Number(invoice.maintenance_amount) > 0) lineItems.push(["Maintenance charges", invoice.maintenance_amount])
  if (Number(invoice.security_deposit_amount) > 0) lineItems.push(["Security deposit (one-time)", invoice.security_deposit_amount])
  if (Number(invoice.advance_deposit_amount) > 0) lineItems.push(["Advance deposit paid (credit)", -invoice.advance_deposit_amount])
  securityInstallments.forEach(inst => {
    lineItems.push([inst.notes ? `Security deposit installment — ${inst.notes}` : "Security deposit installment", inst.amount])
  })
  utilityCharges.forEach(charge => {
    const label = UTILITY_LABELS[charge.utility_type] || charge.utility_type
    lineItems.push([charge.notes ? `${label} — ${charge.notes}` : label, charge.amount])
  })
  // Tax is a percentage of rent set on the tenant (see AddTenant.jsx), snapshotted
  // onto the invoice at generation time — not a manually-added line item.
  if (Number(invoice.tax_amount) > 0) {
    const taxLabel = `${invoice.tax_type || "Tax"}${invoice.tax_percentage ? ` (${invoice.tax_percentage}%)` : ""}`
    lineItems.push([taxLabel, invoice.tax_amount])
  }

  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  lineItems.forEach(([label, amount]) => {
    const isCredit = Number(amount) < 0
    doc.setTextColor(...gray500)
    doc.text(label, contentLeft, y)
    doc.setTextColor(...(isCredit ? green : gray900))
    doc.text(isCredit ? `-${formatMoney(-amount)}` : formatMoney(amount), pageWidth - marginRight, y, { align: "right" })
    y += 20
  })

  y += 12
  doc.setDrawColor(230, 230, 230)
  doc.line(pageWidth - marginRight - 180, y, pageWidth - marginRight, y)
  y += 20

  // Discounts are shown as their own list (negative amounts), kept visually
  // separate from the charges table above — same as the on-screen invoice.
  const discountTotal = discountCharges.reduce((sum, d) => sum + Number(d.amount || 0), 0)
  if (discountTotal > 0) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...gray400)
    doc.text("DISCOUNT", contentLeft, y)
    y += 14
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    discountCharges.forEach(discount => {
      doc.setTextColor(...gray500)
      doc.text(discount.discount_type, contentLeft, y)
      doc.setTextColor(...red)
      doc.text(`-${formatMoney(discount.amount)}`, pageWidth - marginRight, y, { align: "right" })
      y += 18
    })
    y += 8
  }

  // Show a Subtotal / Tax / Discount breakdown above the total only when tax
  // or discount lines exist — keeps the layout unchanged for plain invoices.
  const taxTotal = Number(invoice.tax_amount || 0)
  if (taxTotal > 0 || discountTotal > 0) {
    const subtotal = Number(invoice.total_amount || 0) - taxTotal + discountTotal
    doc.setFont("helvetica", "normal")
    doc.setFontSize(10)
    doc.setTextColor(...gray500)
    doc.text("Subtotal", pageWidth - marginRight - 180, y)
    doc.setTextColor(...gray900)
    doc.text(formatMoney(subtotal), pageWidth - marginRight, y, { align: "right" })
    y += 18
    if (taxTotal > 0) {
      const taxLabel = `${invoice.tax_type || "Tax"}${invoice.tax_percentage ? ` (${invoice.tax_percentage}%)` : ""}`
      doc.setTextColor(...gray500)
      doc.text(taxLabel, pageWidth - marginRight - 180, y)
      doc.setTextColor(...gray900)
      doc.text(formatMoney(taxTotal), pageWidth - marginRight, y, { align: "right" })
      y += 18
    }
    if (discountTotal > 0) {
      doc.setTextColor(...gray500)
      doc.text("Discount", pageWidth - marginRight - 180, y)
      doc.setTextColor(...red)
      doc.text(`-${formatMoney(discountTotal)}`, pageWidth - marginRight, y, { align: "right" })
      y += 18
    }
    y += 2
  }

  doc.setFont("helvetica", "bold")
  doc.setFontSize(12)
  doc.setTextColor(...gray900)
  doc.text("Total due", pageWidth - marginRight - 180, y)
  doc.setTextColor(...brand)
  doc.text(formatMoney(invoice.total_amount), pageWidth - marginRight, y, { align: "right" })

  y += 30

  // Payment status line
  doc.setFont("helvetica", "bold")
  doc.setFontSize(9)
  if (invoice.status === "paid" && invoice.paid_date) {
    doc.setTextColor(...green)
    doc.text(
      `Paid on ${formatDateLong(invoice.paid_date)}${invoice.payment_method ? ` via ${invoice.payment_method.replace(/_/g, " ")}` : ""}`,
      contentLeft, y
    )
    y += 18
  } else if (invoice.due_date) {
    doc.setTextColor(...red)
    doc.text(`Kindly clear this invoice before ${formatDateLong(invoice.due_date)}.`, contentLeft, y)
    y += 18
  }

  // Bank / payment-receiving details — set once in Settings, printed on every invoice.
  if (bankInfo && bankInfo.trim()) {
    y += 10
    doc.setDrawColor(230, 230, 230)
    doc.line(contentLeft, y, pageWidth - marginRight, y)
    y += 20
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...gray400)
    doc.text("PAYMENT DETAILS", contentLeft, y)
    y += 15
    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    doc.setTextColor(...gray700)
    const bankLines = doc.splitTextToSize(bankInfo.trim(), maxTextWidth)
    bankLines.forEach(line => { doc.text(line, contentLeft, y); y += 13 })
  }

  // A short note only — the letterhead itself already carries the company's
  // address/website/email/phone in its footer strip below, so nothing more is
  // drawn here; this line sits well clear of that strip.
  doc.setFont("helvetica", "normal")
  doc.setFontSize(8)
  doc.setTextColor(...gray400)
  doc.text("This is a system-generated invoice and does not require a signature.", pageWidth / 2, pageHeight - 90, { align: "center" })
  doc.setFontSize(7.5)
  doc.text("Developed by GENGHIX TECH  ·  www.genghixtech.com  ·  info@genghixtech.com  ·  +92 327 5534726", pageWidth / 2, pageHeight - 76, { align: "center" })

  // "Print" sends the real generated document straight to the print dialog
  // (via a hidden iframe) instead of window.print()-ing the styled dashboard
  // page — no visible PDF tab, just the print dialog.
  if (options.print) {
    printGeneratedPdf(doc)
  } else {
    // Tenant name + date, e.g. "Ahmad Ali Khan - 2026-09-05.pdf" — matches the
    // same "name only, no clutter" convention as the tenant profile PDF (see
    // tenantPdf.js), plus the invoice's due date so multiple invoices for the
    // same tenant don't overwrite each other. Falls back to the billing
    // period, then today's date, if there's no due date on the invoice.
    const fileSafeName = (tenant?.full_name || "Tenant")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/[.\s]+$/, "") || "Tenant"
    const dateForFile = invoice.due_date
      ? new Date(invoice.due_date)
      : invoice.year && invoice.month
        ? new Date(invoice.year, invoice.month - 1, 1)
        : new Date()
    const fileDateStr = dateForFile.toLocaleDateString("en-CA") // YYYY-MM-DD — sortable, filename-safe
    doc.save(`${fileSafeName} - ${fileDateStr}.pdf`)
  }
}
