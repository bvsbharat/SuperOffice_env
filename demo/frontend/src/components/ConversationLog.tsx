import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useStore } from '../store/useStore'
import type { MsgType, AgentId } from '../types'
import { AGENT_ORDER, agentIconPath } from '../types'

const MSG_BG: Record<MsgType, string> = {
  reasoning: 'border-l-2 border-l-slate-300 dark:border-l-[#75715e] bg-slate-50 dark:bg-[rgba(117,113,94,0.08)]',
  event:     'border-l-2 border-l-orange-400 dark:border-l-[#fd971f] bg-orange-50 dark:bg-[rgba(253,151,31,0.08)]',
  chat:      'border-l-2 border-l-blue-300 dark:border-l-[#66d9ef] bg-blue-50 dark:bg-[rgba(102,217,239,0.07)]',
  action:    'border-l-2 border-l-emerald-400 dark:border-l-[#a6e22e] bg-emerald-50 dark:bg-[rgba(166,226,46,0.07)]',
}

const MSG_LABEL: Record<MsgType, string> = {
  reasoning: 'THINK',
  event:     'EVENT',
  chat:      'MSG',
  action:    'ACTION',
}

const MSG_LABEL_COLOR: Record<MsgType, string> = {
  reasoning: '#75715e',
  event:     '#fd971f',
  chat:      '#66d9ef',
  action:    '#a6e22e',
}

const AGENT_COLORS: Record<string, string> = {
  ceo:       '#b8860b',
  hr:        '#0891b2',
  marketing: '#db2777',
  content:   '#7c3aed',
  dev:       '#059669',
  sales:     '#c2410c',
  customer:  '#a16207',
  system:    '#dc2626',
  self:      '#64748b',
  all:       '#6366f1',
}

export function ConversationLog() {
  const conversations = useStore(s => s.conversations)
  const sharedMemory = useStore(s => s.sharedMemory)
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
      {/* Filter row — agent icons + labels */}
      <div className="flex items-center gap-1.5 px-2 py-2 overflow-x-auto shrink-0" style={{ borderBottom: '1px solid var(--color-border)' }}>
        <button
          onClick={() => setFilter('all')}
          className="flex flex-col items-center gap-0.5 transition-colors shrink-0"
          style={{ minWidth: 32 }}
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
            style={{
              background: filter === 'all' ? '#6366f1' : 'var(--color-card-bg)',
              border: filter === 'all' ? '2px solid #6366f1' : '2px solid var(--color-border)',
              color: filter === 'all' ? '#fff' : 'var(--color-text-muted)',
            }}
          >
            *
          </div>
          <span className="text-[8px] font-semibold" style={{ color: filter === 'all' ? '#ffffff' : 'var(--color-text-faint)' }}>ALL</span>
        </button>
        {AGENT_ORDER.map(aid => {
          const isActive = filter === aid
          const color = AGENT_COLORS[aid] ?? '#64748b'
          return (
            <button
              key={aid}
              onClick={() => setFilter(isActive ? 'all' : aid as AgentId)}
              className="flex flex-col items-center gap-0.5 transition-all shrink-0"
              style={{ minWidth: 32, opacity: filter !== 'all' && !isActive ? 0.45 : 1 }}
            >
              <img
                src={agentIconPath(aid as AgentId)}
                alt={aid}
                className="w-6 h-6 rounded-full object-cover"
                style={{
                  outline: isActive ? `2px solid ${color}` : '2px solid transparent',
                  outlineOffset: 1,
                }}
              />
              <span
                className="text-[8px] font-semibold"
                style={{ color: isActive ? color : 'var(--color-text-faint)' }}
              >
                {aid.slice(0, 3).toUpperCase()}
              </span>
            </button>
          )
        })}
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
                {/* From agent icon + name */}
                <img
                  src={agentIconPath(msg.from_agent as AgentId)}
                  alt={msg.from_agent}
                  className="w-4 h-4 rounded-full object-cover shrink-0"
                  style={{ outline: `1.5px solid ${AGENT_COLORS[msg.from_agent] ?? '#64748b'}` }}
                />
                <span style={{ color: AGENT_COLORS[msg.from_agent] ?? '#64748b' }} className="font-semibold text-[10px]">
                  {msg.from_agent}
                </span>
                {msg.to_agent !== 'self' && msg.to_agent !== msg.from_agent && (
                  <>
                    <span style={{ color: 'var(--color-text-muted)' }}>→</span>
                    <img
                      src={agentIconPath(msg.to_agent as AgentId)}
                      alt={msg.to_agent}
                      className="w-4 h-4 rounded-full object-cover shrink-0"
                      style={{ outline: `1.5px solid ${AGENT_COLORS[msg.to_agent] ?? '#64748b'}` }}
                    />
                    <span style={{ color: AGENT_COLORS[msg.to_agent] ?? '#cfcfc2' }} className="text-[10px]">
                      {msg.to_agent}
                    </span>
                  </>
                )}
                <span
                  className="text-[8px] font-bold px-1 rounded ml-1"
                  style={{ color: MSG_LABEL_COLOR[msg.msg_type], background: `${MSG_LABEL_COLOR[msg.msg_type]}18` }}
                >
                  {MSG_LABEL[msg.msg_type] ?? 'MSG'}
                </span>
                <span className="ml-auto" style={{ color: 'var(--color-text-muted)' }}>t{msg.step}</span>
              </div>
              <div className="leading-relaxed" style={{ color: 'var(--color-text-primary)' }}>{msg.text}</div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Shared memory entries at bottom */}
        {sharedMemory.length > 0 && filter === 'all' && (
          <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
            <div className="text-[8px] uppercase tracking-wider mb-1" style={{ color: 'var(--color-text-faint)' }}>
              Shared Memory
            </div>
            {sharedMemory.slice(-5).map((entry, i) => (
              <div key={i} className="text-[10px] rounded px-2 py-1 mb-0.5 border-l-2 border-l-purple-400 bg-purple-50 dark:bg-[rgba(174,129,255,0.07)]">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <img
                    src={agentIconPath(entry.author as AgentId)}
                    alt={entry.author}
                    className="w-4 h-4 rounded-full object-cover shrink-0"
                    style={{ outline: `1.5px solid ${AGENT_COLORS[entry.author] ?? '#ae81ff'}` }}
                  />
                  <span style={{ color: AGENT_COLORS[entry.author] ?? '#64748b' }} className="font-semibold">
                    {entry.author}
                  </span>
                  <span className="text-[8px] px-1 rounded" style={{ background: '#a855f715', color: '#a855f7' }}>
                    {entry.type}
                  </span>
                </div>
                <div className="leading-relaxed mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{entry.content}</div>
              </div>
            ))}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  )
}
