/**
 * Auto-Trainer Job
 *
 * Two independent timers:
 *
 * 1. ANALYSIS TIMER — every 30 min
 *    For each bot with training ON:
 *    - Skip if already retraining or shadow_validating
 *    - Check triggers (first-time, schedule, performance drop)
 *    - If triggered → run trainer agent → store pending in Redis
 *
 * 2. APPLY TIMER — every 10 min
 *    For each bot with AUTO mode that has a pending improvement:
 *    - Check if 30 min have passed since the pending was stored
 *    - If yes → promote to live (update bot prompt + config)
 *    - For SUGGESTIONS mode → just log that it's ready for creator review
 *    - Shadow validation: compare WR/PF before vs after → discard if no improvement
 */

import { db } from '../config/database.js';
import { bots } from '../db/schema/bots.js';
import { eq } from 'drizzle-orm';
import { redisConnection } from '../config/queue.js';
import {
  runAutoTrainerCheck,
  analyzeBotPerformance,
  promotePendingChanges,
  type TrainerConfig,
  type TrainerInsight,
} from '../modules/trainer/trainer.service.js';

let analysisTimer: ReturnType<typeof setInterval> | null = null;
let applyTimer: ReturnType<typeof setInterval> | null = null;

// ─── Timer 1: Analysis — every 30 min ────────────────────────────────────────

async function runAnalysisCycle() {
  try {
    const allBots = await db
      .select({ id: bots.id, trainerConfig: bots.trainerConfig })
      .from(bots)
      .where(eq(bots.status, 'approved'));

    const activeBots = allBots.filter(bot => {
      const cfg = (bot.trainerConfig as any) as TrainerConfig | null;
      if (!cfg) return false;
      const mode = cfg.trainingMode ?? (cfg.autoRetrain ? 'suggestions' : 'off');
      return mode !== 'off';
    });

    if (activeBots.length === 0) return;

    let fired = 0;
    for (const bot of activeBots) {
      try {
        const r = await runAutoTrainerCheck(bot.id);
        if (r.fired) fired++;
      } catch (err) {
        console.error(`[AutoTrainer/Analysis] bot ${bot.id}:`, (err as Error).message);
      }
    }

    if (fired > 0 || activeBots.length > 0) {
      console.log(`[AutoTrainer/Analysis] ${activeBots.length} active bot(s), ${fired} cycle(s) fired`);
    }
  } catch (err) {
    console.error('[AutoTrainer/Analysis] Batch error:', (err as Error).message);
  }
}

// ─── Timer 2: Apply pending — every 10 min ───────────────────────────────────
// Separate from analysis so apply doesn't need to wait a full 30-min cycle.
// A training improvement generated at minute 0 will be applied at minute 30-40
// (whenever this timer fires after the 30-min shadow window closes).

const SHADOW_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

async function runApplyCycle() {
  try {
    const allBots = await db
      .select({ id: bots.id, creatorId: bots.creatorId, trainerConfig: bots.trainerConfig })
      .from(bots)
      .where(eq(bots.status, 'approved'));

    for (const bot of allBots) {
      const cfg = (bot.trainerConfig as any) as TrainerConfig | null;
      if (!cfg) continue;
      const mode = cfg.trainingMode ?? (cfg.autoRetrain ? 'suggestions' : 'off');
      if (mode === 'off') continue;
      if (!cfg.pendingPrompt && !cfg.pendingConfig) continue;

      // Load Redis state for this pending improvement
      let pendingRaw: string | null = null;
      try { pendingRaw = await redisConnection.get(`trainer:pending:${bot.id}`); } catch { continue; }

      const now = Date.now();

      if (!pendingRaw) {
        // Redis TTL expired but DB still has pending — apply immediately (stale state)
        if (mode === 'auto') {
          try {
            await promotePendingChanges(bot.id, bot.creatorId);
            console.log(`[AutoTrainer/Apply] AUTO — applied stale pending for bot ${bot.id} (Redis key gone)`);
          } catch (err) {
            console.error(`[AutoTrainer/Apply] Promote failed for ${bot.id}:`, (err as Error).message);
          }
        }
        continue;
      }

      let pending: {
        startedAt: string;
        validationDeadlineAt?: string;
        baselineWinRate?: number;
        baselinePF?: number;
      };
      try { pending = JSON.parse(pendingRaw); } catch { continue; }

      const startedAt = new Date(pending.startedAt).getTime();
      const elapsed = now - startedAt;

      // Shadow window not elapsed yet — skip
      if (elapsed < SHADOW_WINDOW_MS) continue;

      // ── Shadow validation: check if performance improved ──────────────────
      // We compare WR + PF at decision time vs now.
      // Only discard if there's clear evidence of decline (not just stale/no-trades).
      let shouldApply = true;
      let validationNote = '';

      if (pending.baselineWinRate != null && pending.baselinePF != null) {
        try {
          const currentPerf = await analyzeBotPerformance(bot.id);
          const wrDelta = currentPerf.winRate - pending.baselineWinRate;
          const pfDelta = currentPerf.profitFactor - pending.baselinePF;

          // Need at least 5 new trades since the decision to have a meaningful comparison
          // Without enough new trades, we default to applying (give it a chance)
          const hasEnoughNewData = currentPerf.totalTrades >= 5;

          if (hasEnoughNewData) {
            const declined = wrDelta < -10 || pfDelta < -0.3;
            if (declined) {
              shouldApply = false;
              validationNote = `Shadow validation FAILED: WR ${pending.baselineWinRate.toFixed(1)}%→${currentPerf.winRate.toFixed(1)}% (${wrDelta > 0 ? '+' : ''}${wrDelta.toFixed(1)}pts), PF ${pending.baselinePF.toFixed(2)}→${currentPerf.profitFactor.toFixed(2)}`;
            } else {
              validationNote = `Shadow validation OK: WR ${pending.baselineWinRate.toFixed(1)}%→${currentPerf.winRate.toFixed(1)}%, PF ${pending.baselinePF.toFixed(2)}→${currentPerf.profitFactor.toFixed(2)}`;
            }
          } else {
            validationNote = `Applied after 30-min shadow period (${currentPerf.totalTrades} trades — not enough for validation comparison yet)`;
          }
        } catch { /* validation failed — still apply */ }
      }

      if (!shouldApply) {
        // Discard the pending improvement — log it
        console.log(`[AutoTrainer/Apply] Shadow validation FAILED for bot ${bot.id} — discarding pending`);
        const discardInsight: TrainerInsight = {
          ts: new Date().toISOString(),
          type: 'warning',
          message: `[${new Date().toISOString().slice(0,16).replace('T',' ')}] ⚠ ${validationNote} — pending improvement discarded, keeping current strategy.`,
        };
        const freshBot = await db.select({ trainerConfig: bots.trainerConfig }).from(bots).where(eq(bots.id, bot.id)).limit(1);
        const freshCfg = ((freshBot[0]?.trainerConfig as any) ?? cfg) as TrainerConfig;
        await db.update(bots).set({
          trainerConfig: {
            ...freshCfg,
            trainerStatus: 'monitoring',
            pendingPrompt: null,
            pendingConfig: null,
            insights: [discardInsight, ...(freshCfg.insights ?? [])].slice(0, 30),
          } as any,
          updatedAt: new Date(),
        }).where(eq(bots.id, bot.id));
        await redisConnection.del(`trainer:pending:${bot.id}`).catch(() => {});
        continue;
      }

      if (mode === 'auto') {
        // AUTO mode — apply now
        try {
          await promotePendingChanges(bot.id, bot.creatorId);
          console.log(`[AutoTrainer/Apply] AUTO — applied pending for bot ${bot.id}: ${validationNote}`);

          // Add apply insight to log
          const applyInsight: TrainerInsight = {
            ts: new Date().toISOString(),
            type: 'improvement',
            message: `[${new Date().toISOString().slice(0,16).replace('T',' ')}] ✅ [AUTO] Trainer improvements applied after 30-min shadow period. ${validationNote}`,
            decision: 'changed',
          };
          const freshBot = await db.select({ trainerConfig: bots.trainerConfig }).from(bots).where(eq(bots.id, bot.id)).limit(1);
          const freshCfg = ((freshBot[0]?.trainerConfig as any) ?? cfg) as TrainerConfig;
          await db.update(bots).set({
            trainerConfig: {
              ...freshCfg,
              insights: [applyInsight, ...(freshCfg.insights ?? [])].slice(0, 30),
            } as any,
            updatedAt: new Date(),
          }).where(eq(bots.id, bot.id));

          await redisConnection.del(`trainer:pending:${bot.id}`).catch(() => {});
        } catch (err) {
          console.error(`[AutoTrainer/Apply] Promote failed for ${bot.id}:`, (err as Error).message);
        }
      } else if (mode === 'suggestions') {
        // SUGGESTIONS mode — just notify creator it's ready (they must manually apply)
        console.log(`[AutoTrainer/Apply] SUGGESTIONS — 30-min shadow done for bot ${bot.id}, notifying creator`);

        const readyInsight: TrainerInsight = {
          ts: new Date().toISOString(),
          type: 'improvement',
          message: `[${new Date().toISOString().slice(0,16).replace('T',' ')}] 💡 Trainer suggestion ready to apply. ${validationNote} Open the trainer panel to review and apply.`,
          action: 'Review and apply in trainer panel',
        };
        const freshBot = await db.select({ trainerConfig: bots.trainerConfig }).from(bots).where(eq(bots.id, bot.id)).limit(1);
        const freshCfg = ((freshBot[0]?.trainerConfig as any) ?? cfg) as TrainerConfig;
        await db.update(bots).set({
          trainerConfig: {
            ...freshCfg,
            trainerStatus: 'monitoring',
            insights: [readyInsight, ...(freshCfg.insights ?? [])].slice(0, 30),
          } as any,
          updatedAt: new Date(),
        }).where(eq(bots.id, bot.id));

        // Keep Redis key alive until creator applies or discards manually — don't delete
      }
    }
  } catch (err) {
    console.error('[AutoTrainer/Apply] Batch error:', (err as Error).message);
  }
}

// ─── Start / Stop ─────────────────────────────────────────────────────────────

export async function startAutoTrainerJob() {
  // Fire analysis 20s after startup (give server time to fully initialize)
  setTimeout(runAnalysisCycle, 20_000);
  // Then every 30 min
  analysisTimer = setInterval(runAnalysisCycle, 30 * 60 * 1000);

  // Apply timer: every 10 min — catches pending improvements as soon as 30-min window closes
  applyTimer = setInterval(runApplyCycle, 10 * 60 * 1000);

  console.log('[AutoTrainer] Started — analysis every 30min, apply-check every 10min');
}

export async function stopAutoTrainerJob() {
  if (analysisTimer) { clearInterval(analysisTimer); analysisTimer = null; }
  if (applyTimer)    { clearInterval(applyTimer);    applyTimer    = null; }
}
