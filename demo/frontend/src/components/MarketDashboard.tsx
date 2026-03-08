import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useStore } from '../store/useStore'

function KpiTile({ label, value, prev, format, lowerIsBetter = false }: {
  label: string
  value: number
  prev: number
  format: (v: number) => string
  lowerIsBetter?: boolean
}) {
  const delta = value - prev
  const pct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : 0
  const isGood = lowerIsBetter ? delta <= 0 : delta >= 0

  return (
    <div className="rounded-lg p-3 shadow-sm" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-faint)' }}>{label}</div>
      <div className="text-lg font-bold font-mono" style={{ color: 'var(--color-text-primary)' }}>{format(value)}</div>
      {prev !== 0 && (
        <div className={`text-[10px] font-mono mt-0.5 ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
          {delta >= 0 ? '\u25B2' : '\u25BC'} {Math.abs(pct).toFixed(1)}%
        </div>
      )}
    </div>
  )
}

const fmt = {
  dollar: (v: number) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0)}`,
  pct:    (v: number) => `${(v * 100).toFixed(1)}%`,
  int:    (v: number) => v.toFixed(0),
  score:  (v: number) => v.toFixed(0),
  decimal:(v: number) => v.toFixed(2),
}

export function MarketDashboard() {
  const kpis = useStore(s => s.kpis)
  const kpiHistory = useStore(s => s.kpiHistory)
  const pipeline = useStore(s => s.pipeline)
  const features = useStore(s => s.features)

  const prev = kpiHistory.length >= 2 ? kpiHistory[kpiHistory.length - 2] : kpis
  const chartData = kpiHistory.slice(-30)

  // Pipeline funnel
  const stageCounts: Record<string, number> = {}
  for (const c of pipeline) {
    stageCounts[c.stage] = (stageCounts[c.stage] || 0) + 1
  }

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto pr-1">
      {/* Revenue KPIs */}
      <div className="grid grid-cols-3 gap-2">
        <KpiTile label="Revenue"     value={kpis.revenue}          prev={prev.revenue}          format={fmt.dollar} />
        <KpiTile label="Total Rev"   value={kpis.total_revenue}    prev={prev.total_revenue}    format={fmt.dollar} />
        <KpiTile label="Pipeline"    value={kpis.pipeline_value}   prev={prev.pipeline_value}   format={fmt.dollar} />
        <KpiTile label="Traffic"     value={kpis.website_traffic}  prev={prev.website_traffic}  format={fmt.int} />
        <KpiTile label="Conv Rate"   value={kpis.conversion_rate}  prev={prev.conversion_rate}  format={fmt.pct} />
        <KpiTile label="Brand"       value={kpis.brand_awareness}  prev={prev.brand_awareness}  format={fmt.score} />
      </div>

      {/* Product & Ops */}
      <div className="grid grid-cols-3 gap-2">
        <KpiTile label="Features"    value={kpis.features_shipped}   prev={prev.features_shipped}   format={fmt.int} />
        <KpiTile label="Stability"   value={kpis.product_stability}  prev={prev.product_stability}  format={fmt.pct} />
        <KpiTile label="NPS"         value={kpis.nps_score}          prev={prev.nps_score}          format={fmt.score} />
        <KpiTile label="Budget"      value={kpis.budget_remaining}   prev={prev.budget_remaining}   format={fmt.dollar} />
        <KpiTile label="Content"     value={kpis.content_published}  prev={prev.content_published}  format={fmt.int} />
        <KpiTile label="Campaigns"   value={kpis.active_campaigns}   prev={prev.active_campaigns}   format={fmt.int} />
      </div>

      {/* Revenue chart */}
      {chartData.length > 1 && (
        <div className="rounded-lg p-3 shadow-sm" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-faint)' }}>Total Revenue</div>
          <ResponsiveContainer width="100%" height={90}>
            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2,4" stroke="var(--color-card-bg)" />
              <XAxis dataKey="step" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={36} />
              <Tooltip
                contentStyle={{ background: 'var(--color-tooltip-bg)', border: '1px solid var(--color-tooltip-border)', borderRadius: 6, fontSize: 10, color: 'var(--color-text-primary)' }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, 'Total Revenue']}
                labelFormatter={l => `Step ${l}`}
              />
              <Area type="monotone" dataKey="total_revenue" stroke="#6366f1" fill="url(#revGrad)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Traffic + NPS line chart */}
      {chartData.length > 1 && (
        <div className="rounded-lg p-3 shadow-sm" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-faint)' }}>Traffic & NPS</div>
          <ResponsiveContainer width="100%" height={70}>
            <LineChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2,4" stroke="var(--color-card-bg)" />
              <XAxis dataKey="step" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--color-tooltip-bg)', border: '1px solid var(--color-tooltip-border)', borderRadius: 6, fontSize: 10, color: 'var(--color-text-primary)' }}
              />
              <Line type="monotone" dataKey="website_traffic" stroke="#16a34a" strokeWidth={1.5} dot={false} name="Traffic" isAnimationActive={false} />
              <Line type="monotone" dataKey="nps_score" stroke="#d97706" strokeWidth={1.5} dot={false} name="NPS" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Pipeline funnel */}
      {Object.keys(stageCounts).length > 0 && (
        <div className="rounded-lg p-3 shadow-sm" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-faint)' }}>Pipeline</div>
          <div className="space-y-1">
            {Object.entries(stageCounts).map(([stage, count]) => (
              <div key={stage} className="flex items-center gap-2 text-[10px]">
                <span className="w-20 truncate font-mono" style={{ color: 'var(--color-text-muted)' }}>{stage}</span>
                <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-card-bg)' }}>
                  <div className="h-full rounded-full" style={{ width: `${Math.min(count * 20, 100)}%`, background: '#6366f1' }} />
                </div>
                <span className="font-mono font-bold" style={{ color: 'var(--color-text-secondary)' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Feature progress */}
      {features.length > 0 && (
        <div className="rounded-lg p-3 shadow-sm" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-faint)' }}>Features</div>
          <div className="space-y-1">
            {features.slice(-6).map((f, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className={`w-2 h-2 rounded-full ${f.shipped ? 'bg-emerald-500' : 'bg-amber-400'}`} />
                <span className="truncate" style={{ color: 'var(--color-text-muted)' }}>{f.name}</span>
                {!f.shipped && <span className="ml-auto font-mono text-amber-600">{f.turns_remaining}t</span>}
                {f.shipped && <span className="ml-auto text-emerald-600 font-bold">SHIPPED</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
