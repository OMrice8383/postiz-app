/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContinueIntegration } from '../../apps/frontend/src/components/launches/continue.integration';
import LayoutContext from '../../apps/frontend/src/components/layout/layout.context';
import CallbackPage from '../../apps/frontend/src/app/(app)/integrations/social/[provider]/page';

const mockCookies = jest.fn();
jest.mock('next/headers', () => ({ cookies: () => mockCookies() }));

const mockFetch = jest.fn();
const mockPush = jest.fn();
const mockAssign = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({ useT: () => (_key: string, fallback: string) => fallback }));
jest.mock('@gitroom/react/helpers/variable.context', () => ({ useVariables: () => ({ backendUrl: 'https://postiz.example/api', isSecured: true }) }));
jest.mock('@gitroom/frontend/app/(app)/auth/return.url.component', () => ({ useReturnUrl: () => ({ getAndClear: () => undefined }) }));
jest.mock('@gitroom/react/helpers/delete.dialog', () => ({ deleteDialog: jest.fn().mockResolvedValue(false) }));
jest.mock('@gitroom/frontend/components/layout/redirect', () => ({ Redirect: () => <div data-testid="legacy-redirect" /> }));
jest.mock('@gitroom/frontend/components/layout/set.timezone', () => ({ newDayjs: () => ({ utcOffset: () => 0 }) }));
jest.mock('@gitroom/frontend/components/launches/helpers/use.integration', () => {
  const React = require('react');
  const IntegrationContext = React.createContext({});
  return { IntegrationContext, useIntegration: () => React.useContext(IntegrationContext) };
});
jest.mock('@gitroom/frontend/components/new-launch/providers/continue-provider/list', () => ({
  continueProviderList: { instagram: jest.requireActual('@gitroom/frontend/components/new-launch/providers/continue-provider/instagram/instagram.continue').InstagramContinue },
}));

const fixed = 'https://jarvis.example/settings/sns-accounts/return';
const response = (body: unknown, status = 200) => ({ status, json: async () => body, headers: { get: () => null } });
const page = { id: 'fixture-page', pageId: 'fixture-page-id', name: 'Fixture page', picture: { data: { url: 'https://images.example/fixture.png' } } };
const callbackHref = 'https://postiz.example/integrations/social/instagram?code=fixture-code&state=fixture-state';
const connect = (extra: any = {}) => render(<LayoutContext><ContinueIntegration {...{ provider: 'instagram', searchParams: { code: 'fixture-code', state: 'fixture-state' }, logged: false, jarvisReturnUrl: fixed, ...extra }} /></LayoutContext>);
const backButton = () => screen.findByRole('button', { name: 'JARVISへ戻って確認' });
const originalLocation = window.location;
const originalFetch = global.fetch;
const originalEnv = { ...process.env };
beforeAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: { assign: mockAssign, href: callbackHref, pathname: '/integrations/social/instagram' } });
  global.fetch = mockFetch;
});
afterAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  global.fetch = originalFetch;
  process.env = originalEnv;
});
beforeEach(() => {
  window.location.href = callbackHref;
  delete process.env.INSTAGRAM_CALLBACK_URL;
  delete process.env.JARVIS_CONNECT_RETURN_URL;
  mockCookies.mockReturnValue({ get: () => undefined });
  mockFetch.mockReset();
  mockPush.mockReset();
  mockAssign.mockReset();
});

it.each([false, true])('uses only the two same-origin public POST APIs from the dedicated callback page (logged=%s)', async (logged) => {
  process.env.INSTAGRAM_CALLBACK_URL = 'https://callback.example/integrations/social/instagram';
  mockCookies.mockReturnValue({ get: () => logged ? { name: 'auth' } : undefined });
  mockFetch.mockResolvedValueOnce(response({ inBetweenSteps: true, id: 'fixture-integration', pages: [page] })).mockResolvedValueOnce(response({}));
  const element = await CallbackPage({ params: Promise.resolve({ provider: 'instagram' }), searchParams: Promise.resolve({ code: 'fixture-code', state: 'fixture-state' }) });
  render(<LayoutContext>{element}</LayoutContext>);
  fireEvent.click(await screen.findByText('Fixture page'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  expect(mockFetch.mock.calls.map(([url, options]) => [url, options.method])).toEqual([
    ['/api/integrations/social-connect/instagram', 'POST'],
    ['/api/integrations/public/provider/fixture-integration/connect', 'POST'],
  ]);
  expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ code: 'fixture-code', state: 'fixture-state', id: 'fixture-page', pageId: 'fixture-page-id' });
});

it.each([
  ['instagram', undefined],
  ['instagram', ''],
  ['facebook', 'https://callback.example/integrations/social/instagram'],
  ['tiktok', 'invalid-fixture-setting'],
])('keeps the existing API base for callback provider=%s setting=%s', async (provider, setting) => {
  if (setting !== undefined) process.env.INSTAGRAM_CALLBACK_URL = setting;
  mockFetch.mockResolvedValue(response({ id: 'fixture-integration' }));
  const element = await CallbackPage({ params: Promise.resolve({ provider: provider! }), searchParams: Promise.resolve({ code: 'fixture-code', state: 'fixture-state' }) });
  render(<LayoutContext>{element}</LayoutContext>);
  await screen.findByText('Channel Connected!');
  expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([`https://postiz.example/api/integrations/social-connect/${provider}`]);
});

it('keeps authenticated page saving on the existing origin without the dedicated setting', async () => {
  mockCookies.mockReturnValue({ get: () => ({ name: 'auth' }) });
  mockFetch.mockResolvedValueOnce(response({ inBetweenSteps: true, id: 'fixture-integration', pages: [page] })).mockResolvedValueOnce(response({}));
  const element = await CallbackPage({ params: Promise.resolve({ provider: 'instagram' }), searchParams: Promise.resolve({ code: 'fixture-code', state: 'fixture-state' }) });
  render(<LayoutContext>{element}</LayoutContext>);
  fireEvent.click(await screen.findByText('Fixture page'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/launches?added=instagram&msg=Channel Added'));
  expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
    'https://postiz.example/api/integrations/social-connect/instagram',
    'https://postiz.example/api/integrations/provider/fixture-integration/connect',
  ]);
});

it.each([401, 406])('handles dedicated exchange HTTP %s locally even without a JARVIS return setting', async (status) => {
  mockFetch.mockResolvedValue(response({ msg: 'fixture-declined' }, status));
  connect({ logged: true, jarvisReturnUrl: undefined, callbackApiBase: '/api' });
  if (status === 406) {
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/launches?msg=fixture-declined'));
  } else {
    await screen.findAllByText('Could not add provider');
    expect(mockPush).not.toHaveBeenCalled();
  }
  expect(window.location.href).toBe(callbackHref);
  expect(mockFetch.mock.calls.map(([url]) => url)).toEqual(['/api/integrations/social-connect/instagram']);
});

it.each([401, 406])('handles dedicated page-save HTTP %s locally even without a JARVIS return setting', async (status) => {
  mockFetch.mockResolvedValueOnce(response({ inBetweenSteps: true, id: 'fixture-integration', pages: [page] })).mockResolvedValueOnce(response({}, status));
  connect({ logged: true, jarvisReturnUrl: undefined, callbackApiBase: '/api' });
  fireEvent.click(await screen.findByText('Fixture page'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Could not add provider');
  expect(window.location.href).toBe(callbackHref);
  expect(mockFetch.mock.calls.map(([url]) => url)).toEqual([
    '/api/integrations/social-connect/instagram',
    '/api/integrations/public/provider/fixture-integration/connect',
  ]);
  expect(mockPush).not.toHaveBeenCalled();
});

it('fails closed before rendering the Instagram callback with invalid configuration', async () => {
  process.env.INSTAGRAM_CALLBACK_URL = 'http://fixture-sensitive.example/integrations/social/instagram';
  await expect(CallbackPage({ params: Promise.resolve({ provider: 'instagram' }), searchParams: Promise.resolve({ code: 'fixture-code', state: 'fixture-state' }) })).rejects.toThrow(/^Invalid INSTAGRAM_CALLBACK_URL$/);
  expect(mockFetch).not.toHaveBeenCalled();
});

it('returns externally to the exact fixed URL, without msg, added, code or state', async () => {
  mockFetch.mockResolvedValue(response({ id: 'fixture-integration', returnURL: fixed }));
  connect();
  await waitFor(() => expect(mockAssign).toHaveBeenCalledWith(fixed));
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockAssign.mock.calls).toEqual([[fixed]]);
});

it.each([false, true])('waits for successful Instagram page selection, including refresh=%s', async (refresh) => {
  mockFetch.mockResolvedValueOnce(response({ inBetweenSteps: true, id: 'fixture-integration', pages: [page], returnURL: fixed })).mockResolvedValueOnce(response({}));
  connect({ searchParams: { code: 'fixture-code', state: 'fixture-state', ...(refresh ? { refresh: 'true' } : {}) } });
  fireEvent.click(await screen.findByText('Fixture page'));
  expect(mockAssign).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(mockAssign).toHaveBeenCalledWith(fixed));
  expect(mockFetch.mock.calls[1][0]).toBe('https://postiz.example/api/integrations/public/provider/fixture-integration/connect');
});

it('does not start token exchange when the SNS callback contains refusal without a code', async () => {
  connect({ searchParams: { error: 'raw-refusal-do-not-forward', state: 'fixture-state' } });
  const back = await backButton();
  expect(mockFetch).not.toHaveBeenCalled();
  expect(mockAssign).not.toHaveBeenCalled();
  expect(screen.queryByText(/raw-refusal-do-not-forward/)).toBeNull();
  fireEvent.click(back);
  expect(mockAssign.mock.calls).toEqual([[fixed]]);
});

it.each([400, 401, 406, 409, 412, 500])('shows a fixed safe return button on HTTP %s, not raw callback errors', async (status) => {
  mockFetch.mockResolvedValue(response({ message: 'raw-error-do-not-forward', msg: 'raw-error-do-not-forward', returnURL: fixed }, status));
  connect({ logged: true });
  const back = await backButton();
  expect(mockAssign).not.toHaveBeenCalled();
  expect(screen.queryByText(/raw-error-do-not-forward/)).toBeNull();
  expect(screen.queryByTestId('legacy-redirect')).toBeNull();
  expect(window.location.href).toBe(callbackHref);
  fireEvent.click(back);
  expect(mockAssign.mock.calls).toEqual([[fixed]]);
});

it('offers the same safe return after expired state', async () => {
  mockFetch.mockResolvedValue(response({ message: 'Invalid or expired state' }, 400));
  connect();
  fireEvent.click(await backButton());
  expect(mockAssign.mock.calls).toEqual([[fixed]]);
});

it('catches network failure without forwarding the error', async () => {
  mockFetch.mockRejectedValue(new Error('raw-network-error'));
  connect();
  fireEvent.click(await backButton());
  expect(mockAssign.mock.calls).toEqual([[fixed]]);
  expect(screen.queryByText(/raw-network-error/)).toBeNull();
});

it('catches invalid callback responses', async () => {
  mockFetch.mockResolvedValue({ status: 200, json: async () => { throw new Error('bad JSON'); } });
  connect();
  expect(await backButton()).toBeTruthy();
});

it.each([false, true])('does not return as success when saving a page fails (network=%s)', async (network) => {
  mockFetch.mockResolvedValueOnce(response({ inBetweenSteps: true, id: 'fixture-integration', pages: [page], returnURL: fixed }));
  if (network) mockFetch.mockRejectedValueOnce(new Error('raw-page-save-error'));
  else mockFetch.mockResolvedValueOnce(response({ message: 'raw-page-save-error' }, 500));
  connect();
  fireEvent.click(await screen.findByText('Fixture page'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('接続を確認できませんでした。JARVISに戻って状態を確認してください。');
  fireEvent.click(await backButton());
  expect(mockAssign.mock.calls).toEqual([[fixed]]);
  expect(screen.queryByText(/raw-page-save-error/)).toBeNull();
});

it('offers a fixed way back when the real Instagram provider has no selectable accounts', async () => {
  mockFetch.mockResolvedValue(response({ inBetweenSteps: true, id: 'fixture-integration', pages: [], returnURL: fixed }));
  connect();
  expect(await screen.findByText("We couldn't find any business connected to the selected pages.")).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  expect(mockAssign).not.toHaveBeenCalled();
  fireEvent.click(await backButton());
  expect(mockAssign.mock.calls).toEqual([[fixed]]);
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it.each([401, 406])('handles page-save HTTP %s locally, without layout navigation or a pending response', async (status) => {
  mockFetch.mockResolvedValueOnce(response({ inBetweenSteps: true, id: 'fixture-integration', pages: [page], returnURL: fixed })).mockResolvedValueOnce(response({}, status));
  connect({ logged: true });
  fireEvent.click(await screen.findByText('Fixture page'));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('接続を確認できませんでした。JARVISに戻って状態を確認してください。');
  const back = await backButton();
  expect(window.location.href).toBe(callbackHref);
  fireEvent.click(back);
  expect(mockAssign.mock.calls).toEqual([[fixed]]);
});

it('keeps ordinary logged-in navigation without the new setting', async () => {
  mockFetch.mockResolvedValue(response({ id: 'fixture-integration' }));
  connect({ logged: true, jarvisReturnUrl: undefined });
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/launches?added=instagram&msg=Channel Updated'));
  expect(mockAssign).not.toHaveBeenCalled();
});

it('keeps ordinary layout session-expiry navigation without the new setting', async () => {
  mockFetch.mockResolvedValue(response({ message: 'fixture session expired' }, 401));
  connect({ logged: true, jarvisReturnUrl: undefined });
  await waitFor(() => expect(window.location.href).toBe('/'));
  expect(screen.queryByRole('button', { name: 'JARVISへ戻って確認' })).toBeNull();
  expect(mockAssign).not.toHaveBeenCalled();
});

it('keeps existing custom returnURL behavior without the new setting', async () => {
  mockFetch.mockResolvedValue(response({ returnURL: 'https://legacy.example/return' }));
  connect({ jarvisReturnUrl: undefined });
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('https://legacy.example/return?added=instagram&msg=Channel Updated'));
  expect(mockAssign).not.toHaveBeenCalled();
});
