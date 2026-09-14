// Builds the tenant profile PDF directly with jsPDF (text/vector drawing, not a
// screenshot of the dashboard page). Mirrors the approach in invoicePdf.js so both
// exports stay crisp/selectable text instead of a rasterized html2canvas capture.
//
// This file is dynamically imported only when the user clicks "Download PDF" —
// jsPDF never loads into the main bundle, so it costs nothing for users who don't use it.

import { COMPANY_NAME, COMPANY_TAGLINE, SOFTWARE_CREDIT } from "./../config/branding"
import { printGeneratedPdf } from "./printPdf"

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const formatDateLong = (d) => {
  if (!d) return "—"
  return new Date(d).toLocaleDateString("en-PK", { day: "2-digit", month: "long", year: "numeric" })
}

const formatMoney = (n) => `PKR ${Number(n || 0).toLocaleString("en-PK")}`

const COLOR = {
  brand: [24, 95, 165],   // matches --color-brand-500
  gray900: [17, 24, 39],
  gray700: [55, 65, 81],
  gray500: [107, 114, 128],
  gray400: [156, 163, 175],
  line: [230, 230, 230],
  green: [22, 163, 74],
  red: [220, 38, 38],
}

export async function generateTenantPdf(tenant, invoices = [], options = {}) {
  const { jsPDF } = await import("jspdf")
  const doc = new jsPDF({ unit: "pt", format: "a4" })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 48
  let y = 56

  const ensureSpace = (needed) => {
    if (y + needed > pageHeight - 60) {
      doc.addPage()
      y = 56
    }
  }

  // Header — company name + doc title
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.setTextColor(...COLOR.gray900)
  doc.text(COMPANY_NAME, margin, y)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...COLOR.gray400)
  doc.text(COMPANY_TAGLINE, margin, y + 14)

  doc.setFont("helvetica", "bold")
  doc.setFontSize(16)
  doc.setTextColor(...COLOR.gray900)
  doc.text("TENANT PROFILE", pageWidth - margin, y, { align: "right" })
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...COLOR.gray400)
  doc.text(`Printed on ${formatDateLong(new Date())}`, pageWidth - margin, y + 16, { align: "right" })

  y += 40
  doc.setDrawColor(...COLOR.line)
  doc.line(margin, y, pageWidth - margin, y)
  y += 28

  // Tenant name / status / unit / contact
  doc.setFont("helvetica", "bold")
  doc.setFontSize(14)
  doc.setTextColor(...COLOR.gray900)
  doc.text(tenant.full_name || "—", margin, y)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(9)
  doc.setTextColor(...COLOR.brand)
  doc.text((tenant.status || "").toUpperCase(), pageWidth - margin, y, { align: "right" })

  y += 18
  doc.setFontSize(10)
  doc.setTextColor(...COLOR.gray500)
  const unitLine = [
    tenant.buildings?.name,
    tenant.units?.unit_number,
    tenant.units?.bedrooms,
    tenant.units?.type,
  ].filter(Boolean).join("  ·  ")
  doc.text(unitLine || "—", margin, y)

  y += 16
  const contactLine = [tenant.phone, tenant.email].filter(Boolean).join("   ·   ")
  if (contactLine) doc.text(contactLine, margin, y)

  y += 22
  doc.setDrawColor(...COLOR.line)
  doc.line(margin, y, pageWidth - margin, y)
  y += 26

  // Two columns — personal details / lease details
  const colWidth = (pageWidth - margin * 2) / 2
  const col2X = margin + colWidth

  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(...COLOR.gray400)
  doc.text("PERSONAL DETAILS", margin, y)
  doc.text("LEASE DETAILS", col2X, y)
  y += 18

  const personalRows = [
    ["Full name", tenant.full_name || "—"],
    ["Phone", tenant.phone || "—"],
    ["Email", tenant.email || "—"],
    ["Date of birth", formatDateLong(tenant.date_of_birth)],
    ["Occupation", tenant.occupation || "—"],
    ["ID type", tenant.id_type?.toUpperCase() || "—"],
    ["ID number", tenant.id_number || "—"],
    ["Emergency contact", tenant.emergency_contact_name
      ? `${tenant.emergency_contact_name} · ${tenant.emergency_contact_phone || ""}`
      : "—"],
  ]

  const leaseRows = [
    ["Building", tenant.buildings?.name || "—"],
    ["Unit", tenant.units?.unit_number || "—"],
    ["Unit type", tenant.units?.type || "—"],
    ["Bedrooms", tenant.units?.bedrooms ? String(tenant.units.bedrooms) : "—"],
    ["Lease start", formatDateLong(tenant.lease_start)],
    ["Lease end", formatDateLong(tenant.lease_end)],
    ["Lock-in period", tenant.lock_in_months ? `${tenant.lock_in_months} months` : "None"],
    ["Escalation", tenant.escalation_pct ? `${tenant.escalation_pct}% per year` : "None"],
  ]

  const rowHeight = 20
  const rowCount = Math.max(personalRows.length, leaseRows.length)
  doc.setFontSize(9)
  for (let i = 0; i < rowCount; i++) {
    const rowY = y + i * rowHeight
    if (personalRows[i]) {
      const [label, value] = personalRows[i]
      doc.setFont("helvetica", "normal")
      doc.setTextColor(...COLOR.gray400)
      doc.text(label, margin, rowY)
      doc.setTextColor(...COLOR.gray900)
      doc.text(String(value), margin + colWidth - 16, rowY, { align: "right" })
    }
    if (leaseRows[i]) {
      const [label, value] = leaseRows[i]
      doc.setFont("helvetica", "normal")
      doc.setTextColor(...COLOR.gray400)
      doc.text(label, col2X, rowY)
      doc.setTextColor(...COLOR.gray900)
      doc.text(String(value), pageWidth - margin, rowY, { align: "right" })
    }
  }

  y += rowCount * rowHeight + 16
  doc.setDrawColor(...COLOR.line)
  doc.line(margin, y, pageWidth - margin, y)
  y += 26

  // Financials
  doc.setFont("helvetica", "bold")
  doc.setFontSize(8)
  doc.setTextColor(...COLOR.gray400)
  doc.text("FINANCIALS", margin, y)
  y += 20

  const moneyRow = (label, value, opts = {}) => {
    doc.setFont("helvetica", opts.bold ? "bold" : "normal")
    doc.setFontSize(opts.bold ? 11 : 9.5)
    doc.setTextColor(...(opts.labelColor || COLOR.gray500))
    doc.text(label, margin, y)
    doc.setTextColor(...(opts.valueColor || COLOR.gray900))
    doc.text(formatMoney(value), pageWidth - margin, y, { align: "right" })
    y += opts.bold ? 22 : 18
  }

  moneyRow("Monthly rent", tenant.monthly_rent)
  moneyRow("Maintenance charges", tenant.maintenance_charges || 0)
  moneyRow("Security deposit (refundable)", tenant.security_deposit || 0)
  if (Number(tenant.advance_deposit) > 0) {
    moneyRow("Advance deposit paid", tenant.advance_deposit, { labelColor: COLOR.green, valueColor: COLOR.green })
  }
  y += 6
  doc.setDrawColor(...COLOR.line)
  doc.line(margin, y, pageWidth - margin, y)
  y += 20
  moneyRow("Total monthly due",
    Number(tenant.monthly_rent || 0) + Number(tenant.maintenance_charges || 0),
    { bold: true, labelColor: COLOR.gray900, valueColor: COLOR.brand }
  )

  y += 14
  doc.setDrawColor(...COLOR.line)
  doc.line(margin, y, pageWidth - margin, y)
  y += 28

  // Payment history
  if (invoices.length > 0) {
    ensureSpace(60)
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...COLOR.gray400)
    doc.text("PAYMENT HISTORY", margin, y)
    y += 18

    const cols = [
      { label: "INVOICE", x: margin, align: "left" },
      { label: "PERIOD", x: margin + 110, align: "left" },
      { label: "DUE DATE", x: margin + 200, align: "left" },
      { label: "STATUS", x: margin + 320, align: "left" },
      { label: "AMOUNT", x: pageWidth - margin, align: "right" },
    ]
    doc.setFont("helvetica", "bold")
    doc.setFontSize(8)
    doc.setTextColor(...COLOR.gray400)
    cols.forEach(c => doc.text(c.label, c.x, y, { align: c.align }))
    y += 8
    doc.setDrawColor(...COLOR.line)
    doc.line(margin, y, pageWidth - margin, y)
    y += 16

    doc.setFont("helvetica", "normal")
    doc.setFontSize(9)
    invoices.forEach(inv => {
      ensureSpace(20)
      doc.setTextColor(...COLOR.gray700)
      doc.text(inv.invoice_number || "—", cols[0].x, y)
      doc.text(`${MONTHS[inv.month - 1]?.slice(0, 3) || ""} ${inv.year || ""}`, cols[1].x, y)
      doc.text(formatDateLong(inv.due_date), cols[2].x, y)
      doc.setTextColor(...(
        inv.status === "paid" ? COLOR.green :
        inv.status === "overdue" ? COLOR.red :
        COLOR.gray500
      ))
      doc.text((inv.status || "").toUpperCase(), cols[3].x, y)
      doc.setTextColor(...COLOR.gray900)
      doc.text(formatMoney(inv.total_amount), cols[4].x, y, { align: "right" })
      y += 18
    })

    const totalPaid = invoices
      .filter(i => i.status === "paid")
      .reduce((sum, i) => sum + Number(i.total_amount), 0)
    const totalPending = invoices
      .filter(i => i.status !== "paid" && i.status !== "cancelled")
      .reduce((sum, i) => sum + Number(i.total_amount), 0)

    ensureSpace(40)
    y += 6
    doc.setDrawColor(...COLOR.line)
    doc.line(margin, y, pageWidth - margin, y)
    y += 20
    doc.setFont("helvetica", "bold")
    doc.setFontSize(9.5)
    doc.setTextColor(...COLOR.green)
    doc.text(`Total collected: ${formatMoney(totalPaid)}`, margin, y)
    doc.setTextColor(...COLOR.red)
    doc.text(`Outstanding: ${formatMoney(totalPending)}`, pageWidth - margin, y, { align: "right" })
  }

  // Footer on every page
  const pageCount = doc.internal.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setFont("helvetica", "normal")
    doc.setFontSize(8)
    doc.setTextColor(...COLOR.gray400)
    doc.text(
      `${COMPANY_NAME} · Confidential document · Powered by ${SOFTWARE_CREDIT}`,
      pageWidth / 2, pageHeight - 40, { align: "center" }
    )
    if (pageCount > 1) {
      doc.text(`Page ${p} of ${pageCount}`, pageWidth - margin, pageHeight - 40, { align: "right" })
    }
  }

  // "Print" sends the real generated document straight to the print dialog
  // (via a hidden iframe) instead of window.print()-ing the styled dashboard
  // page — no visible PDF tab, just the print dialog.
  if (options.print) {
    printGeneratedPdf(doc)
  } else {
    // Tenant name only, no "_profile" suffix — just strip characters that are
    // invalid in a Windows/macOS file name and any trailing dot/space (Windows
    // rejects both), but otherwise keep the name exactly as entered.
    const fileSafeName = (tenant.full_name || "Tenant")
      .trim()
      .replace(/[\\/:*?"<>|]/g, "")
      .replace(/[.\s]+$/, "") || "Tenant"
    doc.save(`${fileSafeName}.pdf`)
  }
}
