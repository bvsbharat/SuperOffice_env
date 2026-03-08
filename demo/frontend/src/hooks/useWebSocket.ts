import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store/useStore'
import type { StepResult, GTMState } from '../types'

const WS_URL = 'ws://localhost:8080/ws/live'
const RECONNECT_DELAY = 2000
const MAX_RECONNECT = 10

export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null)
  const reconnectCount = useRef(0)
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { setWsConnected, applyStepResult, applyFullState } = useStore()

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return

    ws.current = new WebSocket(WS_URL)

    ws.current.onopen = () => {
      setWsConnected(true)
      reconnectCount.current = 0
    }

    ws.current.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data)
        if (msg.type === 'step') {
          applyStepResult(msg as StepResult)
        } else if (msg.type === 'connected' || msg.type === 'reset') {
          if (msg.state) applyFullState(msg.state as GTMState)
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.current.onclose = () => {
      setWsConnected(false)
      if (reconnectCount.current < MAX_RECONNECT) {
        reconnectCount.current++
        reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY)
      }
    }

    ws.current.onerror = () => {
      ws.current?.close()
    }
  }, [setWsConnected, applyStepResult, applyFullState])

  const sendPing = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send('ping')
    }
  }, [])

  useEffect(() => {
    connect()
    const pingInterval = setInterval(sendPing, 15000)
    return () => {
      clearInterval(pingInterval)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      ws.current?.close()
    }
  }, [connect, sendPing])
}
