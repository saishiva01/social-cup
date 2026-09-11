import type { BaristaRedeemResult } from '@social-cup/types';
import { Check, X } from 'lucide-react';

interface ResultBannerProps {
  outcome: { kind: 'success'; data: BaristaRedeemResult } | { kind: 'failure'; message: string };
}

/**
 * The barista's green/red screen (PRD Module 8): "a green screen shows the
 * member's first name and photo, the drink, and credits deducted. A red
 * screen shows exactly one reason." Never renders a database id, a
 * technical error, or more than one reason — `outcome.message` is already
 * the single server-chosen reason string (apps/api's AppError messages are
 * written to be shown verbatim here, see baristaService.ts).
 */
export function ResultBanner({ outcome }: ResultBannerProps) {
  if (outcome.kind === 'success') {
    const { data } = outcome;
    return (
      <div className="result result-success" role="status" data-testid="result-success">
        <span className="result-icon-ring" aria-hidden="true">
          <Check size={44} strokeWidth={3} />
        </span>
        {data.memberPhotoUrl ? (
          <img className="member-photo" src={data.memberPhotoUrl} alt="" />
        ) : null}
        <p className="result-headline">{data.memberFirstName}</p>
        <p className="result-detail">{data.drinkName}</p>
        <p className="result-detail">
          {data.creditsDeducted} {data.creditsDeducted === 1 ? 'credit' : 'credits'} deducted
        </p>
      </div>
    );
  }

  return (
    <div className="result result-failure" role="alert" data-testid="result-failure">
      <span className="result-icon-ring" aria-hidden="true">
        <X size={44} strokeWidth={3} />
      </span>
      <p className="result-headline">{outcome.message}</p>
    </div>
  );
}
