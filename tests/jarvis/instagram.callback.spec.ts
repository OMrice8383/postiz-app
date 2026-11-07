// Only synthetic settings and mocked Meta responses; no real credentials or network.
import { InstagramProvider } from '../../libraries/nestjs-libraries/src/integrations/social/instagram.provider';
import { FacebookProvider } from '../../libraries/nestjs-libraries/src/integrations/social/facebook.provider';

const callback = 'https://callback.example/integrations/social/instagram';
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
const metaFetch = jest.fn();
const mockMetaExchange = (provider: InstagramProvider) => {
  metaFetch
    .mockResolvedValueOnce({ json: async () => ({ access_token: 'fixture-short-token', token_type: 'bearer', expires_in: 3600 }) })
    .mockResolvedValueOnce({ json: async () => ({ access_token: 'fixture-long-token', token_type: 'bearer', expires_in: 5184000 }) })
    .mockResolvedValueOnce({ json: async () => ({ data: provider.scopes.map(permission => ({ permission, status: 'granted' })) }) })
    .mockResolvedValueOnce({ json: async () => ({ id: 'fixture-user', name: 'Fixture', picture: { data: { url: 'https://images.example/fixture.png' } } }) });
};

beforeEach(() => {
  process.env.FRONTEND_URL = 'https://postiz.example/';
  process.env.FACEBOOK_APP_ID = 'fixture-app';
  process.env.FACEBOOK_APP_SECRET = 'fixture-secret';
  process.env.INSTAGRAM_CALLBACK_URL = callback;
  global.fetch = metaFetch;
  metaFetch.mockReset();
});
afterAll(() => {
  process.env = originalEnv;
  global.fetch = originalFetch;
});

it('uses the dedicated callback for both authorization and code exchange, even on refresh', async () => {
  const provider = new InstagramProvider();
  const authorization = await provider.generateAuthUrl();
  mockMetaExchange(provider);
  await provider.authenticate({ code: 'fixture-code', codeVerifier: 'fixture-verifier', refresh: 'true' });
  expect(new URL(authorization.url).searchParams.get('redirect_uri')).toBe(callback);
  expect(new URL(metaFetch.mock.calls[0][0]).searchParams.get('redirect_uri')).toBe(callback);
});

it.each([
  [undefined, '', 'https://postiz.example//integrations/social/instagram'],
  ['', '', 'https://postiz.example//integrations/social/instagram'],
  [undefined, 'true', 'https://postiz.example//integrations/social/instagram?refresh=true'],
  ['', 'true', 'https://postiz.example//integrations/social/instagram?refresh=true'],
])('keeps the original literal concatenation when setting=%s and refresh=%s', async (setting, refresh, expectedExchange) => {
  if (setting === undefined) delete process.env.INSTAGRAM_CALLBACK_URL;
  else process.env.INSTAGRAM_CALLBACK_URL = setting;
  const provider = new InstagramProvider();
  const authorization = await provider.generateAuthUrl();
  mockMetaExchange(provider);
  await provider.authenticate({ code: 'fixture-code', codeVerifier: 'fixture-verifier', refresh: refresh! });
  expect(new URL(authorization.url).searchParams.get('redirect_uri')).toBe('https://postiz.example//integrations/social/instagram');
  expect(new URL(metaFetch.mock.calls[0][0]).searchParams.get('redirect_uri')).toBe(expectedExchange);
});

it.each([
  'not-a-url',
  ' ',
  'http://callback.example/integrations/social/instagram',
  'https://fixture-user:fixture-password@callback.example/integrations/social/instagram',
  'https://callback.example/integrations/social/instagram?code=fixture-sensitive',
  'https://callback.example/integrations/social/instagram?',
  'https://callback.example/integrations/social/instagram#fixture-sensitive',
  'https://callback.example/integrations/social/instagram#',
  'https://callback.example/integrations/social/instagram/',
  'https://callback.example/integrations/social/instagram/extra',
  'https://callback.example/integrations/social/facebook',
  'https://callback.example/integrations/social/../social/instagram',
  'https://callback.example/integrations/social/%69nstagram',
  'https://callback.example/integrations%2fsocial/instagram',
  'https://callback.example/integrations/social/./instagram',
  'https://CALLBACK.example/integrations/social/instagram',
  'https://callback.example:443/integrations/social/instagram',
  ' https://callback.example/integrations/social/instagram',
  'https://callback.example/integrations/social/instagram\n',
])('rejects a noncanonical dedicated callback without exposing its value (case %#)', async (setting) => {
  process.env.INSTAGRAM_CALLBACK_URL = setting;
  const provider = new InstagramProvider();
  await expect(provider.generateAuthUrl()).rejects.toThrow(/^Invalid INSTAGRAM_CALLBACK_URL$/);
  await expect(provider.authenticate({ code: 'fixture-code', codeVerifier: 'fixture-verifier', refresh: '' })).rejects.toThrow(/^Invalid INSTAGRAM_CALLBACK_URL$/);
  expect(metaFetch).not.toHaveBeenCalled();
});

it('accepts a canonical HTTPS origin with an explicit non-default port', async () => {
  process.env.INSTAGRAM_CALLBACK_URL = 'https://callback.example:8443/integrations/social/instagram';
  const authorization = await new InstagramProvider().generateAuthUrl();
  expect(new URL(authorization.url).searchParams.get('redirect_uri')).toBe('https://callback.example:8443/integrations/social/instagram');
});

it('does not change Facebook authorization even with invalid Instagram configuration', async () => {
  process.env.INSTAGRAM_CALLBACK_URL = 'invalid-fixture-setting';
  const authorization = await new FacebookProvider().generateAuthUrl();
  expect(new URL(authorization.url).searchParams.get('redirect_uri')).toBe('https://postiz.example//integrations/social/facebook');
});
