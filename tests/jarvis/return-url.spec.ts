import { getJarvisConnectReturnUrl } from '@gitroom/helpers/utils/jarvis.connect.return';

const fixed = 'https://jarvis.example/settings/sns-accounts/return';

describe('operator-configured JARVIS return URL', () => {
  it('accepts only the configured canonical HTTPS return page', () => {
    expect(getJarvisConnectReturnUrl(fixed)).toBe(fixed);
  });

  it.each([
    undefined, '', 'not a URL', '/settings/sns-accounts/return',
    'http://jarvis.example/settings/sns-accounts/return',
    'javascript:alert(1)', '//jarvis.example/settings/sns-accounts/return',
    'https://user:pass@jarvis.example/settings/sns-accounts/return',
    'https://jarvis.example/other', fixed + '/', fixed + '?code=fixture',
    fixed + '#fragment', fixed + '?', fixed + '#', ' ' + fixed,
    'https://JARVIS.example/settings/sns-accounts/return',
    'https://jarvis.example/settings/../settings/sns-accounts/return',
  ])('rejects invalid or noncanonical configuration %s', (value) => {
    expect(getJarvisConnectReturnUrl(value)).toBeUndefined();
  });
});
