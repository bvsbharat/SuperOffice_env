import React from 'react';

export enum AgentType {
  CEO = 'CEO',
  PLANNING = 'Planning/HR',
  MARKETING = 'Marketing',
  CONTENT = 'Content Builder',
  DEV = 'Dev',
  SALES = 'Sales',
  SCENE = 'Scene',
  CUSTOMER = 'Customer'
}

export interface Agent {
  id: string;
  type: AgentType;
  icon: string;
  tasks: string[];
  rewardSignals: string[];
  status: 'idle' | 'working' | 'success' | 'failure';
  currentTask?: string;
  taskProgress: number;
  reward: number;
  coopScore: number;
  talkingTo?: string;
  lastMessage?: string;
}

export interface Metric {
  revenue: number;
  burn: number;
  cash: number;
  customers: number;
  velocity: number;
  nps: number;
  mqls: number;
  traffic: number;
}

export interface LogEntry {
  id: string;
  agent: string;
  message: string;
  type: 'info' | 'reward' | 'alert' | 'system';
  timestamp: number;
}

export enum ScenarioType {
  BASELINE = 'Baseline GTM',
  SERIES_A = 'Series A Pressure',
  COMPETITOR = 'Competitor Launch',
  CHURN = 'Churn Spike',
  VIRAL = 'Viral Moment'
}

export interface Scenario {
  type: ScenarioType;
  description: string;
  modifiers: {
    burnRate: number;
    customerAcquisition: number;
    churnRate: number;
    devVelocity: number;
  };
}
