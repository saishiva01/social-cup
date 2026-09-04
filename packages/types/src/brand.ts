/**
 * Nominal typing helper. Lets id-like strings (userId, cafeId, ...) be
 * distinguished from each other and from plain `string` at compile time,
 * without adding any runtime cost.
 *
 * Domain-specific branded ids (e.g. `UserId`, `CafeId`) are introduced
 * alongside the schema that owns them, not here.
 */
export type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };
