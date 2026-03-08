import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useStore } from '../store/useStore'

function KpiTile({ label, value, prev, format }: {
  label: string
  value: number
  prev: number
  format: (v: number) => string
}) {
  const delta = value - prev
  const pct = prev !== 0 ? (delta / Math.abs(prev)) * 100 : 0
  // For CAC and burn_rate, lower is better
  const lowerIsBetter = label === 'CAC' || label === 'Burn Rate'
  const isGood = lowerIsBetter ? delta <= 0 : delta >= 0

  return (
    <div className="rounded-lg p-3 shadow-sm" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
      <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-faint)' }}>{label}</div>
      <div className="text-lg font-bold font-mono" style={{ color: 'var(--color-text-primary)' }}>{format(value)}</div>
      <div className={`text-[10px] font-mono mt-0.5 ${isGood ? 'text-emerald-600' : 'text-red-500'}`}>
        {delta >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
      </div>
    </div>
  )
}

const fmt = {
  dollar: (v: number) => `$${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v.toFixed(0)}`,
  pct:    (v: number) => `${(v * 100).toFixed(1)}%`,
  int:    (v: number) => v.toFixed(0),
  score:  (v: number) => v.toFixed(0),
}

export function MarketDashboard() {
  const kpis = useStore(s => s.kpis)
  const kpiHistory = useStore(s => s.kpiHistory)
  const agents = useStore(s => s.agents)

  const prev = kpiHistory.length >= 2 ? kpiHistory[kpiHistory.length - 2] : kpis
  const chartData = kpiHistory.slice(-24)

  // MQL per agent (approximate from conversations)
  const agentMqlData = (['marketing', 'scene', 'hr', 'sales'] as const).map(id => ({
    name: agents[id]?.emoji ?? id,
    mql: agents[id]?.reward_history.length ?? 0,
  }))

  return (
    <div className="flex flex-col gap-3 h-full overflow-y-auto pr-1">
      {/* KPI tiles */}
      <div className="grid grid-cols-3 gap-2">
        <KpiTile label="MRR"       value={kpis.mrr}       prev={prev.mrr}       format={fmt.dollar} />
        <KpiTile label="MQL"       value={kpis.mql}       prev={prev.mql}       format={fmt.int}    />
        <KpiTile label="CAC"       value={kpis.cac}       prev={prev.cac}       format={fmt.dollar} />
        <KpiTile label="Win Rate"  value={kpis.win_rate}  prev={prev.win_rate}  format={fmt.pct}    />
        <KpiTile label="NPS"       value={kpis.nps}       prev={prev.nps}       format={fmt.score}  />
        <KpiTile label="Burn Rate" value={kpis.burn_rate} prev={prev.burn_rate} format={fmt.dollar} />
      </div>

      {/* MRR area chart */}
      {chartData.length > 1 && (
        <div className="rounded-lg p-3 shadow-sm" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-faint)' }}>MRR Over Steps</div>
          <ResponsiveContainer width="100%" height={90}>
            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2,4" stroke="var(--color-card-bg)" />
              <XAxis dataKey="step" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} width={36} />
              <Tooltip
                contentStyle={{ background: 'var(--color-tooltip-bg)', border: '1px solid var(--color-tooltip-border)', borderRadius: 6, fontSize: 10, color: 'var(--color-text-primary)' }}
                formatter={(v: number) => [`$${v.toLocaleString()}`, 'MRR']}
                labelFormatter={l => `Step ${l}`}
              />
              <Area type="monotone" dataKey="mrr" stroke="#6366f1" fill="url(#mrrGrad)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Win Rate + NPS line chart */}
      {chartData.length > 1 && (
        <div className="rounded-lg p-3 shadow-sm" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-faint)' }}>Win Rate & NPS</div>
          <ResponsiveContainer width="100%" height={70}>
            <LineChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2,4" stroke="var(--color-card-bg)" />
              <XAxis dataKey="step" tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: 'var(--color-tooltip-bg)', border: '1px solid var(--color-tooltip-border)', borderRadius: 6, fontSize: 10, color: 'var(--color-text-primary)' }}
              />
              <Line type="monotone" dataKey="win_rate" stroke="#16a34a" strokeWidth={1.5} dot={false} name="Win Rate" isAnimationActive={false} />
              <Line type="monotone" dataKey="nps" stroke="#d97706" strokeWidth={1.5} dot={false} name="NPS" isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
