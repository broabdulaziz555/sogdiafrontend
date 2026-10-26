/**
 * Default certificate wording per type — mirrors sogdiabackend/src/lib/certificateCopy.ts so the builder's live
 * preview matches the PNG the API renders. Keep the two in sync.
 */
export type CertType = 'eval_pass' | 'phase1_pass' | 'phase2_pass' | 'funded' | 'payout' | 'achievement' | 'custom';

export const CERT_COPY: Record<CertType, { label: string; title: string; caption: string; amountLabel: string }> = {
  eval_pass: { label: 'Evaluation passed', title: 'CERTIFICATE OF ACHIEVEMENT', caption: 'has successfully passed the SOGDIA evaluation and earned a funded account', amountLabel: 'ACCOUNT SIZE' },
  phase1_pass: { label: 'Phase 1 passed', title: 'PHASE 1 COMPLETED', caption: 'has successfully passed Phase 1 of the SOGDIA evaluation', amountLabel: 'ACCOUNT SIZE' },
  phase2_pass: { label: 'Phase 2 passed', title: 'PHASE 2 COMPLETED', caption: 'has successfully passed Phase 2 of the SOGDIA evaluation', amountLabel: 'ACCOUNT SIZE' },
  funded: { label: 'Funded trader', title: 'FUNDED TRADER CERTIFICATE', caption: 'has been granted a SOGDIA funded trading account', amountLabel: 'ACCOUNT SIZE' },
  payout: { label: 'Payout', title: 'CERTIFICATE OF PAYOUT', caption: 'has successfully withdrawn profits from a SOGDIA funded account', amountLabel: 'AMOUNT PAID' },
  achievement: { label: 'Achievement', title: 'CERTIFICATE OF EXCELLENCE', caption: 'has been recognised for outstanding trading performance at SOGDIA', amountLabel: 'PROFIT' },
  custom: { label: 'Custom', title: 'CERTIFICATE', caption: 'is recognised by SOGDIA', amountLabel: 'AMOUNT' },
};

export const CERT_TYPES = Object.keys(CERT_COPY) as CertType[];

export const certTypeLabel = (t: string) => CERT_COPY[t as CertType]?.label ?? t.replace(/_/g, ' ');
