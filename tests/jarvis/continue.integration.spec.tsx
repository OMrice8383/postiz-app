/** @jest-environment jsdom */
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContinueIntegration } from '../../apps/frontend/src/components/launches/continue.integration';

const mockFetch = jest.fn();
const mockPush = jest.fn();
const mockAssign = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@gitroom/helpers/utils/custom.fetch', () => ({ useFetch: () => mockFetch }));
jest.mock('@gitroom/react/translation/get.transation.service.client', () => ({ useT: () => (_key: string, fallback: string) => fallback }));
jest.mock('@gitroom/react/helpers/variable.context', () => ({ useVariables: () => ({}) }));
jest.mock('@gitroom/frontend/components/layout/redirect', () => ({ Redirect: () => <div data-testid="legacy-redirect" /> }));
jest.mock('@gitroom/frontend/components/layout/set.timezone', () => ({ newDayjs: () => ({ utcOffset: () => 0 }) }));
jest.mock('@gitroom/frontend/components/launches/helpers/use.integration', () => ({ IntegrationContext: require('react').createContext({}) }));
jest.mock('@gitroom/frontend/components/new-launch/providers/continue-provider/list', () => ({
  continueProviderList: { instagram: ({ onSave }: any) => <button onClick={() => onSave({ page: 'fixture-page' })}>Choose page</button> },
}));

const fixed = 'https://jarvis.example/settings/sns-accounts/return';
const response = (body: unknown, status = 200) => ({ status, json: async () => body });
const connect = (extra: any = {}) => render(<ContinueIntegration {...{ provider: 'instagram', searchParams: { code: 'fixture-code', state: 'fixture-state' }, logged: false, jarvisReturnUrl: fixed, ...extra }} />);
const backButton = () => screen.findByRole('button', { name: 'JARVISへ戻って確認' });
const originalLocation = window.location;
beforeAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: { assign: mockAssign } });
});
afterAll(() => Object.defineProperty(window, 'location', { configurable: true, value: originalLocation }));
beforeEach(() => {
  mockFetch.mockReset();
  mockPush.mockReset();
  mockAssign.mockReset();
});

it('returns externally to the exact fixed URL, without msg, added, code or state', async () => {
  mockFetch.mockResolvedValue(response({ id: 'fixture-integration', returnURL: fixed }));
  connect();
  await waitFor(() => expect(mockAssign).toHaveBeenCalledWith(fixed));
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockAssign.mock.calls).toEqual([[fixed]]);
});

it.each([false, true])('waits for successful Instagram page selection, including refresh=%s', async (refresh) => {
  mockFetch.mockResolvedValueOnce(response({ inBetweenSteps: true, id: 'fixture-integration', pages: [], returnURL: fixed })).mockResolvedValueOnce(response({}));
  connect({ searchParams: { code: 'fixture-code', state: 'fixture-state', ...(refresh ? { refresh: 'true' } : {}) } });
  fireEvent.click(await screen.findByRole('button', { name: 'Choose page' }));
  expect(mockAssign).not.toHaveBeenCalled();
  await waitFor(() => expect(mockAssign).toHaveBeenCalledWith(fixed));
  expect(mockFetch.mock.calls[1][0]).toBe('/integrations/public/provider/fixture-integration/connect');
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

it.each([400, 406, 409, 412, 500])('shows a fixed safe return button on HTTP %s, not raw callback errors', async (status) => {
  mockFetch.mockResolvedValue(response({ message: 'raw-error-do-not-forward', msg: 'raw-error-do-not-forward', returnURL: fixed }, status));
  connect({ logged: true });
  const back = await backButton();
  expect(mockAssign).not.toHaveBeenCalled();
  expect(screen.queryByText(/raw-error-do-not-forward/)).toBeNull();
  expect(screen.queryByTestId('legacy-redirect')).toBeNull();
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
  mockFetch.mockResolvedValueOnce(response({ inBetweenSteps: true, id: 'fixture-integration', pages: [], returnURL: fixed }));
  if (network) mockFetch.mockRejectedValueOnce(new Error('raw-page-save-error'));
  else mockFetch.mockResolvedValueOnce(response({ message: 'raw-page-save-error' }, 500));
  connect();
  fireEvent.click(await screen.findByRole('button', { name: 'Choose page' }));
  fireEvent.click(await backButton());
  expect(mockAssign.mock.calls).toEqual([[fixed]]);
  expect(screen.queryByText(/raw-page-save-error/)).toBeNull();
});

it('keeps ordinary logged-in navigation without the new setting', async () => {
  mockFetch.mockResolvedValue(response({ id: 'fixture-integration' }));
  connect({ logged: true, jarvisReturnUrl: undefined });
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/launches?added=instagram&msg=Channel Updated'));
  expect(mockAssign).not.toHaveBeenCalled();
});

it('keeps existing custom returnURL behavior without the new setting', async () => {
  mockFetch.mockResolvedValue(response({ returnURL: 'https://legacy.example/return' }));
  connect({ jarvisReturnUrl: undefined });
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('https://legacy.example/return?added=instagram&msg=Channel Updated'));
  expect(mockAssign).not.toHaveBeenCalled();
});
