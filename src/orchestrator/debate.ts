import type { DebatePosition, DebateResult, InvestigationRound, WorkUnit } from "../core.js";

/**
 * Subagent profile for each debate role.
 *
 * - `proposer` — argues FOR the proposal, presents evidence
 * - `challenger` — red-teams the proposal, finds flaws
 * - `judge` — weighs both sides, renders verdict
 */
export interface DebateProfile {
  role: "proposer" | "challenger" | "judge";
  /** Classification that maps to a CLAUDE.md agent profile (registered in ~/.claude/agents/). */
  agentType: string;
  /** Core instruction injected before the proposal text. */
  instruction: string;
}

export const DEBATE_PROFILES: Record<DebateProfile["role"], DebateProfile> = {
  proposer: {
    role: "proposer",
    agentType: "proposer",
    instruction: `You are the PROPOSER. Your job is to DEFEND a proposal with concrete evidence.
Argue WHY it should be accepted. Present evidence, address anticipated objections preemptively.
Be specific — cite file paths, line numbers, command output. Do NOT concede without evidence.`,
  },
  challenger: {
    role: "challenger",
    agentType: "challenger",
    instruction: `You are the CHALLENGER. Your job is to ATTACK a proposal and find every flaw.
Stress-test with edge cases, hidden assumptions, security/perf risks.
Find what the proposer missed. Be adversarial — your job is to break the proposal, not be agreeable.
Every attack must cite specific evidence (file paths, line numbers, or logical flaws).`,
  },
  judge: {
    role: "judge",
    agentType: "judge",
    instruction: `You are the JUDGE. Weigh evidence from both sides and render a verdict.
Determine which approach wins (or synthesize), list residual risks, and give an honest confidence score (0-1).
Confidence = 1.0 means the decision is certain with no remaining doubts.
Confidence = 0 means a complete guess — block the action.`,
  },
};

/** Bounded investigation rounds — prevents infinite loop. */
export const DEFAULT_MAX_DEBATE_ROUNDS = 3;

/**
 * A single round of debate: proposer + challenger submit positions,
 * judge evaluates and returns updated confidence.
 */
export interface DebateRound {
  round: number;
  question: string;
  /** Context document the debate is about (PR diff, unit spec, architecture doc...). */
  context: string;
  proposerPosition?: DebatePosition;
  challengerPosition?: DebatePosition;
  judgeVerdict?: {
    resolution: string;
    confidence: number;
    rejectedArguments: string[];
    /** List of remaining open questions for next round. */
    openQuestions: string[];
  };
}

/**
 * Run a single round of debate. In a real implementation each role would spawn
 * a subagent via `Task(agentType: ...)`. This function returns the prompt templates
 * so the CLI/API layer can delegate to subagents.
 */
export function debateRoundPrompts(round: DebateRound): {
  proposerPrompt: string;
  challengerPrompt: string;
  judgePrompt: string;
} {
  const { question, context, proposerPosition, challengerPosition } = round;

  // Proposer: build the case
  const proposerPrompt = [
    DEBATE_PROFILES.proposer.instruction,
    `\n## Question\n${question}`,
    `\n## Context\n${context}`,
    challengerPosition
      ? `\n## Previous Challenger Rebuttal\n${challengerPosition.claim}\nEvidence: ${challengerPosition.evidence.join("; ")}`
      : "",
    `\n## Instructions\nBuild your strongest case. Cite specific evidence. Output JSON with fields: claim (string), evidence (string[]).`,
  ].join("\n");

  // Challenger: attack the proposer's case
  const challengerPrompt = [
    DEBATE_PROFILES.challenger.instruction,
    `\n## Question\n${question}`,
    `\n## Context\n${context}`,
    proposerPosition
      ? `\n## Proposer's Claim\n${proposerPosition.claim}\nEvidence: ${proposerPosition.evidence.join("; ")}`
      : `\n## Instructions\nReview the context and find every possible flaw, edge case, and hidden risk. Even without a proposer yet, identify issues.`,
    `\n## Instructions\nFind flaws, edge cases, and hidden risks. Be adversarial. Output JSON: claim (string), evidence (string[]).`,
  ].join("\n");

  // Judge: weigh evidence
  const judgePrompt = [
    DEBATE_PROFILES.judge.instruction,
    `\n## Question\n${question}`,
    `\n## Context\n${context}`,
    proposerPosition
      ? `\n## Proposer\nClaim: ${proposerPosition.claim}\nEvidence: ${proposerPosition.evidence.join("; ")}`
      : "",
    challengerPosition
      ? `\n## Challenger Rebuttal\nClaim: ${challengerPosition.claim}\nEvidence: ${challengerPosition.evidence.join("; ")}`
      : "",
    `\n## Instructions\nWeigh both sides. Output JSON: resolution (string), confidence (number 0-1), rejectedArguments (string[]), openQuestions (string[]).`,
  ].join("\n");

  return { proposerPrompt, challengerPrompt, judgePrompt };
}

/**
 * Determine if another debate round is needed.
 * Returns false when: confidence >= 1.0, max rounds reached, or no open questions remain.
 */
export function debateContinue(
  currentRound: number,
  confidence: number,
  openQuestions: string[],
  maxRounds = DEFAULT_MAX_DEBATE_ROUNDS,
): boolean {
  if (confidence >= 1.0) return false;
  if (currentRound >= maxRounds) return false;
  if (openQuestions.length === 0) return false;
  return true;
}

/**
 * Synthesize a final DebateResult from completed rounds.
 */
export function synthesizeResult(
  question: string,
  rounds: DebateRound[],
  judgeConfidence: number,
  judgeResolution: string,
  rejected: string[],
): DebateResult {
  const positions: DebatePosition[] = [];
  for (const r of rounds) {
    if (r.proposerPosition) positions.push(r.proposerPosition);
    if (r.challengerPosition) positions.push(r.challengerPosition);
  }
  return {
    question,
    positions,
    resolution: judgeResolution,
    confidence: judgeConfidence,
    rejected,
  };
}

/**
 * Generate a debate prompt for a single work unit (used by vf orchestrate review phase).
 */
export function unitDebatePrompt(unit: WorkUnit): string {
  const parts = [`## Work Unit: ${unit.name}`];
  if (unit.spec) parts.push(`\n### Spec\n${unit.spec}`);
  if (unit.scope?.length) parts.push(`\n### Scope\n${unit.scope.join(", ")}`);
  if (unit.evidence?.length) parts.push(`\n### Current Evidence\n${unit.evidence.join("\n")}`);
  parts.push(`\n### Status\nstatus=${unit.status}, confidence=${unit.confidence}`);
  return parts.join("\n");
}

/**
 * Build debate prompts for a code review (PR diff or git diff).
 */
export function reviewDebatePrompt(
  title: string,
  description: string,
  diff: string,
): string {
  return [
    `## PR: ${title}`,
    `\n### Description\n${description}`,
    `\n### Diff\n\`\`\`diff\n${diff.slice(0, 8000)}\n\`\`\``,
  ].join("\n");
}
