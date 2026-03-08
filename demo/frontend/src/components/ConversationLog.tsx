import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import type { MsgType, AgentId } from '../types'
import { AGENT_ORDER } from '../types'

const MSG_BG: Record<MsgType, string> = {
  handoff:   'border-l-2 border-l-amber-400 bg-amber-50 dark:bg-amber-950/30',
  reasoning: 'border-l-2 border-l-slate-300 dark:border-l-slate-600 bg-slate-50 dark:bg-slate-800/50',
  event:     'border-l-2 border-l-orange-400 bg-orange-50 dark:bg-orange-950/30',
  chat:      'border-l-2 border-l-slate-200 dark:border-l-slate-600 bg-transparent',
}

const MSG_LABEL: Record<MsgType, string> = {
  handoff:   'HANDOFF',
  reasoning: 'THINK',
  event:     'EVENT',
  chat:      'MSG',
}

const MSG_LABEL_COLOR: Record<MsgType, string> = {
  handoff:   '#d97706',
  reasoning: '#64748b',
  event:     '#ea580c',
  chat:      '#94a3b8',
}

const AGENT_COLORS: Record<string, string> = {
  ceo:       '#b8860b',
  hr:        '#0891b2',
  marketing: '#db2777',
  content:   '#7c3aed',
  dev:       '#059669',
  sales:     '#c2410c',
  scene:     '#059669',
  customer:  '#a16207',
  system:    '#dc2626',
  self:      '#64748b',
}

export function ConversationLog() {
  const conversations = useStore(s => s.conversations)
  const [filter, setFilter] = useState<AgentId | 'all'>('all')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conversations.length])

  const filtered = filter === 'all'
    ? conversations
    : conversations.filter(m => m.from_agent === filter || m.to_agent === filter)

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--color-panel)' }}>
      {/* Filter row */}
      <div className="flex items-center gap-1 px-2 py-1.5 overflow-x-auto shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <button
          onClick={() => setFilter('all')}
          className="text-[9px] px-2 py-0.5 rounded-full border transition-colors shrink-0"
          style={filter === 'all'
            ? { borderColor: 'var(--color-text-faint)', color: 'var(--color-text-secondary)', background: 'var(--color-border)' }
            : { borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }
          }
        >
          ALL
        </button>
        {AGENT_ORDER.map(aid => (
          <button
            key={aid}
            onClick={() => setFilter(filter === aid ? 'all' : aid as AgentId)}
            className="text-[9px] px-1.5 py-0.5 rounded-full border transition-colors shrink-0"
            style={filter === aid
              ? { background: AGENT_COLORS[aid], borderColor: AGENT_COLORS[aid], color: '#ffffff', fontWeight: 700 }
              : { borderColor: 'var(--color-border)', color: 'var(--color-text-faint)' }
            }
          >
            {aid.slice(0, 3).toUpperCase()}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-2 py-1.5 space-y-1 font-mono" style={{ background: 'var(--color-panel)' }}>
        <AnimatePresence initial={false}>
          {filtered.slice(-80).map((msg, i) => (
            <motion.div
              key={`${msg.step}-${i}-${msg.from_agent}`}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.2 }}
              className={`rounded px-2 py-1 text-[10px] ${MSG_BG[msg.msg_type] ?? MSG_BG.chat}`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <span
                  className="text-[8px] font-bold px-1 rounded"
                  style={{ color: MSG_LABEL_COLOR[msg.msg_type], background: `${MSG_LABEL_COLOR[msg.msg_type]}15` }}
                >
                  {MSG_LABEL[msg.msg_type]}
                </span>
                <span style={{ color: AGENT_COLORS[msg.from_agent] ?? '#64748b' }} className="font-semibold">
                  {msg.from_agent}
                </span>
                {msg.to_agent !== 'self' && msg.to_agent !== msg.from_agent && (
                  <>
                    <span style={{ color: 'var(--color-card-border)' }}>-&gt;</span>
                    <span style={{ color: AGENT_COLORS[msg.to_agent] ?? '#64748b' }}>
                      {msg.to_agent}
                    </span>
                  </>
                )}
                <span className="ml-auto" style={{ color: 'var(--color-card-border)' }}>s{msg.step}</span>
              </div>
              <div className="leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{msg.text}</div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
