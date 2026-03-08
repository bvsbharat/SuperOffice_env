import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts'
import { useStore } from '../store/useStore'

export function RewardPanel() {
  const globalReward = useStore(s => s.globalReward)
  const cooperationScore = useStore(s => s.cooperationScore)
  const episodeHistory = useStore(s => s.episodeHistory)
  const kpiHistory = useStore(s => s.kpiHistory)
  const done = useStore(s => s.done)

  const bestReward = episodeHistory.length > 0
    ? Math.max(...episodeHistory.map(e => e.global_reward))
    : null

  const rewardHistory = kpiHistory.slice(-24).map((_, i) => ({
    i,
    r: globalReward * ((i + 1) / Math.max(kpiHistory.length, 1)),
  }))

  const coopPct = Math.round(cooperationScore * 100)

  return (
    <div className="flex flex-col gap-3 h-full px-2 py-2">
      {/* Global reward */}
      <div className="rounded-lg p-3 shadow-sm" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
        <div className="text-[9px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-faint)' }}>Global Reward</div>
        <div className={`text-2xl font-bold font-mono ${globalReward >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {globalReward >= 0 ? '+' : ''}{globalReward.toFixed(4)}
        </div>
        {bestReward !== null && (
          <div className="text-[9px] mt-0.5" style={{ color: 'var(--color-text-faint)' }}>
            Best: <span className="text-amber-600">{bestReward >= 0 ? '+' : ''}{bestReward.toFixed(3)}</span>
          </div>
        )}
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

      {/* Cooperation score */}
      <div className="rounded-lg p-3 shadow-sm" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
        <div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-faint)' }}>Cooperation Score</div>
        <div className="flex items-center gap-2 mb-1.5">
          <div className="text-xl font-bold font-mono text-blue-600">{coopPct}%</div>
        </div>
        {/* Progress bar */}
        <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-card-bg)' }}>
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${coopPct}%`,
              background: coopPct > 70 ? '#16a34a' : coopPct > 40 ? '#2563eb' : '#dc2626',
            }}
          />
        </div>
        <div className="text-[9px] mt-1" style={{ color: 'var(--color-text-faint)' }}>
          {coopPct > 70 ? 'Excellent sync' : coopPct > 40 ? 'Good collaboration' : 'Low coordination'}
        </div>
      </div>

      {/* Episode history */}
      {episodeHistory.length > 0 && (
        <div className="rounded-lg p-3 shadow-sm" style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}>
          <div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-faint)' }}>Episode History</div>
          <div className="space-y-1">
            {episodeHistory.slice(-5).reverse().map(ep => (
              <div key={ep.episode} className="flex items-center justify-between text-[10px]">
                <span className="font-mono" style={{ color: 'var(--color-text-faint)' }}>EP{ep.episode}</span>
                <span className={`font-mono font-semibold ${ep.global_reward >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                  {ep.global_reward >= 0 ? '+' : ''}{ep.global_reward.toFixed(3)}
                </span>
                <span style={{ color: 'var(--color-text-faint)' }}>{Math.round(ep.cooperation_score * 100)}% coop</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {done && (
        <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-lg p-3 text-center">
          <div className="text-sm font-bold text-indigo-700 dark:text-indigo-400">Episode Complete</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-muted)' }}>Press Reset to start a new episode</div>
        </div>
      )}
    </div>
  )
}
