export const X_COMMENT_CATEGORIES = ["litho", "thanos", "ignite"] as const;

export type XCommentCategory = (typeof X_COMMENT_CATEGORIES)[number];

export function isXCommentCategory(value: string): value is XCommentCategory {
  return (X_COMMENT_CATEGORIES as readonly string[]).includes(value);
}
