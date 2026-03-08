import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  onClose: () => void
}

export function ScenarioSelector({ onClose }: Props) {
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.92, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-xl p-6 w-[480px] max-w-[95vw] shadow-xl"
          style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)' }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>Real RL Environment</h2>
            <button onClick={onClose} className="text-lg" style={{ color: 'var(--color-text-faint)' }}>x</button>
          </div>

          <div className="text-[11px] space-y-2" style={{ color: 'var(--color-text-muted)' }}>
            <p>This simulation uses the real <strong>office_os</strong> RL environment with 7 LLM-powered agents.</p>
            <p>Each agent uses a real language model (Claude or ART/vLLM) to make decisions.</p>
            <p>Configure simulation parameters via server startup flags:</p>
            <ul className="list-disc ml-4 space-y-1 text-[10px] font-mono" style={{ color: 'var(--color-text-faint)' }}>
              <li>--provider bedrock|art</li>
              <li>--days N (default: 10)</li>
              <li>--art-endpoint URL</li>
            </ul>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
