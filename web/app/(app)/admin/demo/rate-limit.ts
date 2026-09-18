export function dreamRateLimitBuckets(userId: string, spaceIds: readonly string[]): readonly string[] {
  return [`dream-run:user:${userId}`, ...spaceIds.map((spaceId) => `dream-run:space:${spaceId}`)];
}
