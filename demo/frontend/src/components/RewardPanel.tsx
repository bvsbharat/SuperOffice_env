import { useState } from 'react'
import { createPortal } from 'react-dom'
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from 'recharts'
import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, ClipboardList, Search, BookOpen, X, Maximize, Medal, Target, Ruler, Handshake, BarChart3, AlertTriangle, Microscope } from 'lucide-react'
import { useStore } from '../store/useStore'
import { AGENT_ORDER, agentIconPath } from '../types'
import type { AgentId } from '../types'

function downloadFile(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function RewardPanel() {
  const globalReward = useStore(s => s.globalReward)
  const rewardTotals = useStore(s => s.rewardTotals)
  const kpiHistory = useStore(s => s.kpiHistory)
  const done = useStore(s => s.done)
  const agents = useStore(s => s.agents)
  const conversations = useStore(s => s.conversations)
  const episode = useStore(s => s.episode)
  const currentModel = useStore(s => s.currentModel)
  const theme = useStore(s => s.theme)

  const isDark = theme === 'dark'
  const axisTickColor = isDark ? '#f8f8f2' : '#94a3b8'
  const gridColor = isDark ? 'rgba(248,248,242,0.08)' : 'rgba(226,232,240,0.6)'
  const lineStroke = isDark ? '#ae81ff' : '#6366f1'

  const [expandedAgent, setExpandedAgent] = useState<AgentId | null>(null)
  const [allExpanded, setAllExpanded] = useState(false)

  function toggleExpandAll() {
    setAllExpanded(v => !v)
    setExpandedAgent(null)
  }
  const kpis = useStore(s => s.kpis)
  const pipeline = useStore(s => s.pipeline)

  const [fullView, setFullView] = useState(false)
  const [fullTab, setFullTab] = useState<'logs' | 'scoring' | 'guide' | 'validate'>('scoring')
  const [fullFilter, setFullFilter] = useState<AgentId | 'all'>('all')

  // Rubric validation state
  const [validating, setValidating] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [validation, setValidation] = useState<{
    overall_score: number
    grade: string
    summary: string
    strengths: { title: string; detail: string; principle: string }[]
    gaps: { title: string; detail: string; severity: string; principle: string }[]
    recommendations: { title: string; detail: string; priority: string; impact: string }[]
  } | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validatedBy, setValidatedBy] = useState<string | null>(null)

  async function runValidation() {
    setValidating(true)
    setValidationError(null)
    setValidation(null)
    setStreamText('')
    try {
      const res = await fetch('/api/validate-rubric', { method: 'POST' })
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || `HTTP ${res.status}`)
      }
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response body')
      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6).trim()
          if (!payload) continue
          try {
            const evt = JSON.parse(payload)
            if (evt.type === 'chunk') {
              accumulated += evt.text
              setStreamText(accumulated)
            } else if (evt.type === 'done') {
              setValidation(evt.result)
              setValidatedBy(evt.result?.validated_by ?? null)
            } else if (evt.type === 'error') {
              throw new Error(evt.detail)
            }
          } catch (pe: any) {
            if (pe.message && !pe.message.includes('Unexpected')) throw pe
          }
        }
      }
    } catch (e: any) {
      setValidationError(e.message)
    } finally {
      setValidating(false)
    }
  }

  // Build flat log of all action entries with reward
  const allActionLogs = conversations
    .filter(m => m.msg_type === 'action')
    .map(m => {
      const [actionPart, ...outcomeParts] = m.text.split(' | ')
      return {
        step: m.step,
        agent: m.from_agent,
        agentName: agents[m.from_agent as AgentId]?.name || m.from_agent,
        action: actionPart,
        outcome: outcomeParts.join(' | '),
        reward: m.reward ?? 0,
      }
    })

  function downloadCSV() {
    const header = 'step,agent,action,outcome,reward\n'
    const rows = allActionLogs.map(r =>
      `${r.step},"${r.agentName}","${r.action}","${r.outcome.replace(/"/g, '""')}",${r.reward}`
    ).join('\n')
    downloadFile(header + rows, `reward-log-ep${episode}.csv`, 'text/csv')
  }

  function downloadJSON() {
    const data = {
      episode,
      model: currentModel,
      globalReward,
      rewardTotals,
      actions: allActionLogs,
    }
    downloadFile(JSON.stringify(data, null, 2), `reward-log-ep${episode}.json`, 'application/json')
  }

  // Per-agent reward bars — keep agent id so custom tick can look up icon
  const agentRewardData = AGENT_ORDER.map(id => ({
    id,
    reward: rewardTotals[id] || 0,
    color: agents[id]?.color || '#64748b',
  }))

  // Custom XAxis tick: renders circular agent avatar image
  const AgentIconTick = ({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) => {
    const agentId = payload?.value as AgentId
    const agent = agents[agentId]
    const color = agent?.color || '#64748b'
    const size = 20
    const cx = (x ?? 0) - size / 2
    const cy = (y ?? 0) + 4
    return (
      <g>
        <defs>
          <clipPath id={`clip-${agentId}`}>
            <circle cx={cx + size / 2} cy={cy + size / 2} r={size / 2} />
          </clipPath>
        </defs>
        <circle cx={cx + size / 2} cy={cy + size / 2} r={size / 2 + 1.5} fill={color} opacity={0.7} />
        <image
          href={agentIconPath(agentId)}
          x={cx}
          y={cy}
          width={size}
          height={size}
          clipPath={`url(#clip-${agentId})`}
          preserveAspectRatio="xMidYMid slice"
        />
      </g>
    )
  }

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
                <CartesianGrid strokeDasharray="2,4" stroke={gridColor} vertical={false} />
                <YAxis hide tick={{ fontSize: 7, fill: axisTickColor }} tickLine={false} axisLine={false} width={0} />
                <Line type="monotone" dataKey="r" stroke={lineStroke} strokeWidth={2} dot={false} isAnimationActive={false} />
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
        <div className="flex items-center mb-2">
          <span className="text-[9px] uppercase tracking-wider flex-1" style={{ color: 'var(--color-text-faint)' }}>Agent Rewards</span>
          <div className="flex items-center gap-1">
            {/* Expand / Collapse all agents */}
            <button
              onClick={toggleExpandAll}
              title={allExpanded ? 'Collapse all agents' : 'Expand all agents'}
              style={{ padding: '2px 6px', fontSize: 9, fontWeight: 600, borderRadius: 3, border: `1px solid ${allExpanded ? '#6366f1' : 'var(--color-border)'}`, background: allExpanded ? '#6366f112' : 'var(--color-card-bg)', color: allExpanded ? '#6366f1' : 'var(--color-text-secondary)', cursor: 'pointer' }}
            >
              {allExpanded ? '▴ Collapse' : '▾ Expand'}
            </button>
            {/* Expand full view */}
            <button
              onClick={() => setFullView(true)}
              title="Expand full log view"
              style={{ padding: '2px 6px', fontSize: 9, fontWeight: 600, borderRadius: 3, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)', color: 'var(--color-text-secondary)', cursor: 'pointer' }}
            >
              <Maximize size={9} className="inline mr-0.5" /> Full
            </button>
            {/* Download CSV */}
            <button
              onClick={downloadCSV}
              title="Download reward log as CSV"
              style={{ padding: '2px 6px', fontSize: 9, fontWeight: 600, borderRadius: 3, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)', color: '#22c55e', cursor: 'pointer' }}
            >
              ↓ CSV
            </button>
            {/* Download JSON */}
            <button
              onClick={downloadJSON}
              title="Download reward log as JSON"
              style={{ padding: '2px 6px', fontSize: 9, fontWeight: 600, borderRadius: 3, border: '1px solid var(--color-border)', background: 'var(--color-card-bg)', color: '#6366f1', cursor: 'pointer' }}
            >
              ↓ JSON
            </button>
          </div>
        </div>
        {agentRewardData.length > 0 && (
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={agentRewardData} margin={{ top: 0, right: 0, left: 0, bottom: 28 }}>
              <CartesianGrid strokeDasharray="2,4" stroke={gridColor} vertical={false} />
              <XAxis
                dataKey="id"
                tick={AgentIconTick as any}
                tickLine={false}
                axisLine={false}
                interval={0}
                height={32}
              />
              <YAxis tick={{ fontSize: 8, fill: axisTickColor }} tickLine={false} axisLine={false} width={28} />
              <Tooltip
                contentStyle={{ background: 'var(--color-tooltip-bg)', border: '1px solid var(--color-tooltip-border)', fontSize: 10, color: 'var(--color-text-primary)', borderRadius: 6 }}
                formatter={(v: number, _: string, props: any) => {
                  const id = props.payload?.id as string
                  const name = id && id in agents ? agents[id as AgentId]?.name : id
                  return [v.toFixed(2), name]
                }}
                cursor={{ fill: 'var(--color-border)' }}
              />
              <Bar dataKey="reward" radius={[3, 3, 0, 0]} maxBarSize={24}>
                {agentRewardData.map((entry) => (
                  <Cell
                    key={entry.id}
                    fill={entry.reward >= 0 ? '#a6e22e' : '#f92672'}
                    opacity={0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="mt-2 space-y-1">
          {AGENT_ORDER.map(id => {
            const agent = agents[id]
            const reward = rewardTotals[id] || 0
            const color = agent?.color || 'var(--color-text-faint)'
            const isPositive = reward >= 0
            const isExpanded = allExpanded || expandedAgent === id

            // Action history: action-type messages carry embedded reward from backend
            const agentActions = conversations
              .filter(m => m.from_agent === id && m.msg_type === 'action')
              .slice(-20)
              .reverse()

            // Reward sparkline data (per-action rewards from reward_history)
            const rewardHist = agent?.reward_history ?? []
            const maxAbs = Math.max(...AGENT_ORDER.map(a => Math.abs(rewardTotals[a] || 0)), 1)

            // Running totals for sparkline (cumulative sum)
            const sparkData = rewardHist.slice(-20).reduce<{ i: number; v: number }[]>((acc, r, i) => {
              const prev = acc[i - 1]?.v ?? 0
              acc.push({ i, v: +(prev + r).toFixed(3) })
              return acc
            }, [])

            return (
              <div key={id} className="rounded overflow-hidden w-full min-w-0" style={{ border: `1px solid ${isExpanded ? color + '40' : 'var(--color-border)'}`, transition: 'border-color 0.2s' }}>
                {/* Agent row — click to expand */}
                <button
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-left transition-colors"
                  style={{ background: isExpanded ? `${color}10` : 'var(--color-card-bg)' }}
                  onClick={() => {
                    if (allExpanded) {
                      // Clicking in all-expanded mode collapses all except this one
                      setAllExpanded(false)
                      setExpandedAgent(id as AgentId)
                    } else {
                      setExpandedAgent(expandedAgent === id ? null : id as AgentId)
                    }
                  }}
                >
                  <img
                    src={agentIconPath(id as AgentId)}
                    alt={id}
                    className="w-5 h-5 rounded-full object-cover shrink-0"
                    style={{ outline: `1.5px solid ${color}` }}
                  />
                  <span className="font-mono font-semibold text-[10px] flex-1 truncate" style={{ color }}>
                    {agent?.name || id}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-14 h-1 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(Math.abs(reward) / maxAbs * 100, 100)}%`,
                          background: isPositive ? '#a6e22e' : '#f92672',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                    <span className="font-mono font-bold text-[10px] w-11 text-right" style={{ color: isPositive ? '#a6e22e' : '#f92672' }}>
                      {isPositive ? '+' : ''}{reward.toFixed(2)}
                    </span>
                    <span className="text-[9px] ml-0.5" style={{ color: 'var(--color-text-faint)', transform: isExpanded ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>
                      ▾
                    </span>
                  </div>
                </button>

                {/* Expandable action history */}
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      style={{ overflow: 'hidden', width: '100%' }}
                    >
                      <div className="px-2 pb-2 pt-1 space-y-1 w-full min-w-0" style={{ borderTop: `1px solid ${color}22`, background: `${color}06` }}>

                        {/* Header row: action count + cumulative reward */}
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[8px] uppercase tracking-widest" style={{ color: 'var(--color-text-faint)' }}>
                            Action History · {agentActions.length} actions
                          </span>
                          <span className="text-[9px] font-mono font-bold" style={{ color: reward >= 0 ? '#a6e22e' : '#f92672' }}>
                            total {reward >= 0 ? '+' : ''}{reward.toFixed(2)}
                          </span>
                        </div>

                        {agentActions.length === 0 ? (
                          <div className="text-[10px] italic" style={{ color: 'var(--color-text-faint)' }}>No actions recorded yet</div>
                        ) : (
                          agentActions.slice(0, 12).map((msg, i) => {
                            // reward is now embedded directly in each action message
                            const delta = msg.reward ?? 0
                            const deltaPos = delta >= 0

                            // Split "action label | outcome" format from backend
                            const [actionPart, ...outcomeParts] = msg.text.split(' | ')
                            const outcome = outcomeParts.join(' | ')

                            return (
                              <div
                                key={`${msg.step}-${i}`}
                                className="rounded px-1.5 py-1 w-full min-w-0 overflow-hidden"
                                style={{
                                  background: 'var(--color-card-bg)',
                                  border: `1px solid ${deltaPos ? 'rgba(166,226,46,0.15)' : 'rgba(249,38,114,0.15)'}`,
                                }}
                              >
                                <div className="flex items-center gap-1.5 w-full min-w-0">
                                  {/* Step badge */}
                                  <span
                                    className="text-[8px] font-mono font-bold px-1 py-0.5 rounded shrink-0"
                                    style={{ background: `${color}20`, color }}
                                  >
                                    t{msg.step}
                                  </span>
                                  {/* Action label */}
                                  <span className="text-[10px] font-semibold flex-1 min-w-0 truncate" style={{ color: 'var(--color-text-primary)' }}>
                                    {actionPart}
                                  </span>
                                  {/* Reward delta pill */}
                                  <span
                                    className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0"
                                    style={{
                                      background: deltaPos ? 'rgba(166,226,46,0.15)' : 'rgba(249,38,114,0.15)',
                                      color: deltaPos ? '#a6e22e' : '#f92672',
                                    }}
                                  >
                                    {deltaPos ? '+' : ''}{delta.toFixed(2)}
                                  </span>
                                </div>
                                {/* Outcome detail */}
                                {outcome && (
                                  <div className="text-[9px] mt-0.5 w-full min-w-0 overflow-hidden" style={{ color: 'var(--color-text-muted)', wordBreak: 'break-word' }}>
                                    {outcome}
                                  </div>
                                )}
                              </div>
                            )
                          })
                        )}

                        {/* Cumulative reward sparkline */}
                        {sparkData.length > 2 && (
                          <div className="mt-2 h-10">
                            <ResponsiveContainer width="100%" height="100%">
                              <LineChart data={sparkData}>
                                <CartesianGrid strokeDasharray="2,4" stroke={gridColor} vertical={false} />
                                <YAxis hide />
                                <Line type="monotone" dataKey="v" stroke={isDark ? '#f8f8f2' : color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      </div>

      {done && (
        <div className="rounded-lg p-3 text-center" style={{ background: 'rgba(166,226,46,0.07)', border: '1px solid rgba(166,226,46,0.25)' }}>
          <div className="text-sm font-bold" style={{ color: '#a6e22e' }}>Episode Complete</div>
          <div className="text-[10px] mt-0.5" style={{ color: 'var(--color-text-primary)' }}>Press Reset to start a new episode</div>
        </div>
      )}

      {/* Full-screen reward modal — fixed dark theme regardless of app theme */}
      {fullView && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 99999, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: '100%', maxWidth: 1200, height: '92vh', maxHeight: '92vh', display: 'flex', flexDirection: 'column', background: 'var(--color-panel)', margin: '0 auto', borderRadius: 12, boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px var(--color-border)', overflow: 'hidden' }}>

            {/* ── Modal header ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-primary)' }}>Reward Analysis</span>
              <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>
                Episode {episode} · {allActionLogs.length} actions · global{' '}
                <span style={{ color: globalReward >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>
                  {globalReward >= 0 ? '+' : ''}{globalReward.toFixed(3)}
                </span>
              </span>
              <div style={{ flex: 1 }} />
              {([['scoring', 'Scoring', Trophy] as const, ['logs', 'Log', ClipboardList] as const, ['validate', 'Validate', Search] as const, ['guide', 'RL Guide', BookOpen] as const]).map(([t, label, Icon]) => (
                <button key={t} onClick={() => setFullTab(t)} className="flex items-center gap-1.5" style={{ padding: '4px 14px', fontSize: 10, fontWeight: 700, borderRadius: 4, cursor: 'pointer', border: fullTab === t ? 'none' : '1px solid var(--color-border)', background: fullTab === t ? '#ffffff' : 'transparent', color: fullTab === t ? '#000000' : 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  <Icon size={11} />
                  {label}
                </button>
              ))}
              <button onClick={downloadCSV} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4, border: '1px solid rgba(34,197,94,0.3)', background: 'rgba(34,197,94,0.08)', color: '#22c55e', cursor: 'pointer' }}>↓ CSV</button>
              <button onClick={downloadJSON} style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 4, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-faint)', cursor: 'pointer' }}>↓ JSON</button>
              <button onClick={() => setFullView(false)} className="flex items-center justify-center" style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid var(--color-border)', background: 'transparent', color: 'var(--color-text-faint)', cursor: 'pointer' }}><X size={14} /></button>
            </div>

            <AnimatePresence mode="wait">
            {/* ── SCORING TAB ── */}
            {fullTab === 'scoring' && (<motion.div key="scoring" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{(() => {
              // Fixed palette — white, green, red only
              const C = { bg: 'var(--color-panel)', card: 'var(--color-card-bg)', border: 'var(--color-border)', text: 'var(--color-text-primary)', muted: 'var(--color-text-faint)', faint: 'var(--color-border)', green: '#22c55e', red: '#ef4444' }

              const agentStats = AGENT_ORDER.map(id => {
                const logs = allActionLogs.filter(r => r.agent === id)
                const total = rewardTotals[id] || 0
                const gains = logs.filter(r => r.reward > 0).reduce((s, r) => s + r.reward, 0)
                const losses = logs.filter(r => r.reward < 0).reduce((s, r) => s + r.reward, 0)
                const bestAction = logs.reduce((b, r) => r.reward > (b?.reward ?? -Infinity) ? r : b, null as typeof logs[0] | null)
                const worstAction = logs.reduce((w, r) => r.reward < (w?.reward ?? Infinity) ? r : w, null as typeof logs[0] | null)
                return { id, total, gains, losses, actions: logs.length, bestAction, worstAction, name: agents[id as AgentId]?.name || id }
              }).sort((a, b) => b.total - a.total)

              const maxTotal = Math.max(...agentStats.map(a => Math.abs(a.total)), 1)
              const medalColors = ['#fbbf24', '#9ca3af', '#d97706']

              const STAGE_REWARDS_DISPLAY: Record<string, Record<string, number>> = {
                visitor:    { content: 0.5 },
                lead:       { content: 1.0, marketing: 1.5 },
                qualified:  { sales: 1.0, hr: 0.3 },
                demo:       { sales: 1.5, dev: 0.5 },
                proposal:   { sales: 2.0 },
                closed_won: { sales: 10.0, content: 2.0, marketing: 3.0, dev: 2.0, ceo: 5.0, hr: 1.0, customer: 2.0 },
                closed_lost:{ sales: -3.0, marketing: -1.0, ceo: -2.0 },
                churned:    { dev: -5.0, sales: -3.0, content: -1.0, marketing: -1.0, ceo: -3.0, customer: -5.0 },
              }
              const stageDot = (s: string) => ['closed_lost','churned'].includes(s) ? C.red : C.green

              return (
                <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>

                  {/* LEFT — Agent Leaderboard */}
                  <div style={{ padding: 20, borderRight: `1px solid ${C.border}`, overflowY: 'auto' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted, marginBottom: 14 }}>Agent Leaderboard</div>

                    {agentStats.map((a, rank) => {
                      const agentColor = agents[a.id as AgentId]?.color || '#64748b'
                      return (
                      <div key={a.id} style={{ marginBottom: 10, padding: '10px 12px', borderRadius: 7, background: C.card, border: `1px solid ${C.border}`, borderLeft: `3px solid ${agentColor}`, overflow: 'hidden', minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, minWidth: 0 }}>
                          <span style={{ minWidth: 22, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{rank < 3 ? <Medal size={16} style={{ color: medalColors[rank] }} /> : <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-faint)' }}>#{rank + 1}</span>}</span>
                          <img src={agentIconPath(a.id as AgentId)} style={{ width: 26, height: 26, borderRadius: '50%', outline: `2px solid ${agentColor}`, flexShrink: 0 }} alt="" />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: agentColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                            <div style={{ fontSize: 9, color: C.muted }}>{a.actions} actions</div>
                          </div>
                          <div style={{ fontSize: 17, fontFamily: 'monospace', fontWeight: 800, color: a.total >= 0 ? C.green : C.red }}>
                            {a.total >= 0 ? '+' : ''}{a.total.toFixed(2)}
                          </div>
                        </div>

                        {/* Gains bar */}
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 8, color: C.muted, minWidth: 24 }}>+</span>
                          <div style={{ flex: 1, height: 5, borderRadius: 3, background: C.faint, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: C.green, width: `${Math.min(a.gains / maxTotal * 100, 100)}%` }} />
                          </div>
                          <span style={{ fontSize: 9, fontFamily: 'monospace', color: C.green, minWidth: 38, textAlign: 'right' }}>{a.gains.toFixed(2)}</span>
                        </div>
                        {a.losses < 0 && (
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 8, color: C.muted, minWidth: 24 }}>−</span>
                            <div style={{ flex: 1, height: 5, borderRadius: 3, background: C.faint, overflow: 'hidden' }}>
                              <div style={{ height: '100%', background: C.red, width: `${Math.min(Math.abs(a.losses) / maxTotal * 100, 100)}%` }} />
                            </div>
                            <span style={{ fontSize: 9, fontFamily: 'monospace', color: C.red, minWidth: 38, textAlign: 'right' }}>{a.losses.toFixed(2)}</span>
                          </div>
                        )}

                        {/* Best / Worst */}
                        <div style={{ display: 'flex', gap: 6, marginTop: 6, minWidth: 0, overflow: 'hidden' }}>
                          {a.bestAction && a.bestAction.reward > 0 && (
                            <div style={{ flex: 1, minWidth: 0, padding: '4px 7px', borderRadius: 4, background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.18)', overflow: 'hidden' }}>
                              <div style={{ fontSize: 7, color: C.green, fontWeight: 700, letterSpacing: '0.08em' }}>BEST</div>
                              <div style={{ fontSize: 9, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{a.bestAction.action}</div>
                              <div style={{ fontSize: 9, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.bestAction.outcome}</div>
                              <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: C.green }}>+{a.bestAction.reward.toFixed(2)}</div>
                            </div>
                          )}
                          {a.worstAction && a.worstAction.reward < 0 && (
                            <div style={{ flex: 1, minWidth: 0, padding: '4px 7px', borderRadius: 4, background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.18)', overflow: 'hidden' }}>
                              <div style={{ fontSize: 7, color: C.red, fontWeight: 700, letterSpacing: '0.08em' }}>WORST</div>
                              <div style={{ fontSize: 9, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{a.worstAction.action}</div>
                              <div style={{ fontSize: 9, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.worstAction.outcome}</div>
                              <div style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 700, color: C.red }}>{a.worstAction.reward.toFixed(2)}</div>
                            </div>
                          )}
                        </div>
                      </div>
                      )
                    })}

                    {/* Final KPIs */}
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted, margin: '18px 0 10px' }}>Final KPIs</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                      {[
                        { label: 'Revenue', value: `$${((kpis.total_revenue || 0) / 1000).toFixed(1)}k` },
                        { label: 'Pipeline', value: `$${((kpis.pipeline_value || 0) / 1000).toFixed(1)}k` },
                        { label: 'Conversion', value: `${((kpis.conversion_rate || 0) * 100).toFixed(1)}%` },
                        { label: 'Traffic', value: (kpis.website_traffic || 0).toLocaleString() },
                        { label: 'NPS', value: String(kpis.nps_score || 50) },
                        { label: 'Budget', value: `$${((kpis.budget_remaining || 0) / 1000).toFixed(1)}k` },
                      ].map(k => (
                        <div key={k.label} style={{ padding: '7px 10px', borderRadius: 6, background: C.card, border: `1px solid ${C.border}`, textAlign: 'center' }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: C.text, fontFamily: 'monospace' }}>{k.value}</div>
                          <div style={{ fontSize: 8, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{k.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* RIGHT — Scoring Rubric */}
                  <div style={{ padding: 20, overflowY: 'auto' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: C.muted, marginBottom: 14 }}>Scoring Rubric</div>

                    {/* Pipeline stage transitions */}
                    <div style={{ marginBottom: 22 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 4 }}>Pipeline Stage Transitions</div>
                      <div style={{ fontSize: 9, color: C.muted, marginBottom: 10 }}>Points assigned to each role when a customer moves to that stage</div>
                      {Object.entries(STAGE_REWARDS_DISPLAY).map(([stage, rewards]) => (
                        <div key={stage} style={{ marginBottom: 5, padding: '7px 10px', borderRadius: 5, background: C.card, border: `1px solid ${C.border}` }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: stageDot(stage), flexShrink: 0 }} />
                            <span style={{ fontSize: 10, fontWeight: 700, color: C.text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                              {stage.replace(/_/g, ' ')}
                            </span>
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {Object.entries(rewards).map(([role, pts]) => (
                              <span key={role} style={{
                                fontSize: 9, padding: '2px 7px', borderRadius: 3, fontWeight: 600,
                                background: pts > 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                                color: pts > 0 ? C.green : C.red,
                                border: `1px solid ${pts > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
                              }}>
                                {role}: {pts > 0 ? '+' : ''}{pts}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Direct action bonuses */}
                    <div style={{ marginBottom: 22 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 10 }}>Direct Action Bonuses</div>
                      {[
                        { role: 'dev',      action: 'SHIP_RELEASE',    pts: '+3.0', note: 'Per feature shipped' },
                        { role: 'dev',      action: 'BUILD_FEATURE',   pts: '+0.5', note: 'Progress on build' },
                        { role: 'content',  action: 'Publish content', pts: '+0.5', note: 'Per published piece' },
                        { role: 'ceo',      action: 'SET_OKRS',        pts: '+1.0', note: 'Per OKR set' },
                        { role: 'ceo',      action: 'SEND_DIRECTIVE',  pts: '+0.3', note: 'Per directive' },
                        { role: 'hr',       action: 'RESOLVE_BLOCKER', pts: '+1.5', note: 'Unblocking team' },
                        { role: 'hr',       action: 'PLAN_SPRINT',     pts: '+0.5', note: 'Sprint planning' },
                        { role: 'customer', action: 'REFER_LEAD',      pts: '+2.0', note: 'New lead generated' },
                        { role: 'customer', action: 'RENEW_CONTRACT',  pts: '+3.0', note: 'Contract renewed' },
                      ].map((b, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4, marginBottom: 2, background: i % 2 === 0 ? C.card : 'transparent' }}>
                          <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, fontWeight: 600, background: 'var(--color-card-bg)', color: C.muted, minWidth: 56, textAlign: 'center' }}>{b.role}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: C.text, flex: 1 }}>{b.action}</span>
                          <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 800, color: C.green, minWidth: 36, textAlign: 'right' }}>{b.pts}</span>
                          <span style={{ fontSize: 9, color: C.muted, minWidth: 110 }}>{b.note}</span>
                        </div>
                      ))}
                    </div>

                    {/* Collaboration bonuses */}
                    <div style={{ marginBottom: 22 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 10 }}>Collaboration Bonuses</div>
                      {[
                        { who: 'content',   what: 'Writes about a shipped feature',         pts: '+1.0', pair: 'with dev' },
                        { who: 'sales',     what: 'Demo to content-touched lead',            pts: '+0.5', pair: 'with content' },
                        { who: 'dev',       what: 'Builds feature from customer feedback',   pts: '+1.0', pair: 'with sales' },
                        { who: 'marketing', what: 'Campaign using published content',        pts: '+0.5', pair: 'with content' },
                      ].map((b, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4, marginBottom: 2, background: i % 2 === 0 ? C.card : 'transparent' }}>
                          <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, fontWeight: 600, background: 'var(--color-card-bg)', color: C.muted, minWidth: 56, textAlign: 'center' }}>{b.who}</span>
                          <span style={{ fontSize: 10, color: C.text, flex: 1 }}>{b.what}</span>
                          <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 800, color: C.green, minWidth: 36, textAlign: 'right' }}>{b.pts}</span>
                          <span style={{ fontSize: 9, color: C.muted, minWidth: 80 }}>{b.pair}</span>
                        </div>
                      ))}
                    </div>

                    {/* Penalties */}
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text, marginBottom: 10 }}>Penalties</div>
                      {[
                        { who: 'all',       what: 'Action fails',                      pts: '−1.0', note: 'Per failure' },
                        { who: 'sales',     what: 'Stale lead (>4 days no contact)',   pts: '−0.5', note: 'Per stale lead' },
                        { who: 'marketing', what: 'Budget below $1,000',               pts: '−0.5', note: 'Budget overrun warning' },
                        { who: 'dev',       what: 'Vaporware — content before ship',   pts: '−5.0', note: 'Unshipped feature in content' },
                      ].map((b, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4, marginBottom: 2, background: i % 2 === 0 ? C.card : 'transparent' }}>
                          <span style={{ fontSize: 8, padding: '1px 6px', borderRadius: 3, fontWeight: 600, background: 'var(--color-card-bg)', color: C.muted, minWidth: 56, textAlign: 'center' }}>{b.who}</span>
                          <span style={{ fontSize: 10, color: C.text, flex: 1 }}>{b.what}</span>
                          <span style={{ fontSize: 10, fontFamily: 'monospace', fontWeight: 800, color: C.red, minWidth: 36, textAlign: 'right' }}>{b.pts}</span>
                          <span style={{ fontSize: 9, color: C.muted, minWidth: 110 }}>{b.note}</span>
                        </div>
                      ))}
                    </div>

                  </div>
                </div>
              )
            })()}</motion.div>)}

            {/* ── VALIDATE TAB ── */}
            {fullTab === 'validate' && (<motion.div key="validate" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{(() => {
              const V = { bg: 'var(--color-panel)', card: 'var(--color-card-bg)', border: 'var(--color-border)', text: 'var(--color-text-primary)', muted: 'var(--color-text-faint)', faint: 'var(--color-border)', green: '#22c55e', red: '#ef4444', yellow: '#f59e0b', purple: '#a855f7' }
              return (
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
                  <div style={{ width: '100%' }}>

                    {/* Header + Button */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: V.text, marginBottom: 4 }}>Validate Scoring Rubric</div>
                        <div style={{ fontSize: 11, color: V.muted, lineHeight: 1.5 }}>
                          Send the full reward function to Claude Opus 4.6 for expert analysis against PPO, GRPO, RLHF, and multi-agent RL principles.
                        </div>
                      </div>
                      <button
                        onClick={runValidation}
                        disabled={validating}
                        style={{
                          padding: '10px 22px', fontSize: 12, fontWeight: 700, borderRadius: 6, cursor: validating ? 'not-allowed' : 'pointer',
                          border: 'none', background: validating ? V.faint : V.purple,
                          color: validating ? V.muted : '#fff', whiteSpace: 'nowrap', flexShrink: 0,
                          opacity: validating ? 0.7 : 1,
                        }}
                      >
                        {validating ? 'Analyzing...' : 'Run Validation'}
                      </button>
                    </div>

                    {/* Streaming output */}
                    {validating && (
                      <div style={{ marginBottom: 20 }}>
                        <div style={{ marginBottom: 8 }}>
                          <div style={{ height: 3, borderRadius: 2, background: V.faint, overflow: 'hidden' }}>
                            <div style={{ height: '100%', background: V.purple, width: '40%', animation: 'pulse 1.5s ease-in-out infinite' }} />
                          </div>
                        </div>
                        {streamText ? (
                          <pre style={{
                            padding: '14px 16px', borderRadius: 7, background: 'var(--color-surface)',
                            border: `1px solid ${V.border}`, fontSize: 10, fontFamily: 'monospace',
                            color: V.muted, lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                            maxHeight: 400, overflowY: 'auto',
                          }}>
                            {streamText}
                            <span style={{ color: V.purple, animation: 'pulse 1s infinite' }}>|</span>
                          </pre>
                        ) : (
                          <div style={{ padding: '14px 16px', borderRadius: 7, background: V.card, border: `1px solid ${V.border}`, fontSize: 10, color: V.muted }}>
                            Connecting to Claude Opus 4.6...
                          </div>
                        )}
                      </div>
                    )}

                    {/* Error */}
                    {validationError && (
                      <div style={{ marginBottom: 20, padding: '12px 16px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 11, color: V.red }}>
                        {validationError}
                      </div>
                    )}

                    {/* No results yet */}
                    {!validation && !validating && !validationError && (
                      <div style={{ padding: 48, textAlign: 'center', borderRadius: 8, background: V.card, border: `1px solid ${V.border}` }}>
                        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'center' }}><Search size={32} style={{ color: 'var(--color-text-faint)' }} /></div>
                        <div style={{ fontSize: 12, color: V.text, fontWeight: 600, marginBottom: 4 }}>No validation yet</div>
                        <div style={{ fontSize: 10, color: V.muted }}>Click "Run Validation" to get an expert RL analysis of your scoring rubric</div>
                      </div>
                    )}

                    {/* Results */}
                    {validation && (
                      <div>
                        {/* Score header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, padding: '18px 22px', borderRadius: 8, background: V.card, border: `1px solid ${V.border}` }}>
                          <div style={{ textAlign: 'center', minWidth: 64 }}>
                            <div style={{ fontSize: 42, fontWeight: 900, fontFamily: 'monospace', color: validation.overall_score >= 75 ? V.green : validation.overall_score >= 50 ? V.yellow : V.red, lineHeight: 1 }}>
                              {validation.overall_score}
                            </div>
                            <div style={{ fontSize: 10, color: V.muted, marginTop: 4 }}>/ 100</div>
                          </div>
                          <div style={{ width: 1, height: 50, background: V.border }} />
                          <div style={{ textAlign: 'center', minWidth: 44 }}>
                            <div style={{ fontSize: 36, fontWeight: 900, color: validation.overall_score >= 75 ? V.green : validation.overall_score >= 50 ? V.yellow : V.red, lineHeight: 1 }}>
                              {validation.grade}
                            </div>
                            <div style={{ fontSize: 9, color: V.muted, marginTop: 4 }}>GRADE</div>
                          </div>
                          <div style={{ width: 1, height: 50, background: V.border }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, color: V.text, lineHeight: 1.6 }}>{validation.summary}</div>
                            {validatedBy && <div style={{ fontSize: 9, color: V.muted, marginTop: 6 }}>Validated by <span style={{ color: V.purple, fontWeight: 600 }}>{validatedBy}</span></div>}
                          </div>
                        </div>

                        {/* Two-column: Strengths + Gaps */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                          {/* Strengths */}
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: V.green, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                              Strengths ({validation.strengths.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {validation.strengths.map((s: any, i: number) => (
                                <div key={i} style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.12)' }}>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: V.text, marginBottom: 3 }}>{s.title}</div>
                                  <div style={{ fontSize: 10, color: V.muted, lineHeight: 1.55 }}>{s.detail}</div>
                                  {s.principle && <div style={{ fontSize: 8, color: V.green, marginTop: 5, fontWeight: 600 }}>{s.principle}</div>}
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Gaps */}
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: V.red, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                              Gaps ({validation.gaps.length})
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              {validation.gaps.map((g: any, i: number) => {
                                const gc = g.severity === 'high' ? V.red : g.severity === 'medium' ? V.yellow : V.muted
                                return (
                                  <div key={i} style={{ padding: '10px 12px', borderRadius: 6, background: `${gc}08`, border: `1px solid ${gc}20` }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                                      <span style={{ fontSize: 11, fontWeight: 700, color: V.text, flex: 1 }}>{g.title}</span>
                                      <span style={{ fontSize: 8, padding: '2px 6px', borderRadius: 3, fontWeight: 700, textTransform: 'uppercase', background: `${gc}15`, color: gc }}>{g.severity}</span>
                                    </div>
                                    <div style={{ fontSize: 10, color: V.muted, lineHeight: 1.55 }}>{g.detail}</div>
                                    {g.principle && <div style={{ fontSize: 8, color: gc, marginTop: 5, fontWeight: 600 }}>{g.principle}</div>}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Recommendations — full width */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: V.purple, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                            Recommendations ({validation.recommendations.length})
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {validation.recommendations.map((r: any, i: number) => {
                              const rc = r.priority === 'high' ? V.red : r.priority === 'medium' ? V.yellow : V.muted
                              return (
                                <div key={i} style={{ padding: '10px 14px', borderRadius: 6, background: 'rgba(168,85,247,0.04)', border: '1px solid rgba(168,85,247,0.12)', display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'start' }}>
                                  <div>
                                    <div style={{ fontSize: 11, fontWeight: 700, color: V.text, marginBottom: 3 }}>{r.title}</div>
                                    <div style={{ fontSize: 10, color: V.muted, lineHeight: 1.55 }}>{r.detail}</div>
                                    {r.impact && <div style={{ fontSize: 9, color: V.purple, marginTop: 5, fontStyle: 'italic' }}>Impact: {r.impact}</div>}
                                  </div>
                                  <span style={{ fontSize: 8, padding: '2px 7px', borderRadius: 3, fontWeight: 700, textTransform: 'uppercase', background: `${rc}15`, color: rc, whiteSpace: 'nowrap' }}>{r.priority}</span>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}</motion.div>)}

            {/* ── ACTION LOG TAB ── */}
            {fullTab === 'logs' && <motion.div key="logs" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 16px', borderBottom: '1px solid var(--color-border)', flexShrink: 0, background: 'var(--color-surface)' }}>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--color-text-faint)', marginRight: 4 }}>FILTER:</span>
                {(['all', ...AGENT_ORDER] as (AgentId | 'all')[]).map(id => (
                  <button key={id} onClick={() => setFullFilter(id)} style={{ padding: '2px 8px', fontSize: 9, fontWeight: 600, borderRadius: 10, border: '1px solid var(--color-border)', cursor: 'pointer', background: fullFilter === id ? 'var(--color-text-primary)' : 'transparent', color: fullFilter === id ? 'var(--color-panel)' : 'var(--color-text-faint)' }}>
                    {id === 'all' ? 'All' : (agents[id as AgentId]?.name || id)}
                  </button>
                ))}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '48px 110px 150px 1fr 74px', padding: '5px 16px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--color-text-faint)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
                <span>Step</span><span>Agent</span><span>Action</span><span>Outcome</span><span style={{ textAlign: 'right' }}>Reward</span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {allActionLogs.filter(r => fullFilter === 'all' || r.agent === fullFilter).map((r, i) => {
                  const agentColor = agents[r.agent as AgentId]?.color || 'var(--color-text-faint)'
                  const pos = r.reward >= 0
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '48px 110px 150px 1fr 74px', alignItems: 'center', padding: '5px 16px', borderBottom: '1px solid var(--color-border)', background: i % 2 === 0 ? 'transparent' : 'var(--color-card-bg)' }}>
                      <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--color-text-faint)' }}>t{r.step}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <img src={agentIconPath(r.agent as AgentId)} style={{ width: 16, height: 16, borderRadius: '50%', outline: `1.5px solid ${agentColor}` }} alt="" />
                        <span style={{ fontSize: 10, fontWeight: 600, color: agentColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.agentName}</span>
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.action}</span>
                      <span style={{ fontSize: 9, color: 'var(--color-text-faint)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{r.outcome || '—'}</span>
                      <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, textAlign: 'right', color: pos ? '#22c55e' : '#ef4444' }}>{pos ? '+' : ''}{r.reward.toFixed(3)}</span>
                    </div>
                  )
                })}
                {allActionLogs.filter(r => fullFilter === 'all' || r.agent === fullFilter).length === 0 && (
                  <div style={{ padding: 32, textAlign: 'center', color: 'var(--color-text-faint)', fontSize: 12 }}>No actions recorded yet</div>
                )}
              </div>
            </motion.div>}

            {/* ── RL GUIDE TAB ── */}
            {fullTab === 'guide' && (<motion.div key="guide" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>{(() => {
              const C = { bg: 'var(--color-panel)', card: 'var(--color-card-bg)', border: 'var(--color-border)', text: 'var(--color-text-primary)', muted: 'var(--color-text-faint)', faint: 'var(--color-border)', green: '#22c55e', red: '#ef4444', yellow: '#f59e0b' }

              const sectionIcons: Record<string, typeof Target> = {
                'Reward Signal Design': Target,
                'Policy Optimization (PPO / GRPO)': Ruler,
                'Multi-Agent Collaboration': Handshake,
                'Evaluation & Metrics': BarChart3,
                'Common Pitfalls': AlertTriangle,
                'RLHF vs This RL Sim': Microscope,
              }
              const sections: { emoji: string; title: string; items: { label: string; body: string; tag?: string; tagColor?: string }[] }[] = [
                {
                  emoji: 'target',
                  title: 'Reward Signal Design',
                  items: [
                    { label: 'Dense > Sparse', body: 'Provide reward at every meaningful step, not just at episode end. Agents learning from only final rewards suffer from credit assignment — they cannot tell which early action caused the outcome. This simulation rewards each agent action immediately.', tag: 'CRITICAL', tagColor: C.red },
                    { label: 'Avoid Reward Hacking', body: 'Models exploit reward functions in unintended ways. The KL divergence penalty (r = r_θ − λ·r_KL) prevents the policy from drifting so far that it games the reward model while producing low-quality outputs. Monitor reward vs. actual quality separately.', tag: 'PITFALL', tagColor: C.red },
                    { label: 'Shaped Rewards = Faster Learning', body: 'Intermediate milestone rewards (qualified lead, demo scheduled) guide the agent toward the final goal (closed_won) much faster than waiting for the terminal signal. Each pipeline stage transition in this sim is a shaped reward.' },
                    { label: 'Scale Rewards Consistently', body: 'Keep reward magnitudes in a predictable range (e.g. −5 to +10). Wildly differing scales (e.g. +0.3 vs. +100) make gradient updates unstable and learning slow. Normalize per agent if needed.' },
                    { label: 'Separate Business KPIs from RL Signal', body: 'Revenue, traffic, and NPS are business metrics. The RL reward is a proxy — it must correlate with what you care about but should be learnable step-by-step. Avoid rewarding raw revenue directly; instead reward the actions that drive it.' },
                  ],
                },
                {
                  emoji: 'ruler',
                  title: 'Policy Optimization (PPO / GRPO)',
                  items: [
                    { label: 'PPO Trust Region', body: 'Proximal Policy Optimization clips gradient updates so the new policy never strays too far from the current one in a single step. This prevents catastrophic forgetting and training instability. Clip ratio ε = 0.1–0.2 is typical.', tag: 'ALGORITHM', tagColor: '#6366f1' },
                    { label: 'KL Divergence Penalty', body: 'r_total = r_reward − λ · KL(π_new ∥ π_ref). The reference model acts as an anchor. Without this term, the LLM drifts into degenerate behavior that fools the reward model. λ = 0.5–1.0 is the practical range.', tag: 'FORMULA', tagColor: '#6366f1' },
                    { label: 'GRPO for Multi-Agent', body: 'Group Relative Policy Optimization (used in DeepSeek-R1) normalizes rewards across a group of agents before computing advantages. In multi-agent settings this prevents one high-reward agent from dominating gradient updates. Advantage_i = (r_i − mean(r)) / std(r).', tag: 'MULTI-AGENT', tagColor: C.green },
                    { label: 'On-Policy vs Off-Policy', body: 'PPO is on-policy: it only learns from experience the current policy generated. Off-policy methods (DQN, SAC) can reuse old data but are harder to stabilize for LLMs. On-policy is safer for language agents but less sample-efficient.' },
                  ],
                },
                {
                  emoji: 'handshake',
                  title: 'Multi-Agent Collaboration',
                  items: [
                    { label: 'Reward Sharing Incentivizes Teamwork', body: 'When closing a deal, ALL agents get a share (sales +10, CEO +5, marketing +3, dev +2…). This creates cooperative incentives. Agents learn that helping teammates succeed is in their own interest — a key alignment technique for multi-agent RL.', tag: 'THIS SIM', tagColor: C.green },
                    { label: 'Collaboration Bonus', body: 'Extra reward for building on another agent\'s work (e.g. Content writing about a Dev-shipped feature). This signal teaches agents to coordinate without explicit communication — they infer each other\'s state from shared memory and adjust their actions.' },
                    { label: 'Credit Assignment in Teams', body: 'The hardest problem in multi-agent RL: when a deal closes, which earlier actions by which agents were actually responsible? Per-step rewards + collaboration bonuses partially solve this, but long-horizon credit assignment remains an open research problem.' },
                    { label: 'Emergent Communication', body: 'Agents learn to send messages to coordinate (sales asking dev for features, CEO setting directives). This emergent communication is not explicitly programmed — it arises because message-sending + response leads to higher joint reward.' },
                  ],
                },
                {
                  emoji: 'barchart',
                  title: 'Evaluation & Metrics',
                  items: [
                    { label: 'Global Reward ≠ Quality', body: 'Cumulative reward is the RL objective, not a business metric. Always pair it with real KPIs (revenue, NPS, conversion rate) to check they correlate. A model that hacks the reward while hurting revenue is worse than no RL at all.', tag: 'WARNING', tagColor: C.yellow },
                    { label: 'Pairwise Comparison > Scalar Score', body: 'Human preference labels from head-to-head comparisons (A vs B) are far more stable than asking "rate this 1–10". Elo-style ranking systems built from pairwise results produce well-calibrated reward models. Direct scalar annotation is noisy.' },
                    { label: 'Track Policy Drift (KL)', body: 'Monitor KL(π_new ∥ π_ref) throughout training. Rising KL without improving reward means the model is diverging meaninglessly. Flat KL with improving reward is ideal. Exploding KL means reduce the learning rate or increase λ.' },
                    { label: 'Advantage Function', body: 'A(s,a) = Q(s,a) − V(s). Measures how much better a specific action is vs. the average action in that state. Positive advantage = above-average move, negative = below-average. Policy gradient methods update toward high-advantage actions.' },
                    { label: 'Episode Length Matters', body: 'Short episodes (few steps) make learning fast but may not capture long-horizon strategy. Long episodes (many days) teach better strategy but slow convergence. 10 days × 14 turns = 140 steps per episode — a reasonable balance.' },
                  ],
                },
                {
                  emoji: 'alert',
                  title: 'Common Pitfalls',
                  items: [
                    { label: 'Reward Hacking Examples', body: '"Paperclip maximizer": agent obsessively does one action that gives small but consistent reward rather than learning the optimal strategy. Fix: reward diversity bonus, entropy regularization, or action variety penalty.', tag: 'PITFALL', tagColor: C.red },
                    { label: 'Sparse Reward Starvation', body: 'If only closed_won counts, agents may never explore the path to get there (30+ steps away). This is why intermediate pipeline rewards (visitor→lead→qualified→demo→proposal) are essential in this simulation.', tag: 'PITFALL', tagColor: C.red },
                    { label: 'Catastrophic Forgetting', body: 'Fine-tuning an LLM on RL rewards can overwrite its pretrained language capabilities. Mix in supervised fine-tuning (SFT) gradients during PPO updates to retain base language quality. Keep a frozen reference model.' },
                    { label: 'Stale Lead Penalty Design', body: 'The −0.5 per stale lead penalty pushes Sales to maintain pipeline hygiene. This is a constraint penalty — not for achieving goals, but for avoiding bad habits. Constraint penalties prevent shortcuts that hurt long-term outcomes.' },
                    { label: 'Action Space Too Large', body: 'Agents pick invalid actions when the allowed action list is unclear. Always enumerate the exact set of valid actions in the system prompt and tool schema. Constrain the output to valid tokens — never let the model freestyle action names.' },
                  ],
                },
                {
                  emoji: 'microscope',
                  title: 'RLHF vs This RL Sim',
                  items: [
                    { label: 'RLHF Pipeline', body: 'Standard RLHF: (1) SFT on demonstrations → (2) Train reward model on human preferences → (3) PPO against reward model. This sim skips the preference step and uses a hand-coded reward function instead — closer to classical RL than RLHF.' },
                    { label: 'Reward Model vs Rule-Based', body: 'RLHF uses a learned reward model (neural network trained on human labels). This sim uses a deterministic reward calculator (rules in Python). Rule-based is interpretable and fast; learned RM is more flexible but can be hacked.' },
                    { label: 'Constitutional AI (Anthropic)', body: 'Trains reward models using AI-generated feedback guided by a "constitution" (principles). Reduces human annotation cost while encoding explicit values. The analogy here: the scoring rubric IS the constitution for this simulation.' },
                    { label: 'GRPO (DeepSeek-R1)', body: 'Removes the value network entirely — uses group-relative advantages computed from a batch of rollouts. Memory-efficient, easier to implement. Especially useful for multi-agent systems where per-agent value estimation is complex.' },
                  ],
                },
              ]

              return (
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                  <div style={{ maxWidth: 860, margin: '0 auto' }}>
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 16, fontWeight: 800, color: C.text, marginBottom: 4 }}>LLM Reinforcement Learning — Best Practices</div>
                      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                        Distilled from: OpenAI InstructGPT, Anthropic Constitutional AI, DeepSeek-R1 (GRPO), HuggingFace RLHF, OpenAI Spinning Up, and RL4LMs (AllenAI). Applied to this 7-agent GTM simulation.
                      </div>
                    </div>

                    {sections.map(sec => (
                      <div key={sec.title} style={{ marginBottom: 28 }}>
                        {/* Section header */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${C.border}` }}>
                          {(() => { const SIcon = sectionIcons[sec.title]; return SIcon ? <SIcon size={18} style={{ color: C.text, flexShrink: 0 }} /> : null })()}
                          <span style={{ fontSize: 13, fontWeight: 800, color: C.text, letterSpacing: '-0.01em' }}>{sec.title}</span>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {sec.items.map((item, i) => (
                            <div key={i} style={{ padding: '12px 14px', borderRadius: 7, background: C.card, border: `1px solid ${C.border}` }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{item.label}</span>
                                {item.tag && (
                                  <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 6px', borderRadius: 3, letterSpacing: '0.07em', background: `${item.tagColor}18`, color: item.tagColor, border: `1px solid ${item.tagColor}30` }}>
                                    {item.tag}
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.65 }}>{item.body}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {/* Formula reference box */}
                    <div style={{ marginBottom: 28, padding: '14px 16px', borderRadius: 7, background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Key Formulas</div>
                      {[
                        { name: 'PPO Reward', formula: 'r_total = r_θ  −  λ · KL(π_RL ∥ π_ref)', note: 'Preference reward minus KL divergence penalty' },
                        { name: 'Advantage', formula: 'A(s,a)  =  Q(s,a)  −  V(s)', note: 'How much better this action is vs. average' },
                        { name: 'GRPO Advantage', formula: 'Â_i  =  (r_i − μ_group) / σ_group', note: 'Group-normalized advantage across agent batch' },
                        { name: 'Discounted Return', formula: 'G_t  =  Σ  γ^k · r_{t+k}', note: 'γ ∈ (0,1) discounts future rewards' },
                        { name: 'Policy Gradient', formula: '∇J(θ)  =  E[ Â(s,a) · ∇ log π_θ(a|s) ]', note: 'Update toward high-advantage actions' },
                      ].map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 16, padding: '6px 0', borderBottom: i < 4 ? `1px solid ${C.faint}` : 'none' }}>
                          <span style={{ fontSize: 9, color: C.muted, minWidth: 110, fontWeight: 600 }}>{f.name}</span>
                          <span style={{ fontSize: 12, fontFamily: 'monospace', color: C.text, flex: 1, letterSpacing: '0.02em' }}>{f.formula}</span>
                          <span style={{ fontSize: 9, color: C.muted, minWidth: 200, textAlign: 'right' }}>{f.note}</span>
                        </div>
                      ))}
                    </div>

                    {/* Source credits */}
                    <div style={{ fontSize: 9, color: C.faint, textAlign: 'center', paddingBottom: 8 }}>
                      Sources: HuggingFace RLHF Blog · OpenAI Spinning Up · InstructGPT (Ouyang et al. 2022) · DeepSeek-R1 · Anthropic Constitutional AI · RL4LMs (AllenAI)
                    </div>
                  </div>
                </div>
              )
            })()}</motion.div>)}
            </AnimatePresence>

            {/* ── Footer totals ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderTop: '1px solid var(--color-border)', flexShrink: 0, background: 'var(--color-surface)' }}>
              {AGENT_ORDER.map(id => {
                const r = rewardTotals[id] || 0
                return (
                  <div key={id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 52 }}>
                    <span style={{ fontSize: 11, fontFamily: 'monospace', fontWeight: 700, color: r >= 0 ? '#22c55e' : '#ef4444' }}>{r >= 0 ? '+' : ''}{r.toFixed(2)}</span>
                    <span style={{ fontSize: 8, color: 'var(--color-text-faint)', fontWeight: 600 }}>{agents[id as AgentId]?.name?.split(' ')[0] || id}</span>
                  </div>
                )
              })}
              <div style={{ flex: 1 }} />
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 14, fontFamily: 'monospace', fontWeight: 800, color: globalReward >= 0 ? '#22c55e' : '#ef4444' }}>{globalReward >= 0 ? '+' : ''}{globalReward.toFixed(3)}</div>
                <div style={{ fontSize: 8, color: 'var(--color-text-faint)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Reward</div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
