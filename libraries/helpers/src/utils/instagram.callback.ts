// Provider-owned configuration: never derive the callback origin from a request Host.
export function getInstagramCallbackUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol === 'https:' &&
      url.pathname === '/integrations/social/instagram' &&
      !url.username && !url.password && !value.includes('?') && !value.includes('#') &&
      value === url.href
    ) {
      return value;
    }
  } catch {
    // Report only the setting name, never the rejected value.
  }
  throw new Error('Invalid INSTAGRAM_CALLBACK_URL');
}

export function getInstagramCallbackApiBase(provider: string, value: string | undefined): '/api' | undefined {
  return provider === 'instagram' && getInstagramCallbackUrl(value) ? '/api' : undefined;
}
