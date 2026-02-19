
import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { AlertCircle, Calendar, Download, FileText, PieChart as PieIcon, TrendingUp } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { format, getMonth, getYear, subMonths } from 'date-fns'
import { es } from 'date-fns/locale'
import { useExpedientes } from '../../context/ExpedientesContext'
import { useNotifications } from '../../context/NotificationsContext'
import { VISITADORES, formatDate, sanitizeSpreadsheetCell } from '../../lib/utils'

type ReportType = 'mensual' | 'trimestral' | 'anual'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const CHART_COLORS = ['#2563eb', '#7c3aed', '#059669', '#d97706', '#dc2626', '#4f46e5']
const CHART_TOOLTIP_STYLE = {
  backgroundColor: '#fff',
  border: '1px solid #cbd5e1',
  borderRadius: '12px',
  boxShadow: '0 8px 24px rgba(15,23,42,0.08)',
  padding: '10px 12px',
}

type ChartTooltipItem = {
  color?: string
  dataKey?: string
  name?: string
  value?: number | string
}

function ReportBarTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean
  payload?: ChartTooltipItem[]
  label?: string
}) {
  if (!active || !payload || payload.length === 0) return null
  const rows = payload.filter((item) => item.value !== undefined)
  if (rows.length === 0) return null

  return (
    <div className="min-w-[136px] rounded-xl border border-slate-300 bg-white/95 px-3 py-2.5 shadow-lg backdrop-blur-sm">
      <p className="mb-2 text-sm font-semibold text-slate-900">{label}</p>
      <div className="space-y-1.5 text-sm">
        {rows.map((item) => (
          <div key={item.dataKey ?? item.name} className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-1.5 text-slate-600">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color ?? '#94a3b8' }} />
              {item.dataKey}
            </span>
            <span className="font-semibold text-slate-900">{item.value ?? 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ReportPieTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: ChartTooltipItem[]
}) {
  if (!active || !payload || payload.length === 0) return null
  const item = payload[0]

  return (
    <div className="rounded-xl border border-slate-300 bg-white/95 px-3 py-2 shadow-lg backdrop-blur-sm">
      <p className="text-sm font-semibold text-slate-900">{item.name}</p>
      <p className="text-sm text-slate-600">
        Casos: <span className="font-semibold text-slate-900">{item.value ?? 0}</span>
      </p>
    </div>
  )
}

function csvEscape(value: string | number) {
  const safe = sanitizeSpreadsheetCell(String(value))
  return `"${safe.replace(/"/g, '""')}"`
}

function xmlEscape(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function makeXmlRow(values: Array<string | number>) {
  return `<Row>${values
    .map((value) => {
      const type = typeof value === 'number' ? 'Number' : 'String'
      const normalized = type === 'String' ? sanitizeSpreadsheetCell(String(value)) : String(value)
      return `<Cell><Data ss:Type="${type}">${xmlEscape(normalized)}</Data></Cell>`
    })
    .join('')}</Row>`
}

export function Reportes() {
  const { expedientes } = useExpedientes()
  const { addNotification } = useNotifications()
  const shouldReduceMotion = useReducedMotion()

  const [reportType, setReportType] = useState<ReportType>('mensual')
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth())
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [exportingPDF, setExportingPDF] = useState(false)
  const [exportingExcel, setExportingExcel] = useState(false)

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear()
    const yearsFromData = expedientes
      .map((item) => getYear(new Date(item.created_at)))
      .filter((year) => Number.isFinite(year))
    const minYear = Math.min(currentYear - 2, ...yearsFromData)
    const maxYear = Math.max(currentYear + 1, ...yearsFromData)

    const result: number[] = []
    for (let year = maxYear; year >= minYear; year -= 1) result.push(year)
    return result
  }, [expedientes])

  const reportData = useMemo(() => {
    const inPeriod = (date: Date) => {
      const y = getYear(date)
      const m = getMonth(date)

      if (reportType === 'anual') return y === selectedYear
      if (reportType === 'trimestral') {
        const quarterStart = Math.floor(selectedMonth / 3) * 3
        return y === selectedYear && m >= quarterStart && m <= quarterStart + 2
      }
      return y === selectedYear && m === selectedMonth
    }

    const enPeriodo = expedientes.filter((item) => inPeriod(new Date(item.created_at)))
    const resueltos = enPeriodo.filter((item) => item.estado === 'Resuelta').length
    const pendientes = enPeriodo.length - resueltos
    const tasaResolucion = enPeriodo.length > 0 ? Math.round((resueltos / enPeriodo.length) * 100) : 0

    const byVisitador = VISITADORES.map((visitador) => {
      const visitadorExpedientes = enPeriodo.filter((item) => item.visitador_asignado === visitador)
      const visitadorResueltos = visitadorExpedientes.filter((item) => item.estado === 'Resuelta').length
      const visitadorPendientes = visitadorExpedientes.length - visitadorResueltos

      return {
        nombre: visitador,
        asignados: visitadorExpedientes.length,
        resueltos: visitadorResueltos,
        pendientes: visitadorPendientes,
        efectividad:
          visitadorExpedientes.length > 0
            ? Math.round((visitadorResueltos / visitadorExpedientes.length) * 100)
            : 0,
      }
    }).filter((item) => item.asignados > 0)

    const estadoCounts: Record<string, number> = {}
    enPeriodo.forEach((item) => {
      estadoCounts[item.estado] = (estadoCounts[item.estado] ?? 0) + 1
    })
    const byEstado = Object.entries(estadoCounts).map(([name, value]) => ({ name, value }))

    const monthly = []
    for (let index = 5; index >= 0; index -= 1) {
      const date = subMonths(new Date(selectedYear, selectedMonth), index)
      const month = getMonth(date)
      const year = getYear(date)

      const monthRows = expedientes.filter((item) => {
        const itemDate = new Date(item.created_at)
        return getMonth(itemDate) === month && getYear(itemDate) === year
      })

      monthly.push({
        mes: `${MESES[month]} ${String(year).slice(-2)}`,
        ingresos: monthRows.length,
        resueltos: monthRows.filter((item) => item.estado === 'Resuelta').length,
      })
    }

    return { enPeriodo, resueltos, pendientes, tasaResolucion, byVisitador, byEstado, monthly }
  }, [expedientes, reportType, selectedMonth, selectedYear])

  const periodLabel =
    reportType === 'anual'
      ? `Anual ${selectedYear}`
      : reportType === 'trimestral'
        ? `Trimestre ${Math.floor(selectedMonth / 3) + 1} ${selectedYear}`
        : format(new Date(selectedYear, selectedMonth), 'MMMM yyyy', { locale: es })

  const chartAnimationEnabled = !shouldReduceMotion
  const hasMonthlyMovement = reportData.monthly.some((item) => item.ingresos > 0 || item.resueltos > 0)
  const estadoTotal = reportData.byEstado.reduce((sum, item) => sum + item.value, 0)

  const exportPDF = async () => {
    setExportingPDF(true)
    try {
      const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const width = doc.internal.pageSize.getWidth()

      doc.setFillColor(15, 23, 42)
      doc.rect(0, 0, width, 30, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.text('CEDHBC - Reporte de Expedientes', 14, 12)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(`Periodo: ${periodLabel}`, 14, 20)
      doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 25)

      autoTable(doc, {
        startY: 38,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [30, 41, 59] },
        head: [['Indicador', 'Valor']],
        body: [
          ['Total expedientes', String(reportData.enPeriodo.length)],
          ['Resueltos', String(reportData.resueltos)],
          ['Pendientes', String(reportData.pendientes)],
          ['Tasa de resolucion', `${reportData.tasaResolucion}%`],
        ],
      })

      autoTable(doc, {
        startY: ((doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY ?? 68) + 6,
        theme: 'grid',
        styles: { fontSize: 7.5, cellPadding: 2 },
        headStyles: { fillColor: [71, 85, 105] },
        head: [['Folio', 'Fecha', 'Visitador', 'Estado']],
        body:
          reportData.enPeriodo.length > 0
            ? reportData.enPeriodo.map((item) => [
                item.folio,
                formatDate(item.fecha_presentacion),
                item.visitador_asignado,
                item.estado,
              ])
            : [['Sin expedientes en el periodo', '-', '-', '-']],
      })

      doc.save(`CEDHBC_Reporte_${periodLabel.replace(/\s+/g, '_')}.pdf`)
      addNotification({
        type: 'success',
        title: 'PDF generado',
        message: `Se exporto el reporte ${periodLabel}.`,
      })
    } catch {
      addNotification({
        type: 'error',
        title: 'Error al exportar PDF',
        message: 'No se pudo generar el PDF. Intente nuevamente.',
      })
    } finally {
      setExportingPDF(false)
    }
  }

  const exportExcel = async () => {
    setExportingExcel(true)
    try {
      const rows: string[] = []
      rows.push(makeXmlRow(['CEDHBC - REPORTE DE EXPEDIENTES']))
      rows.push(makeXmlRow([`Periodo: ${periodLabel} - Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`]))
      rows.push(makeXmlRow(['']))
      rows.push(makeXmlRow(['Indicador', 'Valor']))
      rows.push(makeXmlRow(['Total expedientes', reportData.enPeriodo.length]))
      rows.push(makeXmlRow(['Resueltos', reportData.resueltos]))
      rows.push(makeXmlRow(['Pendientes', reportData.pendientes]))
      rows.push(makeXmlRow(['Tasa de resolucion', `${reportData.tasaResolucion}%`]))
      rows.push(makeXmlRow(['']))
      rows.push(makeXmlRow(['Visitador', 'Asignados', 'Resueltos', 'Pendientes', 'Efectividad']))

      if (reportData.byVisitador.length === 0) {
        rows.push(makeXmlRow(['Sin datos para el periodo']))
      } else {
        reportData.byVisitador.forEach((item) => {
          rows.push(
            makeXmlRow([item.nombre, item.asignados, item.resueltos, item.pendientes, `${item.efectividad}%`]),
          )
        })
      }

      rows.push(makeXmlRow(['']))
      rows.push(makeXmlRow(['Folio', 'Fecha', 'Derecho', 'Visitador', 'Estado']))
      if (reportData.enPeriodo.length === 0) {
        rows.push(makeXmlRow(['Sin expedientes en el periodo']))
      } else {
        reportData.enPeriodo.forEach((item) => {
          rows.push(
            makeXmlRow([
              item.folio,
              formatDate(item.fecha_presentacion),
              item.tipo_derecho,
              item.visitador_asignado,
              item.estado,
            ]),
          )
        })
      }

      rows.push(makeXmlRow(['']))
      rows.push(makeXmlRow(['Mes', 'Ingresos', 'Resueltos']))
      reportData.monthly.forEach((item) => {
        rows.push(makeXmlRow([item.mes, item.ingresos, item.resueltos]))
      })

      const workbookXml = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Reporte">
  <Table>${rows.join('')}</Table>
 </Worksheet>
</Workbook>`

      const blob = new Blob([`\uFEFF${workbookXml}`], { type: 'application/vnd.ms-excel;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `CEDHBC_Reporte_${periodLabel.replace(/\s+/g, '_')}.xls`
      link.click()
      URL.revokeObjectURL(url)
      addNotification({
        type: 'success',
        title: 'Excel generado',
        message: `Se exporto el reporte ${periodLabel}.`,
      })
    } catch {
      addNotification({
        type: 'error',
        title: 'Error al exportar Excel',
        message: 'No se pudo generar el archivo Excel.',
      })
    } finally {
      setExportingExcel(false)
    }
  }

  const csvExport = () => {
    try {
      const headers = ['Folio', 'Fecha', 'Derecho', 'Visitador', 'Estado']
      const body = reportData.enPeriodo.map((item) =>
        [item.folio, formatDate(item.fecha_presentacion), item.tipo_derecho, item.visitador_asignado, item.estado]
          .map(csvEscape)
          .join(','),
      )
      const csv = [headers.map(csvEscape).join(','), ...body].join('\n')
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `CEDHBC_Reporte_${periodLabel.replace(/\s+/g, '_')}.csv`
      link.click()
      URL.revokeObjectURL(url)
      addNotification({
        type: 'info',
        title: 'CSV generado',
        message: `Se exporto el reporte ${periodLabel}.`,
      })
    } catch {
      addNotification({
        type: 'error',
        title: 'Error al exportar CSV',
        message: 'No se pudo generar el archivo CSV.',
      })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Reportes Mensuales</h1>
          <p className="mt-1 text-slate-600">Analisis y estadisticas del periodo</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2">
            <Calendar className="h-4 w-4 text-slate-500" aria-hidden />
            <select
              value={reportType}
              onChange={(event) => setReportType(event.target.value as ReportType)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              <option value="mensual">Mensual</option>
              <option value="trimestral">Trimestral</option>
              <option value="anual">Anual</option>
            </select>
            <select
              value={selectedMonth}
              onChange={(event) => setSelectedMonth(Number(event.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              {MESES.map((month, index) => (
                <option key={month} value={index}>
                  {month}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(event) => setSelectedYear(Number(event.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-700 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
            >
              {availableYears.map((year) => (
                <option key={year}>{year}</option>
              ))}
            </select>
          </div>

          <button
            onClick={exportPDF}
            disabled={exportingPDF}
            className="flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 font-medium text-white transition-all duration-300 hover:bg-emerald-800 hover:shadow-lg"
          >
            <Download className="h-5 w-5" aria-hidden />
            {exportingPDF ? 'Exportando PDF...' : 'Exportar PDF'}
          </button>

          <button
            onClick={exportExcel}
            disabled={exportingExcel}
            className="flex items-center gap-2 rounded-xl bg-slate-800 px-5 py-3 font-medium text-white transition-all duration-300 hover:bg-slate-900 hover:shadow-lg"
          >
            <Download className="h-5 w-5" aria-hidden />
            {exportingExcel ? 'Exportando Excel...' : 'Exportar Excel'}
          </button>

          <button
            onClick={csvExport}
            className="flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 font-medium text-slate-700 transition-all duration-300 hover:bg-slate-50"
          >
            <Download className="h-5 w-5" aria-hidden />
            Exportar CSV
          </button>
        </div>
      </div>

      <motion.section
        initial={shouldReduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.16 }}
        className="rounded-2xl border border-slate-200 bg-slate-900 p-8 text-white shadow-xl"
      >
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="mb-2 text-2xl font-bold capitalize">Reporte {periodLabel}</h2>
            <p className="text-slate-300">Comision Estatal de Derechos Humanos de Baja California</p>
          </div>
          <FileText className="h-14 w-14 text-slate-400" aria-hidden />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: 'Total Ingresos', value: reportData.enPeriodo.length },
            { label: 'Resueltos', value: reportData.resueltos },
            { label: 'Pendientes', value: reportData.pendientes },
            { label: 'Tasa Resolucion', value: `${reportData.tasaResolucion}%` },
          ].map((item) => (
            <article key={item.label} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
              <p className="text-sm text-slate-400">{item.label}</p>
              <p className="text-3xl font-bold">{item.value}</p>
            </article>
          ))}
        </div>
      </motion.section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="interactive-surface gpu-smooth rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-600" aria-hidden />
            <h3 className="text-xl font-bold text-slate-900">Tendencia de Casos</h3>
          </div>
          {hasMonthlyMovement ? (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={reportData.monthly} barCategoryGap="28%">
                  <CartesianGrid strokeDasharray="3 6" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="mes" stroke="#64748b" axisLine={false} tickLine={false} tickMargin={10} />
                  <YAxis stroke="#64748b" axisLine={false} tickLine={false} tickMargin={8} allowDecimals={false} width={36} />
                  <Tooltip
                    isAnimationActive={false}
                    content={<ReportBarTooltip />}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    cursor={{ fill: '#f1f5f9', fillOpacity: 0.6 }}
                    wrapperStyle={{ pointerEvents: 'none' }}
                  />
                  <Bar
                    dataKey="ingresos"
                    fill="#2563eb"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={chartAnimationEnabled}
                    animationDuration={680}
                    animationEasing="ease-in-out"
                  />
                  <Bar
                    dataKey="resueltos"
                    fill="#059669"
                    radius={[8, 8, 0, 0]}
                    maxBarSize={36}
                    isAnimationActive={chartAnimationEnabled}
                    animationDuration={680}
                    animationEasing="ease-in-out"
                  />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 flex items-center justify-center gap-6 text-sm">
                <span className="inline-flex items-center gap-2 text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-600" />
                  ingresos
                </span>
                <span className="inline-flex items-center gap-2 text-slate-700">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
                  resueltos
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/80 text-center">
              <TrendingUp className="mb-3 h-8 w-8 text-slate-400" aria-hidden />
              <p className="text-sm font-semibold text-slate-700">Sin movimiento en el periodo seleccionado</p>
              <p className="mt-1 text-xs text-slate-500">Cambia el periodo o registra nuevos expedientes para ver la tendencia.</p>
            </div>
          )}
        </section>

        <section className="interactive-surface gpu-smooth rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
          <div className="mb-4 flex items-center gap-2">
            <PieIcon className="h-5 w-5 text-purple-600" aria-hidden />
            <h3 className="text-xl font-bold text-slate-900">Distribucion por Estado</h3>
          </div>
          {reportData.byEstado.length === 0 ? (
            <div className="flex h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/80 text-center">
              <AlertCircle className="mb-3 h-8 w-8 text-slate-400" aria-hidden />
              <p className="text-sm font-semibold text-slate-700">Sin estados para este periodo</p>
              <p className="mt-1 text-xs text-slate-500">No hay expedientes para construir la distribucion.</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={reportData.byEstado}
                    dataKey="value"
                    cx="50%"
                    cy="50%"
                    outerRadius={96}
                    innerRadius={56}
                    paddingAngle={2}
                    cornerRadius={6}
                    isAnimationActive={chartAnimationEnabled}
                    animationDuration={680}
                    animationEasing="ease-in-out"
                  >
                    {reportData.byEstado.map((entry, index) => (
                      <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                    <Label
                      position="center"
                      content={({ viewBox }) => {
                        const pieViewBox = viewBox as { cx?: number; cy?: number } | undefined
                        const cx = typeof pieViewBox?.cx === 'number' ? pieViewBox.cx : 0
                        const cy = typeof pieViewBox?.cy === 'number' ? pieViewBox.cy : 0
                        return (
                          <g>
                            <text x={cx} y={cy - 2} textAnchor="middle" fill="#0f172a" fontSize={24} fontWeight={700}>
                              {estadoTotal}
                            </text>
                            <text x={cx} y={cy + 16} textAnchor="middle" fill="#64748b" fontSize={11}>
                              total
                            </text>
                          </g>
                        )
                      }}
                    />
                  </Pie>
                  <Tooltip
                    isAnimationActive={false}
                    content={<ReportPieTooltip />}
                    contentStyle={CHART_TOOLTIP_STYLE}
                    wrapperStyle={{ pointerEvents: 'none' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {reportData.byEstado.map((item, index) => {
                  const pct = estadoTotal > 0 ? Math.round((item.value / estadoTotal) * 100) : 0
                  return (
                    <div key={item.name} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <span className="inline-flex items-center gap-2 text-slate-700">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                        {item.name}
                      </span>
                      <span className="font-semibold text-slate-900">{pct}%</span>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white shadow-lg">
        <div className="border-b border-slate-200 px-6 py-4">
          <h3 className="text-lg font-bold text-slate-900">Detalle del Periodo</h3>
          <p className="text-sm text-slate-500">Listado de expedientes considerados en el reporte</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {['Folio', 'Fecha', 'Derecho', 'Visitador', 'Estado'].map((head) => (
                  <th key={head} scope="col" className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reportData.enPeriodo.slice(0, 40).map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono font-semibold text-blue-700">{item.folio}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(item.fecha_presentacion)}</td>
                  <td className="px-4 py-3 text-slate-700">{item.tipo_derecho}</td>
                  <td className="px-4 py-3 text-slate-700">{item.visitador_asignado}</td>
                  <td className="px-4 py-3 text-slate-700">{item.estado}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
