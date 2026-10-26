/**
 * Default certificate wording per type — mirrors sogdiabackend/src/lib/certificateCopy.ts so the builder's live
 * preview matches the PNG the API renders. Keep the two in sync.
 */
export type CertType = 'eval_pass' | 'phase1_pass' | 'phase2_pass' | 'funded' | 'payout' | 'achievement' | 'custom';

export const CERT_COPY: Record<CertType, { label: string; title: string; caption: string; amountLabel: string }> = {
  eval_pass: { label: 'Evaluation passed', title: 'CERTIFICATE OF ACHIEVEMENT', caption: 'has successfully completed the SOGDIA Evaluation and qualified for a funded trading account', amountLabel: 'ACCOUNT SIZE' },
  phase1_pass: { label: 'Phase 1 passed', title: 'PHASE ONE COMPLETION', caption: 'has successfully completed Phase One of the SOGDIA Evaluation', amountLabel: 'ACCOUNT SIZE' },
  phase2_pass: { label: 'Phase 2 passed', title: 'PHASE TWO COMPLETION', caption: 'has successfully completed Phase Two of the SOGDIA Evaluation', amountLabel: 'ACCOUNT SIZE' },
  funded: { label: 'Funded trader', title: 'FUNDED TRADER CERTIFICATE', caption: 'has qualified as a SOGDIA Funded Trader and been granted a funded trading account', amountLabel: 'ACCOUNT SIZE' },
  payout: { label: 'Payout', title: 'CERTIFICATE OF PAYOUT', caption: 'has received a profit distribution from a SOGDIA funded trading account', amountLabel: 'AMOUNT PAID' },
  achievement: { label: 'Achievement', title: 'CERTIFICATE OF EXCELLENCE', caption: 'is recognised for outstanding trading performance and disciplined risk management', amountLabel: 'PROFIT' },
  custom: { label: 'Custom', title: 'CERTIFICATE', caption: 'is recognised by SOGDIA Capital', amountLabel: 'AMOUNT' },
};

export const CERT_TYPES = Object.keys(CERT_COPY) as CertType[];

export const certTypeLabel = (t: string) => CERT_COPY[t as CertType]?.label ?? t.replace(/_/g, ' ');
