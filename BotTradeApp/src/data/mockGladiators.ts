import {Gladiator} from '../types';
import {arenaDatasets} from './mockEquityData';

export const mockGladiators: Gladiator[] = [
  {
    id: 'g1', name: 'Titan Core', strategy: 'Momentum Surge',
    winRate: 71, level: 5, avatarColor: '#10B981', selected: false,
    currentReturn: 35.2, equityData: arenaDatasets[0],
  },
  {
    id: 'g2', name: 'Neural Alpha', strategy: 'AI Pattern Recognition',
    winRate: 68, level: 4, avatarColor: '#A855F7', selected: false,
    currentReturn: 22.1, equityData: arenaDatasets[1],
  },
  {
    id: 'g3', name: 'Flash Scalp', strategy: 'High-Frequency',
    winRate: 79, level: 3, avatarColor: '#EC4899', selected: false,
    currentReturn: 16.5, equityData: arenaDatasets[2],
  },
  {
    id: 'g4', name: 'Eth Whale', strategy: 'Large Cap Arbitrage',
    winRate: 64, level: 3, avatarColor: '#22D3EE', selected: false,
    currentReturn: 13.2, equityData: arenaDatasets[3],
  },
  {
    id: 'g5', name: 'Alpha Vector', strategy: 'Trend Reversal',
    winRate: 58, level: 2, avatarColor: '#EAB308', selected: false,
    currentReturn: 9.1, equityData: arenaDatasets[4],
  },
  {
    id: 'g6', name: 'Nebula Prime', strategy: 'Grid Trading',
    winRate: 62, level: 2, avatarColor: '#F97316', selected: false,
    currentReturn: 11.4, equityData: arenaDatasets[3],
  },
  {
    id: 'g7', name: 'Gold Rush', strategy: 'Commodity Arbitrage',
    winRate: 55, level: 1, avatarColor: '#EAB308', selected: false,
    currentReturn: 7.8, equityData: arenaDatasets[4],
  },
];
