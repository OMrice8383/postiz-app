/** @jest-environment jsdom */
// Real Page, ContinueIntegration, Instagram selection UI and Redirect (including its 3s timer).
// Only network, router, cookies and unrelated layout environment use synthetic fixtures.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import Page from '../../apps/frontend/src/app/(app)/integrations/social/[provider]/page';
import LayoutContext from '../../apps/frontend/src/components/layout/layout.context';

const mockCookies = jest.fn();
const mockFetch = jest.fn();
const mockPush = jest.fn();
const mockAssign = jest.fn();
jest.mock('next/headers', () => ({ cookies: () => mockCookies() }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({ useT: () => (_key: string, fallback: string) => fallback }));
jest.mock('@gitroom/react/helpers/variable.context', () => ({ useVariables: () => ({ backendUrl: 'https://postiz.example/api', isSecured: true }) }));
jest.mock('@gitroom/frontend/app/(app)/auth/return.url.component', () => ({ useReturnUrl: () => ({ getAndClear: () => undefined }) }));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({ deleteDialog: jest.fn().mockResolvedValue(false) }));
jest.mock('@gitroom/frontend/components/layout/set.timezone', () => ({ newDayjs: () => ({ utcOffset: () => 0 }) }));
jest.mock('@gitroom/frontend/components/launches/helpers/use.integration', () => {
  const React = require('react');
  const IntegrationContext = React.createContext({});
  return { IntegrationContext, useIntegration: () => React.useContext(IntegrationContext) };
});
jest.mock('@gitroom/frontend/components/new-launch/providers/continue-provider/list', () => ({
  continueProviderList: { instagram: jest.requireActual('@gitroom/frontend/components/new-launch/providers/continue-provider/instagram/instagram.continue').InstagramContinue },
}));

const callback = 'https://callback.example/integrations/social/instagram';
const fixed = 'https://jarvis.example/settings/sns-accounts/return';
const account = { id: 'fixture-account', pageId: 'fixture-page', name: 'Fixture Instagram account', picture: { data: { url: 'https://images.example/fixture.png' } } };
const response = (body: unknown, status = 200) => ({ status, json: async () => body, headers: { get: () => null } });
const originalLocation = window.location;
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

beforeAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: { assign: mockAssign, href: callback + '?code=fixture-code&state=fixture-state', pathname: '/integrations/social/instagram' } });
  global.fetch = mockFetch;
});
beforeEach(() => {
  mockFetch.mockReset();
  mockPush.mockReset();
  mockAssign.mockReset();
  mockCookies.mockReturnValue({ get: () => ({ name: 'auth', value: 'fixture-cookie' }) });
  process.env.INSTAGRAM_CALLBACK_URL = callback;
  process.env.JARVIS_CONNECT_RETURN_URL = fixed;
  window.location.href = callback + '?code=fixture-code&state=fixture-state';
});
afterAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  global.fetch = originalFetch;
  process.env = originalEnv;
});

async function mount(provider = 'instagram', refresh = false) {
  const element = await Page({ params: Promise.resolve({ provider }), searchParams: Promise.resolve({ code: 'fixture-code', state: 'fixture-state', ...(refresh ? { refresh: 'true' } : {}) }) });
  render(<LayoutContext>{element}</LayoutContext>);
  await act(async () => {});
}
async function selectAndSave() {
  fireEvent.click(await screen.findByText(account.name));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  await act(async () => {});
}

it('keeps a dedicated logged-in save inline when JARVIS is configured but the normal start has no returnURL (T04-1)', async () => {
  mockFetch.mockResolvedValueOnce(response({ id: 'fixture-integration', inBetweenSteps: true, pages: [account] })).mockResolvedValueOnce(response({}));
  await mount();
  await selectAndSave();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockAssign).not.toHaveBeenCalled();
  expect(screen.getByText('Channel Connected!')).toBeTruthy();
});

it('shows dedicated exchange HTTP 406 inline without navigating to launches when JARVIS is unset (T04-2)', async () => {
  delete process.env.JARVIS_CONNECT_RETURN_URL;
  mockFetch.mockResolvedValue(response({ msg: 'fixture-declined' }, 406));
  await mount();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockAssign).not.toHaveBeenCalled();
  expect(screen.getByText('Could not add provider')).toBeTruthy();
});

it('stays on the dedicated callback after HTTP 401 and the real Redirect 3-second window (T04-3)', async () => {
  delete process.env.JARVIS_CONNECT_RETURN_URL;
  mockFetch.mockResolvedValue(response({ message: 'fixture-expired' }, 401));
  await mount();
  await screen.findByText('Could not add provider');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 3100)); });
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockAssign).not.toHaveBeenCalled();
  expect(screen.getByText('Could not add provider')).toBeTruthy();
});

it.each([
  undefined,
  '/launches',
  'https://callback.example/launches',
  '//callback.example/launches',
  'https://legacy.example/return',
  'https://jarvis.example/settings/sns-accounts/return?extra=fixture',
])('keeps dedicated direct success inline unless returnURL exactly matches fixed JARVIS (case %#)', async returnURL => {
  mockFetch.mockResolvedValue(response({ id: 'fixture-integration', returnURL }));
  await mount();
  expect(screen.getByText('Channel Connected!')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockAssign).not.toHaveBeenCalled();
});

it.each([
  '/launches',
  'https://callback.example/launches',
  'https://legacy.example/return',
])('does not forward the dedicated selection save to another returnURL (case %#)', async returnURL => {
  mockFetch.mockResolvedValueOnce(response({ id: 'fixture-integration', inBetweenSteps: true, pages: [account], returnURL })).mockResolvedValueOnce(response({}, 201));
  await mount();
  await selectAndSave();
  expect(screen.getByText('Channel Connected!')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockAssign).not.toHaveBeenCalled();
  expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
    '/api/integrations/social-connect/instagram',
    '/api/integrations/public/provider/fixture-integration/connect',
  ]);
});

it('preserves the exact fixed external JARVIS return from dedicated direct success', async () => {
  mockFetch.mockResolvedValue(response({ id: 'fixture-integration', returnURL: fixed }));
  await mount();
  expect(mockAssign.mock.calls).toEqual([[fixed]]);
  expect(mockPush).not.toHaveBeenCalled();
});

it.each([false, true])('preserves the exact fixed external JARVIS return after dedicated selection save (refresh=%s)', async refresh => {
  mockFetch.mockResolvedValueOnce(response({ id: 'fixture-integration', inBetweenSteps: true, pages: [account], returnURL: fixed })).mockResolvedValueOnce(response({}, 201));
  await mount('instagram', refresh);
  await selectAndSave();
  expect(mockAssign.mock.calls).toEqual([[fixed]]);
  expect(mockPush).not.toHaveBeenCalled();
});

it.each([400, 401, 406, 409, 412, 500])('renders dedicated exchange HTTP %s as an error, never success or a returnURL navigation', async status => {
  delete process.env.JARVIS_CONNECT_RETURN_URL;
  mockFetch.mockResolvedValue(response({ message: 'fixture-failed', returnURL: 'https://callback.example/launches' }, status));
  await mount();
  expect(screen.getByText('Could not add provider')).toBeTruthy();
  expect(screen.queryByText('Channel Connected!')).toBeNull();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockAssign).not.toHaveBeenCalled();
});

it('keeps a dedicated failed selection save inline past the real Redirect timer', async () => {
  delete process.env.JARVIS_CONNECT_RETURN_URL;
  mockFetch.mockResolvedValueOnce(response({ id: 'fixture-integration', inBetweenSteps: true, pages: [account] })).mockResolvedValueOnce(response({ message: 'fixture-save-expired' }, 401));
  await mount();
  await selectAndSave();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 3100)); });
  expect(screen.getByText('Could not add provider')).toBeTruthy();
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockAssign).not.toHaveBeenCalled();
});

it.each([undefined, ''])('preserves ordinary authenticated selection saving and navigation with setting=%s', async setting => {
  if (setting === undefined) delete process.env.INSTAGRAM_CALLBACK_URL;
  else process.env.INSTAGRAM_CALLBACK_URL = setting;
  delete process.env.JARVIS_CONNECT_RETURN_URL;
  mockFetch.mockResolvedValueOnce(response({ id: 'fixture-integration', inBetweenSteps: true, pages: [account] })).mockResolvedValueOnce(response({}));
  await mount();
  await selectAndSave();
  expect(mockPush.mock.calls).toEqual([['/launches?added=instagram&msg=Channel Added']]);
  expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
    'https://postiz.example/api/integrations/social-connect/instagram',
    'https://postiz.example/api/integrations/provider/fixture-integration/connect',
  ]);
});

it('preserves the real delayed Redirect for ordinary authenticated errors when dedicated setting is unset', async () => {
  delete process.env.INSTAGRAM_CALLBACK_URL;
  delete process.env.JARVIS_CONNECT_RETURN_URL;
  mockFetch.mockResolvedValue(response({ message: 'fixture-expired' }, 401));
  await mount();
  expect(mockPush).not.toHaveBeenCalled();
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 3100)); });
  expect(mockPush.mock.calls).toEqual([['/launches']]);
});

it.each(['facebook', 'tiktok', 'x'])('preserves ordinary authenticated navigation for other provider %s', async provider => {
  delete process.env.JARVIS_CONNECT_RETURN_URL;
  mockFetch.mockResolvedValue(response({ id: 'fixture-integration' }));
  await mount(provider);
  expect(mockPush.mock.calls).toEqual([[`/launches?added=${provider}&msg=Channel Updated`]]);
  expect(mockFetch.mock.calls[0][0]).toBe(`https://postiz.example/api/integrations/social-connect/${provider}`);
});
