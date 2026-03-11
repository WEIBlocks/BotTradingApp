import {Gladiator} from '../types';
import {arenaDatasets} from './mockEquityData';

export const mockGladiators: Gladiator[] = [
  {
    id: 'g1', name: 'Momentum Alpha', strategy: 'Trend Following', statLabel: '92% Win Rate',
    winRate: 92, level: 42, avatarColor: '#10B981', selected: true,
    currentReturn: 35.2, equityData: arenaDatasets[0],
  },
  {
    id: 'g2', name: 'BTC Scalper', strategy: 'High Frequency', statLabel: '1m Frames',
    winRate: 78, level: 38, avatarColor: '#3B82F6', selected: true,
    currentReturn: 22.1, equityData: arenaDatasets[1],
  },
  {
    id: 'g3', name: 'RSI Rebound', strategy: 'Mean Reversion', statLabel: 'Low Risk',
    winRate: 71, level: 35, avatarColor: '#EC4899', selected: true,
    currentReturn: 16.5, equityData: arenaDatasets[2],
  },
  {
    id: 'g4', name: 'Grid Master', strategy: 'Sideways', statLabel: 'Steady Gain',
    winRate: 65, level: 32, avatarColor: '#22D3EE', selected: false,
    currentReturn: 13.2, equityData: arenaDatasets[3],
  },
  {
    id: 'g5', name: 'Whale Watcher', strategy: 'Volume Analysis', statLabel: 'High Impact',
    winRate: 58, level: 29, avatarColor: '#A855F7', selected: false,
    currentReturn: 9.1, equityData: arenaDatasets[4],
  },
];
