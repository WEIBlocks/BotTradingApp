/**
 * Auto-Trainer Job
 *
 * Runs every 30 minutes:
 * 1. Checks all active bots for performance drift → triggers trainer agent
 * 2. FIX 3: Checks pending trainer suggestions whose shadow validation window
 *    has expired → compares post-change performance vs pre-change baseline →
 *    auto-promotes if improved, discards if not (for AUTO mode bots)
 */

import { db } from '../config/database.js';
import { bots } from '../db/schema/bots.js';
import { eq } from 'drizzle-orm';
import { redisConnection } from '../config/queue.js';
import {
  runAutoTrainerCheck,
  DEFAULT_TRAINER_CONFIG,
  type TrainerConfig,
  type TrainerInsight,
  analyzeBotPerformance,
  promotePendingChanges,
} from '../modules/trainer/trainer.service.js';

let intervalHandle: ReturnType<typeof setInterval> | null = null;

// ─── FIX 3: Shadow Validation Checker ────────────────────────────────────────
// For every bot that has a pending trainer suggestion, check if the validation
// deadline has passed. If so, compare current performance vs the stored baseline
// (win rate + profit factor measured at the time the suggestion was generated).
// Auto-promote for AUTO mode bots if performance improved; discard if not.
// For SUGGESTIONS mode: just annotate the insight log with the comparison result
// so the creator can make an informed decision.

async function checkShadowValidations() {
  try {
    const allBots = await db.select({
      id: bots.id,
      creatorId: bots.creatorId,
      trainerConfig: bots.trainerConfig,
    }).from(bots).where(eq(bots.status, 'approved'));

    for (const bot of allBots) {
      const config = ((bot.trainerConfig as any) ?? DEFAULT_TRAINER_CONFIG) as TrainerConfig;
      if (!config.pendingPrompt && !config.pendingConfig) continue;

      // Check if there is a pending validation entry in Redis
      let pendingRaw: string | null = null;
      try {
        pendingRaw = await redisConnection.get(`trainer:pending:${bot.id}`);
      } catch { continue; }
      if (!pendingRaw) continue;

      let pending: {
        prompt: string;
        config: Record<string, any>;
        startedAt: string;
        validationDeadlineAt: string;
        baselineWinRate: number;
        baselinePF: number;
      };
      try {
        pending = JSON.parse(pendingRaw);
      } catch { continue; }

      // Not past deadline yet — skip
      if (new Date(pending.validationDeadlineAt).getTime() > Date.now()) continue;

      // Deadline has passed — compare current performance vs baseline
      let currentPerf;
      try {
        currentPerf = await analyzeBotPerformance(bot.id);
      } catch { continue; }

      const winRateDelta = currentPerf.winRate - pending.baselineWinRate;
      const pfDelta = currentPerf.profitFactor - pending.baselinePF;
      const improved = winRateDelta > 2 || pfDelta > 0.1 || (winRateDelta > 0 && pfDelta > 0);

      const mode: 'auto' | 'suggestions' | 'off' = config.trainingMode
        ?? (config.autoRetrain ? 'suggestions' : 'off');

      const validationMsg = improved
        ? `Shadow validation PASSED (${pending.validationDeadlineAt.slice(0, 10)}): WR ${pending.baselineWinRate.toFixed(1)}%→${currentPerf.winRate.toFixed(1)}%, PF ${pending.baselinePF.toFixed(2)}→${currentPerf.profitFactor.toFixed(2)}`
        : `Shadow validation FAILED (${pending.validationDeadlineAt.slice(0, 10)}): WR ${pending.baselineWinRate.toFixed(1)}%→${currentPerf.winRate.toFixed(1)}%, PF ${pending.baselinePF.toFixed(2)}→${currentPerf.profitFactor.toFixed(2)} — no improvement detected`;

      console.log(`[AutoTrainer] Shadow validation for bot ${bot.id}: ${improved ? 'PASSED' : 'FAILED'}`);

      if (mode === 'auto' && improved) {
        // AUTO + improved → promote immediately
        try {
          await promotePendingChanges(bot.id, bot.creatorId);
          console.log(`[AutoTrainer] Auto-promoted trainer changes for bot ${bot.id} after shadow validation`);
        } catch (err) {
          console.error(`[AutoTrainer] Auto-promote failed for ${bot.id}:`, (err as Error).message);
        }
      } else if (!improved) {
        // Not improved — discard pending changes regardless of mode
        const discardInsight: TrainerInsight = {
          ts: new Date().toISOString(),
          type: 'warning',
          message: validationMsg + ' — pending suggestion discarded.',
        };
        await db.update(bots).set({
          trainerConfig: {
            ...config,
            trainerStatus: 'monitoring',
            pendingPrompt: null,
            pendingConfig: null,
            insights: [discardInsight, ...(config.insights ?? [])].slice(0, 30),
          } as any,
          updatedAt: new Date(),
        }).where(eq(bots.id, bot.id));
      } else {
        // SUGGESTIONS mode + improved → add validation result to log so creator sees it
        const resultInsight: TrainerInsight = {
          ts: new Date().toISOString(),
          type: 'improvement',
          message: validationMsg + ' — ready to apply.',
        };
        await db.update(bots).set({
          trainerConfig: {
            ...config,
            insights: [resultInsight, ...(config.insights ?? [])].slice(0, 30),
          } as any,
          updatedAt: new Date(),
        }).where(eq(bots.id, bot.id));
      }

      // Clean up Redis key — validation is done
      await redisConnection.del(`trainer:pending:${bot.id}`).catch(() => {});
    }
  } catch (err) {
    console.error('[AutoTrainer] Shadow validation check error:', (err as Error).message);
  }
}

// ─── Performance Check Loop ───────────────────────────────────────────────────

async function runTrainerChecks() {
  try {
    const allBots = await db.select({ id: bots.id, trainerConfig: bots.trainerConfig })
      .from(bots)
      .where(eq(bots.status, 'approved'));

    let checked = 0;
    for (const bot of allBots) {
      const config = ((bot.trainerConfig as any) ?? DEFAULT_TRAINER_CONFIG) as TrainerConfig;
      const mode = config.trainingMode ?? (config.autoRetrain ? 'suggestions' : 'off');
      if (mode === 'off') continue;
      try {
        await runAutoTrainerCheck(bot.id);
        checked++;
      } catch (err) {
        console.error(`[AutoTrainer] Check failed for bot ${bot.id}:`, (err as Error).message);
      }
    }

    if (checked > 0) {
      console.log(`[AutoTrainer] Checked ${checked} bots`);
    }

    // Run shadow validation check after performance checks complete
    await checkShadowValidations();
  } catch (err) {
    console.error('[AutoTrainer] Batch check error:', (err as Error).message);
  }
}

export async function startAutoTrainerJob() {
  setTimeout(runTrainerChecks, 15_000);
  intervalHandle = setInterval(runTrainerChecks, 30 * 60 * 1000);
  console.log('[AutoTrainer] Auto-trainer job started (30min interval, shadow validation enabled)');
}

export async function stopAutoTrainerJob() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}
