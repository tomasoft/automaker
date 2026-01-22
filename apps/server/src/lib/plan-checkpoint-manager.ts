/**
 * Plan Checkpoint Manager - Manages plan re-reads during agent execution
 *
 * Tracks when to inject plan checkpoints based on:
 * - Turn count (every 5 turns)
 * - Errors (immediately, up to 3 times)
 * - Manual triggers
 */

import type { PlanCheckpointContext } from '@automaker/types';
import { createLogger } from '@automaker/utils';

const logger = createLogger('PlanCheckpoint');

export class PlanCheckpointManager {
  private turnsSinceLastRead = 0;
  private errorsSinceLastRead = 0;
  private totalErrorReReads = 0;
  private lastCheckpointTurn = 0;
  private currentTurn = 0;

  private readonly TURNS_BETWEEN_CHECKPOINTS = 5;
  private readonly MAX_ERROR_REREADS = 3;

  /**
   * Notify manager that a new turn has started
   */
  onTurnStart(): void {
    this.currentTurn++;
    this.turnsSinceLastRead++;
  }

  /**
   * Notify manager that an error occurred
   */
  onError(): void {
    this.errorsSinceLastRead++;
  }

  /**
   * Check if plan should be re-read
   */
  shouldReReadPlan(): boolean {
    // Check if enough turns have passed
    if (this.turnsSinceLastRead >= this.TURNS_BETWEEN_CHECKPOINTS) {
      logger.info(
        `Plan checkpoint triggered: ${this.turnsSinceLastRead} turns since last read (threshold: ${this.TURNS_BETWEEN_CHECKPOINTS})`
      );
      return true;
    }

    // Check if error occurred and we haven't hit the limit
    if (this.errorsSinceLastRead > 0 && this.totalErrorReReads < this.MAX_ERROR_REREADS) {
      logger.info(
        `Plan checkpoint triggered: ${this.errorsSinceLastRead} errors since last read (total error re-reads: ${this.totalErrorReReads}/${this.MAX_ERROR_REREADS})`
      );
      return true;
    }

    return false;
  }

  /**
   * Mark that plan was re-read
   */
  onPlanReRead(): void {
    if (this.errorsSinceLastRead > 0) {
      this.totalErrorReReads++;
    }

    this.turnsSinceLastRead = 0;
    this.errorsSinceLastRead = 0;
    this.lastCheckpointTurn = this.currentTurn;

    logger.info(
      `Plan checkpoint completed at turn ${this.currentTurn} (total error re-reads: ${this.totalErrorReReads})`
    );
  }

  /**
   * Check if error re-read limit has been reached
   */
  hasReachedErrorLimit(): boolean {
    return this.totalErrorReReads >= this.MAX_ERROR_REREADS;
  }

  /**
   * Get context for debugging/telemetry
   */
  getContext(): PlanCheckpointContext {
    return {
      turnsSinceLastRead: this.turnsSinceLastRead,
      errorsSinceLastRead: this.errorsSinceLastRead,
      totalErrorReReads: this.totalErrorReReads,
      lastCheckpointTurn: this.lastCheckpointTurn,
      shouldReRead: this.shouldReReadPlan(),
    };
  }

  /**
   * Reset manager state
   */
  reset(): void {
    this.turnsSinceLastRead = 0;
    this.errorsSinceLastRead = 0;
    this.totalErrorReReads = 0;
    this.lastCheckpointTurn = 0;
    this.currentTurn = 0;
    logger.info('Plan checkpoint manager reset');
  }
}
