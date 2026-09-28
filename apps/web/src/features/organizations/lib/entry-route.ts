export function shouldEnterPlatform(
  organizationCount: number,
  hasPlatformAccess: boolean,
) {
  return organizationCount === 0 && hasPlatformAccess;
}
