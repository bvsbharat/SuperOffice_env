import { motion, AnimatePresence } from 'framer-motion'
import { LineChart, Line, ResponsiveContainer } from 'recharts'
import type { GTMAgent, AgentId } from '../types'
import { agentIconPath } from '../types'
import { useStore } from '../store/useStore'

interface Props {
  agent: GTMAgent
  compact?: boolean
}

const STATUS_DOT: Record<string, string> = {
  idle:   '#cbd5e1',
  active: '#22c55e',
  done:   '#6366f1',
}

export function AgentCard({ agent, compact = false }: Props) {
  const selectedAgent = useStore(s => s.selectedAgent)
  const selectAgent = useStore(s => s.selectAgent)
  const isSelected = selectedAgent === agent.agent_id as AgentId
  const isActive = agent.status === 'active'

  const rewardDelta = agent.reward_history.length >= 2
    ? agent.reward_history[agent.reward_history.length - 1] - agent.reward_history[agent.reward_history.length - 2]
    : agent.reward_history[agent.reward_history.length - 1] ?? 0

  const sparkData = agent.reward_history.slice(-12).map((v, i) => ({ i, v }))

  return (
    <motion.div
      layout
      onClick={() => selectAgent(isSelected ? null : agent.agent_id as AgentId)}
      className={`
        relative cursor-pointer rounded-lg border p-2.5
        transition-colors duration-150
        ${isActive
          ? 'border-[color:var(--agent-color)] bg-[color:var(--agent-bg)]'
          : isSelected
            ? 'border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-700'
            : 'border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-500 hover:shadow-sm'
        }
      `}
      style={{
        '--agent-color': agent.color,
        '--agent-bg': `${agent.color}12`,
      } as React.CSSProperties}
    >
      {/* Status dot */}
      <div
        className="absolute top-2 right-2 w-2 h-2 rounded-full"
        style={{ background: STATUS_DOT[agent.status] ?? '#cbd5e1' }}
      />

      {/* Header */}
      <div className="flex items-center gap-2 mb-1.5">
        <img src={agentIconPath(agent.agent_id)} alt={agent.name} className="w-6 h-6 rounded-full object-cover" />
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">{agent.name}</div>
          <div
            className="text-[9px] px-1 rounded mt-0.5 inline-block font-medium"
            style={{ background: `${agent.color}18`, color: agent.color }}
          >
            {agent.role}
          </div>
        </div>
      </div>

      {/* Current task */}
      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mb-1.5 min-h-[14px]">
        <AnimatePresence mode="wait">
          <motion.span
            key={agent.current_task}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            {agent.current_task || 'Waiting...'}
          </motion.span>
        </AnimatePresence>
      </div>

      {!compact && (
        <>
          {/* Sparkline + reward */}
          <div className="flex items-center gap-2">
            {sparkData.length > 1 && (
              <div className="flex-1 h-8">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparkData}>
                    <Line
                      type="monotone"
                      dataKey="v"
                      stroke={agent.color}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="text-right shrink-0">
              <div className="text-xs font-mono text-slate-600 dark:text-slate-300">
                {agent.reward.toFixed(2)}
              </div>
              <div className={`text-[10px] font-mono font-semibold ${rewardDelta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                {rewardDelta >= 0 ? '+' : ''}{rewardDelta.toFixed(2)}
              </div>
            </div>
          </div>
        </>
      )}
    </motion.div>
  )
}
