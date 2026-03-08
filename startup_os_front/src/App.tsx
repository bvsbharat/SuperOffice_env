import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Pause, RotateCcw, TrendingUp, Users, Zap, AlertCircle, MessageSquare, BarChart3, Settings, ChevronRight, Trophy, ZoomIn, ZoomOut, Maximize, Box, Sun, Moon } from 'lucide-react';
import Office3D from './components/Office3D';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import confetti from 'canvas-confetti';
import { Agent, AgentType, Metric, LogEntry, ScenarioType, Scenario } from './types';
import { INITIAL_AGENTS, SCENARIOS, getAgentPos } from './constants';

export default function App() {
  // Simulation State
  const [isRunning, setIsRunning] = useState(false);
  const [day, setDay] = useState(0);
  const [quarter, setQuarter] = useState(1);
  const [agents, setAgents] = useState<Agent[]>(INITIAL_AGENTS);
  const [scenario, setScenario] = useState<Scenario>(SCENARIOS[0]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);
  const [isScenarioExpanded, setIsScenarioExpanded] = useState(false);
  
  // Panel States
  const [isAgentsOpen, setIsAgentsOpen] = useState(true);
  const [isLogOpen, setIsLogOpen] = useState(true);
  const [isMetricsOpen, setIsMetricsOpen] = useState(true);
  const [isScenarioSelectOpen, setIsScenarioSelectOpen] = useState(true);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [viewMode, setViewMode] = useState<'birdsEye' | 'eagleEye' | '3d'>('3d');
  const [isLightMode, setIsLightMode] = useState(false);

  const [trees] = useState(() => 
    [...Array(12)].map(() => ({
      left: `${Math.random() * 90}%`,
      top: `${Math.random() * 90}%`,
    }))
  );

  const [metrics, setMetrics] = useState<Metric>({
    revenue: 0,
    burn: 50000,
    cash: 2000000,
    customers: 0,
    velocity: 50,
    nps: 70,
    mqls: 0,
    traffic: 0
  });

  const logEndRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom of logs
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Simulation Loop
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRunning) {
      interval = setInterval(() => {
        tick();
      }, 1000); // 1 second = 1 simulated day
    }
    return () => clearInterval(interval);
  }, [isRunning, day, metrics, agents, scenario]);

  const addLog = (agent: string, message: string, type: LogEntry['type'] = 'info') => {
    const newLog: LogEntry = {
      id: Math.random().toString(36).substr(2, 9),
      agent,
      message,
      type,
      timestamp: Date.now()
    };
    setLogs(prev => [...prev.slice(-49), newLog]);
  };

  const tick = () => {
    if (day >= 90) {
      handleQuarterEnd();
      return;
    }

    setDay(prev => prev + 1);

    // 1. Agent Logic & Task Updates
    const updatedAgents = agents.map(agent => {
      if (agent.status === 'working') {
        const newProgress = agent.taskProgress + (Math.random() * 20 + 5);
        if (newProgress >= 100) {
          const msg = `Completed task: ${agent.currentTask}`;
          addLog(agent.type, msg, 'reward');
          const willTalk = Math.random() > 0.4;
          let talkingTo;
          if (willTalk) {
            const others = agents.filter(a => a.id !== agent.id);
            talkingTo = others[Math.floor(Math.random() * others.length)].id;
          }
          return { ...agent, status: 'idle' as const, currentTask: undefined, taskProgress: 0, talkingTo, lastMessage: msg };
        }
        return { ...agent, taskProgress: newProgress };
      }

      const shouldStartWorking = Math.random() > 0.6;
      if (shouldStartWorking) {
        const task = agent.tasks[Math.floor(Math.random() * agent.tasks.length)];
        return { ...agent, status: 'working' as const, currentTask: task, taskProgress: 0, talkingTo: undefined, lastMessage: undefined };
      }
      
      let newTalkingTo = agent.talkingTo;
      let newLastMessage = agent.lastMessage;
      if (Math.random() > 0.7) {
        if (agent.talkingTo) {
          newTalkingTo = undefined;
          newLastMessage = undefined;
        } else {
          const others = agents.filter(a => a.id !== agent.id);
          newTalkingTo = others[Math.floor(Math.random() * others.length)].id;
          newLastMessage = "Hey, did you see the new metrics?";
        }
      }
      return { ...agent, status: 'idle' as const, currentTask: undefined, taskProgress: 0, talkingTo: newTalkingTo, lastMessage: newLastMessage };
    });

    // 2. Metric Calculations based on Scenario & Agent Actions
    const mod = scenario.modifiers;
    
    // Marketing & Content drive Traffic & MQLs
    const newTraffic = metrics.traffic + (Math.random() * 100 * mod.customerAcquisition);
    const newMQLs = metrics.mqls + (Math.random() * 10 * mod.customerAcquisition);
    
    // Sales converts MQLs to Customers
    const conversionRate = 0.1 * (metrics.nps / 100);
    const newCustomers = metrics.customers + Math.floor(newMQLs * conversionRate);
    
    // Revenue based on customers
    const newRevenue = newCustomers * 150; // $150 ARPU
    
    // Burn rate
    const dailyBurn = (metrics.burn * mod.burnRate) / 30;
    const newCash = metrics.cash - dailyBurn + (newRevenue / 30);

    // Velocity (Dev)
    const newVelocity = Math.min(100, Math.max(0, metrics.velocity + (Math.random() * 2 - 1) * mod.devVelocity));

    // Churn (Customer)
    const churnChance = (0.05 * mod.churnRate) / 30;
    const churned = Math.floor(newCustomers * churnChance);
    const finalCustomers = Math.max(0, newCustomers - churned);

    setMetrics(prev => ({
      ...prev,
      traffic: newTraffic,
      mqls: newMQLs,
      customers: finalCustomers,
      revenue: newRevenue,
      cash: newCash,
      velocity: newVelocity
    }));

    // 3. Log random events
    if (day % 10 === 0) {
      const activeAgent = updatedAgents[Math.floor(Math.random() * updatedAgents.length)];
      if (activeAgent.currentTask) {
        addLog(activeAgent.type, `Completed task: ${activeAgent.currentTask}`, 'reward');
      }
    }

    if (churned > 0 && day % 15 === 0) {
      addLog('Customer', `Lost ${churned} customers due to churn!`, 'alert');
    }

    setAgents(updatedAgents);
    
    // Update history for charts
    setHistory(prev => [...prev, {
      day: day + (quarter - 1) * 90,
      revenue: Math.floor(newRevenue),
      cash: Math.floor(newCash / 1000),
      customers: finalCustomers
    }].slice(-100));
  };

  const handleQuarterEnd = () => {
    setIsRunning(false);
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 }
    });
    addLog('System', `Quarter ${quarter} completed! Revenue: $${metrics.revenue.toLocaleString()}`, 'system');
    
    if (quarter < 4) {
      setQuarter(prev => prev + 1);
      setDay(0);
    } else {
      addLog('System', 'Yearly simulation complete!', 'system');
    }
  };

  const resetSimulation = () => {
    setIsRunning(false);
    setDay(0);
    setQuarter(1);
    setMetrics({
      revenue: 0,
      burn: 50000,
      cash: 2000000,
      customers: 0,
      velocity: 50,
      nps: 70,
      mqls: 0,
      traffic: 0
    });
    setAgents(INITIAL_AGENTS);
    setLogs([]);
    setHistory([]);
    addLog('System', 'Simulation reset.', 'system');
  };

  const getAgentMetrics = (agent: Agent) => {
    switch (agent.type) {
      case AgentType.CEO:
        return [
          { label: 'Cash', value: `$${Math.floor(metrics.cash).toLocaleString()}`, color: 'text-emerald-400' },
          { label: 'Revenue', value: `$${Math.floor(metrics.revenue).toLocaleString()}`, color: 'text-indigo-400' }
        ];
      case AgentType.MARKETING:
        return [
          { label: 'MQLs', value: Math.floor(metrics.mqls), color: 'text-indigo-400' },
          { label: 'Traffic', value: Math.floor(metrics.traffic).toLocaleString(), color: 'text-blue-400' }
        ];
      case AgentType.DEV:
      case AgentType.PLANNING:
        return [
          { label: 'Velocity', value: `${Math.floor(metrics.velocity)}%`, color: 'text-amber-400' }
        ];
      case AgentType.SALES:
        return [
          { label: 'Revenue', value: `$${Math.floor(metrics.revenue).toLocaleString()}`, color: 'text-indigo-400' },
          { label: 'Customers', value: metrics.customers, color: 'text-emerald-400' }
        ];
      case AgentType.CONTENT:
        return [
          { label: 'Traffic', value: Math.floor(metrics.traffic).toLocaleString(), color: 'text-blue-400' }
        ];
      case AgentType.CUSTOMER:
        return [
          { label: 'NPS', value: metrics.nps, color: 'text-emerald-400' }
        ];
      default:
        return [];
    }
  };

  return (
    <div className={`h-screen w-screen flex flex-col font-sans select-none ${isLightMode ? 'bg-slate-50 text-slate-900' : 'bg-slate-900 text-slate-200'}`}>
      {/* Header / HUD */}
      <header className={`h-16 border-b flex items-center justify-between px-6 z-50 ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2 rounded-lg shadow-lg shadow-indigo-500/20">
            <Zap className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className={`text-lg font-bold tracking-tight ${isLightMode ? 'text-slate-900' : 'text-white'}`}>StartupCraft RL <span className="text-indigo-400 font-mono text-xs ml-2">v1.0</span></h1>
            <p className="text-[10px] text-indigo-400 font-mono uppercase tracking-wider">Episode: Q{quarter} • Day {day}/90</p>
          </div>
        </div>

        <div className="flex items-center gap-8">
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-widest">Cash Reserve</span>
            <span className={`text-xl font-mono font-bold ${metrics.cash < 500000 ? 'text-rose-400' : 'text-emerald-400'}`}>
              ${Math.floor(metrics.cash).toLocaleString()}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-widest">Monthly Revenue</span>
            <span className="text-xl font-mono font-bold text-indigo-400">${Math.floor(metrics.revenue).toLocaleString()}</span>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setIsLightMode(!isLightMode)} className={`modern-button ${isLightMode ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'modern-button-secondary'}`}>
              {isLightMode ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button 
              onClick={() => setIsRunning(!isRunning)}
              className={`modern-button ${isRunning ? 'modern-button-danger' : 'modern-button-primary'}`}
            >
              {isRunning ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button onClick={resetSimulation} className={`modern-button ${isLightMode ? 'bg-slate-200 text-slate-700 hover:bg-slate-300' : 'modern-button-secondary'}`}>
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden">
        {/* Left Sidebar: Agents */}
        <motion.aside 
          animate={{ width: isAgentsOpen ? 320 : 24 }}
          className={`border-r flex flex-col shrink-0 overflow-hidden relative ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'}`}
        >
          {/* Closed State Bar */}
          {!isAgentsOpen && (
            <div 
              className={`absolute inset-0 flex items-center justify-center cursor-pointer z-10 transition-colors ${isLightMode ? 'hover:bg-slate-200' : 'hover:bg-slate-800'}`}
              onClick={() => setIsAgentsOpen(true)}
            >
              <ChevronRight size={14} className="text-slate-500" />
            </div>
          )}

          {/* Opened State Content */}
          <div className={`flex flex-col h-full w-80 transition-opacity duration-200 ${isAgentsOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div 
              className={`p-3 border-b flex items-center cursor-pointer transition-colors h-12 shrink-0 ${isLightMode ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-800 hover:bg-slate-800'}`}
              onClick={() => setIsAgentsOpen(false)}
            >
              <ChevronRight size={14} className="text-slate-500 transition-transform shrink-0 rotate-180" />
              <h2 className="ml-2 text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">Agents (RL Entities)</h2>
            </div>
            <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
            <div className="space-y-3">
              {agents.map(agent => (
              <motion.div 
                key={agent.id}
                layout
                onClick={() => setExpandedAgentId(expandedAgentId === agent.id ? null : agent.id)}
                className={`relative overflow-hidden p-3 mb-2 border-2 transition-all cursor-pointer rounded-xl shadow-sm ${agent.status === 'working' ? (isLightMode ? 'border-indigo-400 bg-indigo-50' : 'border-indigo-500/50 bg-indigo-500/5') : (isLightMode ? 'border-slate-200 bg-white hover:border-slate-300' : 'border-transparent bg-slate-800/30 hover:bg-slate-800/50')} ${expandedAgentId === agent.id ? 'ring-2 ring-indigo-500/50' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center text-xl shrink-0 shadow-inner">
                    {agent.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-1">
                      <h3 className={`text-xs font-bold truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}>{agent.type}</h3>
                      <div className="flex items-center gap-2">
                        <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold tracking-wider ${agent.status === 'working' ? 'bg-indigo-500 text-white' : 'bg-slate-700 text-slate-400'}`}>
                          {agent.status.toUpperCase()}
                        </span>
                        <ChevronRight size={12} className={`text-slate-500 transition-transform ${expandedAgentId === agent.id ? 'rotate-90' : ''}`} />
                      </div>
                    </div>
                    <p className={`text-[10px] truncate italic ${isLightMode ? 'text-slate-500' : 'text-slate-400'}`}>
                      {agent.currentTask || 'Idle...'}
                    </p>
                  </div>
                </div>
                
                <AnimatePresence>
                  {expandedAgentId === agent.id && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className={`mt-4 pt-4 border-t grid grid-cols-2 gap-2 ${isLightMode ? 'border-slate-200' : 'border-slate-700/50'}`}>
                        {getAgentMetrics(agent).map((m, idx) => (
                          <div key={idx} className={`p-2 rounded-lg border shadow-inner ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/80 border-slate-700/50'}`}>
                            <div className="text-[8px] text-slate-500 uppercase font-bold tracking-wider mb-1">{m.label}</div>
                            <div className={`text-xs font-mono font-bold ${m.color}`}>{m.value}</div>
                          </div>
                        ))}
                      </div>
                      
                      <div className={`mt-3 p-2 rounded-lg border ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900/40 border-slate-800/50'}`}>
                        <div className="text-[8px] text-slate-500 uppercase font-bold tracking-wider mb-1.5">Optimization Targets</div>
                        <div className="flex flex-wrap gap-1">
                          {agent.rewardSignals.map((sig, idx) => (
                            <span key={idx} className="text-[7px] bg-indigo-500/10 text-indigo-300 px-1.5 py-0.5 rounded border border-indigo-500/20">
                              {sig}
                            </span>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {agent.status === 'working' && (
                  <div className="mt-2">
                    <div className="flex justify-between text-[8px] text-indigo-400 font-mono uppercase mb-1">
                      <span>Task Progress</span>
                      <span>{Math.floor(agent.taskProgress)}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <motion.div 
                        className="h-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]"
                        initial={{ width: '0%' }}
                        animate={{ width: `${agent.taskProgress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Reward Bar */}
                <div className="mt-3">
                  <div className="flex justify-between text-[8px] text-amber-500 font-mono uppercase mb-1">
                    <span>Coop Score</span>
                    <span>{agent.coopScore}%</span>
                  </div>
                  <div className="h-1 bg-slate-950 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-amber-500"
                      initial={{ width: '0%' }}
                      animate={{ width: `${agent.coopScore}%` }}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
            </div>
          </div>
          </div>
        </motion.aside>

        {/* Center: World View & Charts */}
        <section className={`flex-1 flex flex-col relative ${isLightMode ? 'bg-slate-50' : 'bg-slate-900'}`}>
          {/* 2D Bird's Eye Office Simulation */}
          <div className="flex-1 relative overflow-hidden flex items-center justify-center p-8 bg-green-200">
            {/* Garden Background */}
            <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(#22c55e 2px, transparent 2px)', backgroundSize: '30px 30px' }} />
            
            {/* Static Trees */}
            {trees.map((pos, i) => (
              <div key={`tree-${i}`} className="absolute w-16 h-16 bg-green-700 rounded-full shadow-2xl border-4 border-green-800 flex items-center justify-center"
                   style={{
                     left: pos.left,
                     top: pos.top,
                     opacity: 0.9
                   }}>
                <div className="w-10 h-10 bg-green-600 rounded-full" />
              </div>
            ))}

            {/* View Controls */}
            <div className="absolute top-4 left-4 z-30 flex gap-2">
              <button 
                onClick={() => { setViewMode('birdsEye'); setZoomLevel(1); }} 
                className={`px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm border shadow-lg transition-colors ${viewMode === 'birdsEye' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'}`}
              >
                Bird's Eye
              </button>
              <button 
                onClick={() => { setViewMode('eagleEye'); setZoomLevel(0.6); }} 
                className={`px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm border shadow-lg transition-colors ${viewMode === 'eagleEye' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'}`}
              >
                Eagle Eye
              </button>
              <button 
                onClick={() => { setViewMode('3d'); setZoomLevel(1); }} 
                className={`px-3 py-1.5 rounded-lg text-xs font-bold backdrop-blur-sm border shadow-lg transition-colors flex items-center gap-1 ${viewMode === '3d' ? 'bg-emerald-600 text-white border-emerald-500' : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'}`}
              >
                <Box size={14} /> 3D View
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="absolute top-4 right-4 z-30 flex gap-2">
              <button onClick={() => setZoomLevel(z => Math.min(z + 0.2, 2))} className="bg-slate-800/80 hover:bg-slate-700 p-2 rounded-lg text-white backdrop-blur-sm border border-slate-700 shadow-lg transition-colors"><ZoomIn size={16}/></button>
              <button onClick={() => setZoomLevel(z => Math.max(z - 0.2, 0.5))} className="bg-slate-800/80 hover:bg-slate-700 p-2 rounded-lg text-white backdrop-blur-sm border border-slate-700 shadow-lg transition-colors"><ZoomOut size={16}/></button>
              <button onClick={() => setZoomLevel(1)} className="bg-slate-800/80 hover:bg-slate-700 p-2 rounded-lg text-white backdrop-blur-sm border border-slate-700 shadow-lg transition-colors"><Maximize size={16}/></button>
            </div>

            {viewMode === '3d' ? (
              <div className="absolute inset-0 z-10">
                <Office3D agents={agents} trees={trees} viewMode={viewMode} zoomLevel={zoomLevel} />
              </div>
            ) : (
              <motion.div 
                className="relative w-full max-w-4xl aspect-[1/1] bg-slate-200 rounded-xl border-[12px] border-slate-700 shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden z-10"
                animate={{ 
                  scale: zoomLevel,
                  rotateX: 0,
                  y: 0
                }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                style={{ transformStyle: 'preserve-3d', perspective: '1000px' }}
              >
              {/* Floor pattern */}
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
              
              {/* Lobby Area (Top Center) */}
              <div className="absolute bg-slate-300/40" style={{ left: '33.33%', top: '0%', width: '33.33%', height: '33.33%' }}>
                <div className="absolute top-2 left-2 text-slate-500 font-bold tracking-widest text-xs opacity-50">LOBBY</div>
                
                {/* Arcade Machine */}
                <div className="absolute right-4 top-4 w-10 h-12 bg-purple-900 rounded-sm shadow-lg border-2 border-purple-950 flex flex-col items-center justify-start overflow-hidden">
                  <div className="w-full h-4 bg-black mt-1 flex items-center justify-center">
                    <div className="w-6 h-2 bg-cyan-400 rounded-sm animate-pulse" />
                  </div>
                  <div className="w-full h-2 bg-purple-800 mt-1 flex justify-around px-1">
                    <div className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                  </div>
                </div>

                {/* Reception Desk */}
                <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-24 bg-amber-800 rounded-sm shadow-xl border-2 border-amber-950">
                  <div className="absolute right-0 top-0 w-3 h-full bg-amber-900 rounded-r-sm" />
                  {/* Computer on desk */}
                  <div className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-8 bg-slate-900 rounded-sm border border-slate-700" />
                </div>
                
                {/* Sofa */}
                <div className="absolute right-4 bottom-4 w-16 h-10 bg-indigo-700 rounded-lg shadow-xl border-2 border-indigo-900 flex items-center justify-center">
                  <div className="w-14 h-8 bg-indigo-600 rounded-md" />
                </div>
              </div>

              {/* Grid of 8 rooms */}
              {agents.map((agent, i) => {
                const { col, row } = getAgentPos(i);
                
                // Determine theme based on agent type
                let roomBg = 'bg-slate-300/50';
                let deskColor = 'bg-amber-700';
                let floorPattern = '';
                let decoration = null;
                
                if (agent.type.includes('CEO')) {
                  roomBg = 'bg-slate-800';
                  deskColor = 'bg-slate-900';
                  floorPattern = 'radial-gradient(#334155 2px, transparent 2px)';
                  decoration = (
                    <>
                      {/* Red Carpet */}
                      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3/4 h-3/4 bg-red-900/40 rounded-sm border-2 border-red-800/50" />
                      <div className="absolute right-2 top-2 w-8 h-12 bg-amber-900/50 rounded-sm border border-amber-700/50 flex items-center justify-center z-10">
                        <div className="w-6 h-8 bg-slate-200 rounded-sm shadow-sm" /> {/* Whiteboard */}
                      </div>
                    </>
                  );
                } else if (agent.type.includes('CTO') || agent.type.includes('Developer')) {
                  roomBg = 'bg-slate-900';
                  deskColor = 'bg-slate-800';
                  floorPattern = 'linear-gradient(0deg, transparent 24%, rgba(56, 189, 248, 0.05) 25%, rgba(56, 189, 248, 0.05) 26%, transparent 27%, transparent 74%, rgba(56, 189, 248, 0.05) 75%, rgba(56, 189, 248, 0.05) 76%, transparent 77%, transparent), linear-gradient(90deg, transparent 24%, rgba(56, 189, 248, 0.05) 25%, rgba(56, 189, 248, 0.05) 26%, transparent 27%, transparent 74%, rgba(56, 189, 248, 0.05) 75%, rgba(56, 189, 248, 0.05) 76%, transparent 77%, transparent)';
                  decoration = (
                    <div className="absolute right-2 bottom-2 w-6 h-6 bg-slate-800 rounded-sm border border-cyan-500/30 flex items-center justify-center shadow-[0_0_10px_rgba(6,182,212,0.2)]">
                      <div className="w-4 h-4 bg-cyan-900 rounded-sm animate-pulse" /> {/* Server rack */}
                    </div>
                  );
                } else if (agent.type.includes('Sales') || agent.type.includes('Marketing') || agent.type.includes('CMO')) {
                  roomBg = 'bg-blue-900/20';
                  deskColor = 'bg-blue-900/60';
                  decoration = (
                    <div className="absolute right-2 top-2 w-6 h-6 bg-emerald-600 rounded-full shadow-md border border-emerald-800">
                      <div className="absolute inset-1 bg-emerald-500 rounded-full" /> {/* Plant */}
                    </div>
                  );
                } else if (agent.type.includes('Product') || agent.type.includes('Design')) {
                  roomBg = 'bg-purple-900/20';
                  deskColor = 'bg-purple-900/60';
                  decoration = (
                    <div className="absolute left-2 top-2 flex gap-1">
                      <div className="w-3 h-3 bg-pink-400 rounded-sm shadow-sm rotate-12" /> {/* Sticky notes */}
                      <div className="w-3 h-3 bg-yellow-400 rounded-sm shadow-sm -rotate-6" />
                    </div>
                  );
                } else if (agent.type.includes('Data')) {
                  roomBg = 'bg-emerald-900/20';
                  deskColor = 'bg-emerald-900/60';
                } else {
                  roomBg = 'bg-orange-900/20';
                  deskColor = 'bg-orange-900/60';
                }

                let deskStyle = {};
                let monitorStyle = {};
                let chairStyle = {};
                if (col === 0) {
                  deskStyle = { left: '10%', top: '10%', width: '25%', height: '80%' };
                  monitorStyle = { right: '10%', top: '50%', width: '4px', height: '40%', transform: 'translateY(-50%)', borderRight: '2px solid #38bdf8' };
                  chairStyle = { left: '45%', top: '50%', transform: 'translateY(-50%)' };
                } else if (col === 2) {
                  deskStyle = { right: '10%', top: '10%', width: '25%', height: '80%' };
                  monitorStyle = { left: '10%', top: '50%', width: '4px', height: '40%', transform: 'translateY(-50%)', borderLeft: '2px solid #38bdf8' };
                  chairStyle = { right: '45%', top: '50%', transform: 'translateY(-50%)' };
                } else if (row === 2) {
                  deskStyle = { left: '10%', bottom: '10%', width: '80%', height: '25%' };
                  monitorStyle = { top: '10%', left: '50%', height: '4px', width: '40%', transform: 'translateX(-50%)', borderTop: '2px solid #38bdf8' };
                  chairStyle = { left: '50%', bottom: '45%', transform: 'translateX(-50%)' };
                } else if (col === 1 && row === 1) {
                  deskStyle = { left: '10%', top: '20%', width: '80%', height: '25%' };
                  monitorStyle = { bottom: '10%', left: '50%', height: '4px', width: '40%', transform: 'translateX(-50%)', borderBottom: '2px solid #38bdf8' };
                  chairStyle = { left: '50%', top: '55%', transform: 'translateX(-50%)' };
                }

                return (
                  <div key={`room-${i}`} className={`absolute ${roomBg} overflow-hidden shadow-inner`}
                       style={{
                         left: `${col * 33.33}%`,
                         top: `${row * 33.33}%`,
                         width: '33.33%',
                         height: '33.33%',
                         backgroundSize: '20px 20px',
                         backgroundImage: floorPattern || undefined
                       }}>
                     {/* Room Label */}
                     <div className={`absolute left-2 text-[8px] font-bold text-slate-500 uppercase tracking-wider opacity-70 ${row === 0 ? 'top-1' : 'bottom-1'}`}>
                       {agent.type}
                     </div>
                     
                     {decoration}
                     
                     {/* Desk */}
                     <div className={`absolute ${deskColor} rounded-sm shadow-lg border border-black/30`}
                          style={deskStyle}>
                        {/* Monitor */}
                        <div className="absolute bg-slate-900 rounded-sm shadow-md"
                             style={monitorStyle} />
                     </div>
                     
                     {/* Chair */}
                     <div className="absolute bg-slate-800 w-7 h-7 rounded-full shadow-lg border-2 border-slate-900"
                          style={chairStyle} />
                  </div>
                )
              })}

              {/* Agents */}
              {agents.map((agent, i) => {
                const { col, row } = getAgentPos(i);
                const centerX = 16.66 + col * 33.33;
                const centerY = 16.66 + row * 33.33;
                
                let targetX = centerX;
                let targetY = centerY;
                let rotate = 0;

                if (col === 0) rotate = 90;
                else if (col === 2) rotate = -90;
                else if (row === 2) rotate = 0;
                else if (col === 1 && row === 1) rotate = 180;

                if (agent.status === 'idle') {
                  if (agent.talkingTo) {
                    const targetIndex = agents.findIndex(a => a.id === agent.talkingTo);
                    if (targetIndex !== -1 && targetIndex !== i) {
                      const { col: tCol, row: tRow } = getAgentPos(targetIndex);
                      const tCenterX = 16.66 + tCol * 33.33;
                      const tCenterY = 16.66 + tRow * 33.33;
                      
                      targetX = tCenterX + (i % 2 === 0 ? -5 : 5);
                      targetY = tCenterY + (i % 3 === 0 ? -5 : 5);
                      rotate = Math.atan2(tCenterY - targetY, tCenterX - targetX) * (180 / Math.PI) + 90;
                    } else {
                      targetX = 50 + (i % 3) * 5 - 5;
                      targetY = 16.66 + (i % 2) * 5;
                      rotate = 180;
                    }
                  } else {
                    targetX = 50 + (i % 3) * 5 - 5;
                    targetY = 16.66 + (i % 2) * 5;
                    rotate = 180;
                  }
                }

                const SHIRT_COLORS = [
                  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500', 
                  'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500'
                ];

                return (
                  <motion.div
                    key={agent.id}
                    className="absolute z-20 flex flex-col items-center justify-center"
                    animate={{
                      left: `${targetX}%`,
                      top: `${targetY}%`,
                      rotate: rotate
                    }}
                    transition={{ duration: 1.2, ease: "easeInOut" }}
                    style={{ x: '-50%', y: '-50%' }}
                  >
                    <motion.div 
                       className={`relative w-8 h-4 ${SHIRT_COLORS[i]} rounded-full flex items-center justify-center shadow-md`}
                       animate={agent.status === 'working' ? { rotateZ: [-3, 3, -3] } : { rotateZ: [-10, 10, -10] }}
                       transition={{ repeat: Infinity, duration: agent.status === 'working' ? 0.2 : 0.6 }}
                    >
                       {/* Head */}
                       <div className="absolute w-5 h-5 bg-amber-200 rounded-full border border-slate-900/20 -top-0.5 shadow-sm overflow-hidden flex items-center justify-center text-[10px]">
                       </div>
                    </motion.div>
                    
                    {/* Name Tag */}
                    <motion.div 
                       className="absolute mt-8 bg-slate-900/90 text-white text-[9px] px-1.5 py-0.5 rounded font-bold whitespace-nowrap shadow-lg"
                       animate={{ rotate: -rotate }} // Keep upright
                       transition={{ duration: 1.2, ease: "easeInOut" }}
                    >
                      {agent.type}
                    </motion.div>

                    {/* Speech Bubble */}
                    <AnimatePresence>
                      {agent.status === 'idle' && agent.talkingTo && agent.lastMessage && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0, y: 10 }}
                          animate={{ opacity: 1, scale: 1, y: 0, rotate: -rotate }}
                          exit={{ opacity: 0, scale: 0, y: 10 }}
                          className="absolute -top-12 -right-12 bg-white text-slate-900 text-[9px] px-3 py-2 rounded-xl rounded-bl-none shadow-xl font-medium z-30 max-w-[120px] border border-slate-200"
                          style={{ transformOrigin: 'bottom left' }}
                        >
                          {agent.lastMessage}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </motion.div>
            )}

            {/* Scenario Overlay */}
            <div className="absolute bottom-4 left-4 z-30 flex flex-col-reverse items-start gap-2">
              <button 
                onClick={() => setIsScenarioExpanded(!isScenarioExpanded)}
                className={`flex items-center gap-2 border p-2 rounded-lg transition-colors shadow-lg ${isLightMode ? 'bg-white/90 border-amber-400 text-amber-600 hover:bg-amber-50' : 'bg-slate-900/90 border-amber-500/30 text-amber-500 hover:bg-slate-800'}`}
              >
                <AlertCircle size={16} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Active Scenario</span>
                <ChevronRight size={14} className={`transition-transform ${isScenarioExpanded ? '-rotate-90' : 'rotate-90'}`} />
              </button>
              <AnimatePresence>
                {isScenarioExpanded && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className={`p-3 w-64 rounded-xl shadow-2xl origin-bottom-left border backdrop-blur-md ${isLightMode ? 'bg-white/95 border-amber-400' : 'bg-slate-900/95 border-amber-500/30'}`}
                  >
                    <h4 className={`text-xs font-bold truncate ${isLightMode ? 'text-slate-900' : 'text-white'}`}>{scenario.type}</h4>
                    <p className={`text-[9px] mt-1 leading-relaxed ${isLightMode ? 'text-slate-600' : 'text-slate-400'}`}>{scenario.description}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Bottom Panel: Metrics & Controls */}
          <div className={`border-t flex shrink-0 ${isLightMode ? 'bg-white border-slate-200' : 'bg-slate-950 border-slate-800'}`}>
            <motion.div 
              animate={{ height: isMetricsOpen ? 256 : 40, flex: isMetricsOpen ? 1 : 0.5 }}
              className={`border-r flex flex-col overflow-hidden ${isLightMode ? 'border-slate-200' : 'border-slate-800'}`}
            >
              <div 
                className={`p-3 border-b flex items-center justify-between cursor-pointer transition-colors ${isLightMode ? 'border-slate-200 hover:bg-slate-50' : 'border-slate-800 hover:bg-slate-900'}`}
                onClick={() => setIsMetricsOpen(!isMetricsOpen)}
              >
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Growth Metrics</span>
                <div className="flex items-center gap-4">
                  <div className={`flex gap-4 text-[10px] font-mono transition-opacity ${!isMetricsOpen ? 'opacity-0' : 'opacity-100'}`}>
                    <span className="flex items-center gap-1 text-indigo-400"><TrendingUp size={10}/> Revenue</span>
                    <span className="flex items-center gap-1 text-emerald-400"><Users size={10}/> Customers</span>
                  </div>
                  <ChevronRight size={14} className={`text-slate-500 transition-transform ${isMetricsOpen ? 'rotate-90' : ''}`} />
                </div>
              </div>
              <div className="p-4 flex-1 min-w-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="day" hide />
                    <YAxis hide />
                    <Tooltip 
                      contentStyle={{ backgroundColor: isLightMode ? '#ffffff' : '#0f172a', border: `1px solid ${isLightMode ? '#e2e8f0' : '#334155'}`, borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ color: isLightMode ? '#0f172a' : '#fff' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorRev)" />
                    <Area type="monotone" dataKey="customers" stroke="#10b981" strokeWidth={2} fillOpacity={0} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <motion.div 
              animate={{ height: isScenarioSelectOpen ? 256 : 40, width: isScenarioSelectOpen ? 320 : 180 }}
              className={`flex flex-col overflow-hidden shrink-0 ${isLightMode ? 'bg-slate-50/50' : 'bg-slate-900/50'}`}
            >
              <div 
                className={`p-3 border-b flex items-center justify-between cursor-pointer transition-colors ${isLightMode ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-800 hover:bg-slate-800'}`}
                onClick={() => setIsScenarioSelectOpen(!isScenarioSelectOpen)}
              >
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">Scenario Select</span>
                <ChevronRight size={14} className={`text-slate-500 transition-transform shrink-0 ${isScenarioSelectOpen ? 'rotate-90' : ''}`} />
              </div>
              <div className="p-4 w-80">
                <div className="grid grid-cols-1 gap-2">
                  {SCENARIOS.map(s => (
                    <button
                      key={s.type}
                      onClick={() => setScenario(s)}
                      className={`text-left px-3 py-2 text-[10px] rounded-lg border transition-all ${scenario.type === s.type ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-500/20' : (isLightMode ? 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50' : 'bg-slate-800/50 border-slate-700 text-slate-400 hover:bg-slate-700')}`}
                    >
                      {s.type}
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Right Sidebar: Logs */}
        <motion.aside 
          animate={{ width: isLogOpen ? 320 : 24 }}
          className={`border-l flex flex-col shrink-0 overflow-hidden relative ${isLightMode ? 'bg-slate-50 border-slate-200' : 'bg-slate-900 border-slate-800'}`}
        >
          {/* Closed State Bar */}
          {!isLogOpen && (
            <div 
              className={`absolute inset-0 flex items-center justify-center cursor-pointer z-10 transition-colors ${isLightMode ? 'hover:bg-slate-200' : 'hover:bg-slate-800'}`}
              onClick={() => setIsLogOpen(true)}
            >
              <ChevronRight size={14} className="text-slate-500 rotate-180" />
            </div>
          )}

          {/* Opened State Content */}
          <div className={`flex flex-col h-full w-80 transition-opacity duration-200 ${isLogOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
            <div 
              className={`p-3 border-b flex items-center justify-between cursor-pointer transition-colors shrink-0 ${isLightMode ? 'border-slate-200 hover:bg-slate-100' : 'border-slate-800 hover:bg-slate-800'}`}
              onClick={() => setIsLogOpen(false)}
            >
              <ChevronRight size={14} className="text-slate-500 transition-transform shrink-0" />
              <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-[0.2em] whitespace-nowrap">Simulation Log</h2>
              <MessageSquare size={14} className="text-slate-500 shrink-0" />
            </div>
            <div className={`flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar ${isLightMode ? 'bg-slate-100/50' : 'bg-slate-950/30'}`}>
              {logs.map(log => (
                <div key={log.id} className="text-[11px] leading-tight font-mono">
                  <span className="text-slate-600">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>{' '}
                  <span className={`font-bold ${
                    log.type === 'reward' ? 'text-amber-400' : 
                    log.type === 'alert' ? 'text-rose-400' : 
                    log.type === 'system' ? 'text-indigo-400' : 'text-emerald-400'
                  }`}>
                    &lt;{log.agent}&gt;
                  </span>{' '}
                  <span className={isLightMode ? 'text-slate-700' : 'text-slate-300'}>{log.message}</span>
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
            <div className={`p-4 border-t shrink-0 ${isLightMode ? 'bg-slate-100 border-slate-200' : 'bg-slate-950/50 border-slate-800'}`}>
              <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                <span>Global Reward</span>
                <span className="text-emerald-400">+{Math.floor(metrics.revenue / 1000)}pts</span>
              </div>
              <div className={`h-2 rounded-full overflow-hidden border ${isLightMode ? 'bg-slate-200 border-slate-300' : 'bg-slate-950 border-slate-800'}`}>
                <motion.div 
                  className="h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                  animate={{ width: `${Math.min(100, (metrics.revenue / 10000) * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </motion.aside>
      </main>

      {/* Global CSS for scrollbar */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #334155;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #475569;
        }
      `}</style>
    </div>
  );
}
