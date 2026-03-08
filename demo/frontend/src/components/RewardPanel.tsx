import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts'
import { useStore } from '../store/useStore'
import { AGENT_ORDER } from '../types'

export function RewardPanel() {
  const globalReward = useStore(s => s.globalReward)
  const rewardTotals = useStore(s => s.rewardTotals)
  const kpiHistory = useStore(s => s.kpiHistory)
  const done = useStore(s => s.done)
  const agents = useStore(s => s.agents)

  // Per-agent reward bars
  const agentRewardData = AGENT_ORDER.map(id => ({
    name: agents[id]?.emoji ? `${agents[id].emoji}` : id.slice(0, 3).toUpperCase(),
    reward: rewardTotals[id] || 0,
    fill: (rewardTotals[id] || 0) >= 0 ? '#22c55e' : '#ef4444',
  }))

  const rewardHistory = kpiHistory.slice(-30).map((_, i) => ({
    i,
    r: globalReward * ((i + 1) / Math.max(kpiHistory.length, 1)),
  }))

  return (
    <div className="flex flex-col gap-3 h-full px-2 py-2">
      {/* Global reward */}
      <div className="rounded-lg p-3 shadow-sm" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
        <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-faint)' }}>Global Reward</div>
        <div className={`text-2xl font-bold font-mono ${globalReward >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {globalReward >= 0 ? '+' : ''}{globalReward.toFixed(3)}
        </div>
        {rewardHistory.length > 2 && (
          <div className="mt-2 h-10">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rewardHistory}>
                <Line type="monotone" dataKey="r" stroke="#6366f1" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                <Tooltip
                  contentStyle={{ background: 'var(--color-tooltip-bg)', border: '1px solid var(--color-tooltip-border)', fontSize: 9, color: 'var(--color-text-primary)' }}
                  formatter={(v: number) => [v.toFixed(3), 'Reward']}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Per-agent reward totals */}
      <div className="rounded-lg p-3 shadow-sm" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
        <div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-faint)' }}>Agent Rewards</div>
        {agentRewardData.length > 0 && (
          <ResponsiveContainer width="100%" height={100}>
            <BarChart data={agentRewardData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2,4" stroke="var(--color-card-bg)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 8, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={30} />
              <Tooltip
                contentStyle={{ background: 'var(--color-tooltip-bg)', border: '1px solid var(--color-tooltip-border)', fontSize: 10, color: 'var(--color-text-primary)' }}
                formatter={(v: number) => [v.toFixed(2), 'Reward']}
              />
              <Bar dataKey="reward" radius={[2, 2, 0, 0]}>
                {agentRewardData.map((entry, idx) => (
                  <rect key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="mt-1 space-y-0.5">
          {AGENT_ORDER.map(id => (
            <div key={id} className="flex items-center justify-between text-[10px]">
              <span className="font-mono" style={{ color: agents[id]?.color || 'var(--color-text-faint)' }}>
                {agents[id]?.name || id}
              </span>
              <span className={`font-mono font-semibold ${(rewardTotals[id] || 0) >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {(rewardTotals[id] || 0) >= 0 ? '+' : ''}{(rewardTotals[id] || 0).toFixed(2)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {done && (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 text-center">
          <div className="text-sm font-bold text-indigo-700 dark:text-indigo-400">Episode Complete</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Press Reset to start a new episode</div>
        </div>
      )}
    </div>
  )
}
