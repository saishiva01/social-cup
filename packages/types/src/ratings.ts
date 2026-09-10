/**
 * DTOs for drink ratings and the drink diary (PRD Module 5). A diary entry
 * IS a rating — the PRD's diary is "every drink a member has rated", the
 * same fields a rating already carries — so there is no separate diary DTO
 * beyond adding the drink/cafe context needed to render a diary row.
 */

/** The caller's own rating for one drink. */
export interface Rating {
  id: string;
  drinkId: string;
  stars: number;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One row in GET /api/v1/me/ratings — a rating plus the drink/cafe context to render it. */
export interface DiaryEntry {
  ratingId: string;
  stars: number;
  note: string | null;
  createdAt: string;
  drink: {
    id: string;
    name: string;
    photoUrl: string | null;
  };
  cafe: {
    id: string;
    name: string;
    neighborhood: string;
  };
}
