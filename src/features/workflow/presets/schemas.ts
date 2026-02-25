function stringifySchema(schema: Record<string, unknown>): string {
  return JSON.stringify(schema, null, 2);
}

export const VALIDATION_INTAKE_SCHEMA = stringifySchema({
  type: "object",
  required: ["question", "goal", "checkpoints", "searchQueries"],
  properties: {
    question: { type: "string" },
    goal: { type: "string" },
    checkpoints: { type: "array" },
    searchQueries: { type: "array" },
  },
});

export const PREPROCESS_BRIEF_SCHEMA = stringifySchema({
  type: "object",
  required: [
    "intent",
    "userGoal",
    "templateIntent",
    "requiredOutputs",
    "constraints",
    "assumptions",
    "researchPlan",
    "acceptanceCriteria",
    "riskChecklist",
    "selfValidationPlan",
  ],
  properties: {
    intent: { type: "string" },
    userGoal: { type: "string" },
    templateIntent: { type: "string" },
    requiredOutputs: { type: "array" },
    constraints: { type: "array" },
    assumptions: { type: "array" },
    researchPlan: {
      type: "object",
      required: ["webQueries", "sources", "collectionOrder", "verificationRules"],
      properties: {
        webQueries: { type: "array" },
        sources: { type: "array" },
        collectionOrder: { type: "array" },
        verificationRules: { type: "array" },
      },
    },
    acceptanceCriteria: { type: "array" },
    riskChecklist: { type: "array" },
    selfValidationPlan: { type: "array" },
  },
});

export const VALIDATION_SEARCH_EVIDENCE_SCHEMA = stringifySchema({
  type: "object",
  required: ["evidences"],
  properties: {
    evidences: { type: "array" },
  },
});

export const VALIDATION_SEARCH_RISK_SCHEMA = stringifySchema({
  type: "object",
  required: ["risks"],
  properties: {
    risks: { type: "array" },
  },
});

export const VALIDATION_JUDGE_SCHEMA = stringifySchema({
  type: "object",
  required: ["DECISION", "finalDraft", "why", "gaps", "confidence"],
  properties: {
    DECISION: { type: "string", enum: ["PASS", "REJECT"] },
    finalDraft: { type: "string" },
    why: { type: "array" },
    gaps: { type: "array" },
    confidence: { type: "number" },
  },
});

export const DEVELOPMENT_REQUIREMENTS_SCHEMA = stringifySchema({
  type: "object",
  required: ["functional", "nonFunctional", "constraints", "priority"],
  properties: {
    functional: { type: "array" },
    nonFunctional: { type: "array" },
    constraints: { type: "array" },
    priority: { type: "array" },
  },
});

export const DEVELOPMENT_ARCHITECTURE_SCHEMA = stringifySchema({
  type: "object",
  required: ["architecture", "components", "tradeoffs", "risks", "decisionLog"],
  properties: {
    architecture: { type: "string" },
    components: { type: "array" },
    tradeoffs: { type: "array" },
    risks: { type: "array" },
    decisionLog: { type: "array" },
  },
});

export const DEVELOPMENT_EVALUATOR_SCHEMA = stringifySchema({
  type: "object",
  required: ["DECISION", "finalDraft", "risk", "blockingIssues"],
  properties: {
    DECISION: { type: "string", enum: ["PASS", "REJECT"] },
    finalDraft: { type: "string" },
    risk: { type: "array" },
    blockingIssues: { type: "array" },
  },
});

export const RESEARCH_INTAKE_SCHEMA = stringifySchema({
  type: "object",
  required: ["researchGoal", "questions", "evidenceCriteria", "riskChecks"],
  properties: {
    researchGoal: { type: "string" },
    questions: { type: "array" },
    evidenceCriteria: { type: "array" },
    riskChecks: { type: "array" },
  },
});

export const RESEARCH_COLLECTOR_SCHEMA = stringifySchema({
  type: "object",
  required: ["evidences"],
  properties: {
    evidences: { type: "array" },
  },
});

export const RESEARCH_FACTCHECK_SCHEMA = stringifySchema({
  type: "object",
  required: ["verified", "contested", "missing", "notes"],
  properties: {
    verified: { type: "array" },
    contested: { type: "array" },
    missing: { type: "array" },
    notes: { type: "array" },
  },
});

export const EXPERT_INTAKE_SCHEMA = stringifySchema({
  type: "object",
  required: ["domain", "objective", "constraints", "successCriteria"],
  properties: {
    domain: { type: "string" },
    objective: { type: "string" },
    constraints: { type: "array" },
    successCriteria: { type: "array" },
  },
});

export const EXPERT_REVIEW_SCHEMA = stringifySchema({
  type: "object",
  required: ["DECISION", "criticalIssues", "improvements"],
  properties: {
    DECISION: { type: "string", enum: ["PASS", "REJECT"] },
    criticalIssues: { type: "array" },
    improvements: { type: "array" },
  },
});

export const UNITY_INTAKE_SCHEMA = stringifySchema({
  type: "object",
  required: ["genre", "coreLoop", "targetPlatform", "scope", "mustHave"],
  properties: {
    genre: { type: "string" },
    coreLoop: { type: "string" },
    targetPlatform: { type: "array" },
    scope: { type: "string" },
    mustHave: { type: "array" },
  },
});

export const UNITY_QA_SCHEMA = stringifySchema({
  type: "object",
  required: ["DECISION", "bugsToWatch", "performanceRisks", "finalDraft"],
  properties: {
    DECISION: { type: "string", enum: ["PASS", "REJECT"] },
    bugsToWatch: { type: "array" },
    performanceRisks: { type: "array" },
    finalDraft: { type: "string" },
  },
});

export const FULLSTACK_INTAKE_SCHEMA = stringifySchema({
  type: "object",
  required: ["personas", "features", "nonFunctional", "mvpScope"],
  properties: {
    personas: { type: "array" },
    features: { type: "array" },
    nonFunctional: { type: "array" },
    mvpScope: { type: "array" },
  },
});

export const FULLSTACK_OPS_SCHEMA = stringifySchema({
  type: "object",
  required: ["DECISION", "securityRisks", "deployChecklist", "finalDraft"],
  properties: {
    DECISION: { type: "string", enum: ["PASS", "REJECT"] },
    securityRisks: { type: "array" },
    deployChecklist: { type: "array" },
    finalDraft: { type: "string" },
  },
});

export const CREATIVE_INTAKE_SCHEMA = stringifySchema({
  type: "object",
  required: ["coreProblem", "hiddenConstraints", "challengeStatement"],
  properties: {
    coreProblem: { type: "string" },
    hiddenConstraints: { type: "array" },
    challengeStatement: { type: "string" },
  },
});

export const NEWS_INTAKE_SCHEMA = stringifySchema({
  type: "object",
  required: ["timeWindow", "queries", "mustVerify"],
  properties: {
    timeWindow: { type: "string" },
    queries: { type: "array" },
    mustVerify: { type: "array" },
  },
});

export const NEWS_CHECK_SCHEMA = stringifySchema({
  type: "object",
  required: ["DECISION", "confirmed", "conflicts", "finalDraft"],
  properties: {
    DECISION: { type: "string", enum: ["PASS", "REJECT"] },
    confirmed: { type: "array" },
    conflicts: { type: "array" },
    finalDraft: { type: "string" },
  },
});

export const STOCK_INTAKE_SCHEMA = stringifySchema({
  type: "object",
  required: ["target", "timeHorizon", "market", "mustAnswer", "constraints"],
  properties: {
    target: { type: "string" },
    timeHorizon: { type: "string" },
    market: { type: "string" },
    mustAnswer: { type: "array" },
    constraints: { type: "array" },
    assumptions: { type: "array" },
  },
});

export const STOCK_RISK_SCHEMA = stringifySchema({
  type: "object",
  required: ["upsideFactors", "downsideRisks", "accuracyNotes", "dataIssues"],
  properties: {
    upsideFactors: { type: "array" },
    downsideRisks: { type: "array" },
    accuracyNotes: { type: "array" },
    dataIssues: { type: "array" },
  },
});
