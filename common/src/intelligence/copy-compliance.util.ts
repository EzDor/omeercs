export interface ComplianceWarning {
  term: string;
  category: 'misleading' | 'regulatory' | 'financial';
  severity: 'warning' | 'info';
  suggestion: string;
}

export interface CopyComplianceResult {
  copyType: string;
  variationIndex: number;
  warnings: ComplianceWarning[];
}

interface FlaggedTerm {
  term: string;
  category: 'misleading' | 'regulatory' | 'financial';
  severity: 'warning' | 'info';
  suggestion: string;
}

const FLAGGED_TERMS: FlaggedTerm[] = [
  { term: 'guaranteed', category: 'misleading', severity: 'warning', suggestion: "Avoid absolute guarantees; use 'chance to win'" },
  { term: '100%', category: 'misleading', severity: 'warning', suggestion: 'Avoid absolute percentages in promotional context' },
  { term: 'always win', category: 'misleading', severity: 'warning', suggestion: "Replace with 'chances to win' or similar" },
  { term: 'everyone wins', category: 'misleading', severity: 'warning', suggestion: "Clarify with 'every participant receives'" },
  { term: 'winner', category: 'regulatory', severity: 'info', suggestion: 'Ensure compliance with local sweepstakes regulations' },
  { term: 'prize', category: 'regulatory', severity: 'info', suggestion: "May require 'No Purchase Necessary' disclosure" },
  { term: 'free', category: 'regulatory', severity: 'info', suggestion: "Clarify if conditions apply; 'complimentary' may be safer" },
  { term: 'no purchase necessary', category: 'regulatory', severity: 'info', suggestion: 'Required disclosure for sweepstakes; verify placement' },
  { term: 'cash', category: 'financial', severity: 'warning', suggestion: 'Verify compliance with financial promotion regulations' },
  { term: 'money', category: 'financial', severity: 'warning', suggestion: "Consider using 'reward' or 'credit' instead" },
  { term: 'investment', category: 'financial', severity: 'warning', suggestion: 'Avoid financial language in promotional context' },
];

function buildWordBoundaryPattern(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i');
}

export function checkCopyCompliance(text: string, copyType: string, variationIndex: number): CopyComplianceResult {
  const warnings: ComplianceWarning[] = [];

  for (const flagged of FLAGGED_TERMS) {
    const pattern = buildWordBoundaryPattern(flagged.term);
    if (pattern.test(text)) {
      warnings.push({
        term: flagged.term,
        category: flagged.category,
        severity: flagged.severity,
        suggestion: flagged.suggestion,
      });
    }
  }

  return { copyType, variationIndex, warnings };
}

export function checkAllCopies(copies: Array<{ copy_type: string; variations: Array<{ text: string }> }>): CopyComplianceResult[] {
  const results: CopyComplianceResult[] = [];

  for (const copy of copies) {
    for (let i = 0; i < copy.variations.length; i++) {
      const result = checkCopyCompliance(copy.variations[i].text, copy.copy_type, i);
      if (result.warnings.length > 0) {
        results.push(result);
      }
    }
  }

  return results;
}
