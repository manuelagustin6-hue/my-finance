import { isSupabaseConfigured } from '@/lib/config';
import { currentPlan } from '@/state/app';
import { LocalRepository } from './localRepository';
import { LocalMarketClient, RemoteMarketClient, type MarketClient } from './market';
import { SupabaseRepository } from './supabaseRepository';
import type { Repository } from './types';

const getPlan = () => currentPlan();

const remoteMarket = isSupabaseConfigured ? new RemoteMarketClient() : null;

export const market: MarketClient = remoteMarket ?? new LocalMarketClient(getPlan);

export const repository: Repository = remoteMarket ? new SupabaseRepository(remoteMarket) : new LocalRepository(getPlan);

export const isDemoMode = !isSupabaseConfigured;

export * from './types';
export { ProRequiredError } from './market';
