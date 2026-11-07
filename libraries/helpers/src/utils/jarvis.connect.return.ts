// The operator-approved setting is the only source of the origin, never request input.
export function getJarvisConnectReturnUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      url.pathname === '/settings/sns-accounts/return' &&
      !url.username && !url.password && !value.includes('?') && !value.includes('#') &&
      value === url.href
    ) {
      return value;
    }
  } catch {
    // Missing or invalid configuration must not create a new redirect target.
  }
  return undefined;
}
