// Only synthetic organizations, states and responses. No Redis, SNS or database connection.
import 'reflect-metadata';
import { Logger, RequestMethod } from '@nestjs/common';
import { HEADERS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

const redis = { set: jest.fn().mockResolvedValue('OK') };
jest.doMock('@gitroom/nestjs-libraries/redis/redis.service', () => ({ ioRedis: redis }));
jest.doMock('@sentry/nestjs', () => ({ metrics: { count: jest.fn() } }));
jest.doMock('@gitroom/nestjs-libraries/sentry/initialize.sentry', () => ({ setSentryUserContext: jest.fn() }));
// Unrelated constructor dependencies/DTOs are not executed by these method-level tests.
for (const path of [
  '@gitroom/nestjs-libraries/upload/multer.stream.engine',
  '@gitroom/nestjs-libraries/integrations/integration.manager',
  '@gitroom/nestjs-libraries/integrations/refresh.integration.service',
  '@gitroom/nestjs-libraries/integrations/social.abstract',
  '@gitroom/nestjs-libraries/upload/upload.factory',
  '@gitroom/nestjs-libraries/database/prisma/prisma.service',
  '@gitroom/nestjs-libraries/database/prisma/posts/posts.service',
  '@gitroom/nestjs-libraries/database/prisma/media/media.service',
  '@gitroom/nestjs-libraries/database/prisma/notifications/notification.service',
  '@gitroom/nestjs-libraries/database/prisma/users/users.service',
  '@gitroom/nestjs-libraries/database/prisma/organizations/organization.service',
  '@gitroom/nestjs-libraries/database/prisma/subscriptions/subscription.service',
  '@gitroom/nestjs-libraries/database/prisma/admin-stats/admin-stats.service',
  '@gitroom/nestjs-libraries/database/prisma/clipping/clipping.service',
  '@gitroom/nestjs-libraries/database/prisma/autopost/autopost.repository',
  '@gitroom/nestjs-libraries/database/prisma/oauth/oauth.service',
  '@gitroom/backend/services/auth/permissions/permissions.ability',
  '@gitroom/backend/services/auth/permissions/permission.exception.class',
  '@gitroom/backend/services/auth/super.admin.guard',
  '@gitroom/backend/api/routes/posts.validation.exception',
  '@gitroom/nestjs-libraries/chat/validation.schemas.helper',
]) {
  jest.doMock(path, () => new Proxy({}, { get: () => function Stub() { return () => {}; } }));
}

const { PublicIntegrationsController } = require('../../apps/backend/src/public-api/routes/v1/public.integrations.controller');
const { PublicAuthMiddleware } = require('../../apps/backend/src/services/auth/public.auth.middleware');
const { IntegrationRepository } = require('../../libraries/nestjs-libraries/src/database/prisma/integrations/integration.repository');
const { IntegrationService } = require('../../libraries/nestjs-libraries/src/database/prisma/integrations/integration.service');
const fixed = 'https://jarvis.example/settings/sns-accounts/return';
const org = { id: 'fixture-store-a' };
let controller: any;
let provider: any;
let integrationService: any;
const originalReturnUrl = process.env.JARVIS_CONNECT_RETURN_URL;

beforeEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  process.env.JARVIS_CONNECT_RETURN_URL = fixed;
  provider = { generateAuthUrl: jest.fn().mockResolvedValue({ codeVerifier: 'fixture-verifier', state: 'fixture-state', url: 'https://sns.example/authorize' }) };
  integrationService = { getPublicIntegrationHealth: jest.fn().mockResolvedValue([]) };
  controller = Object.assign(Object.create(PublicIntegrationsController.prototype), {
    _integrationService: integrationService,
    _integrationManager: {
      getAllowedSocialsIntegrations: () => ['instagram', 'tiktok', 'facebook'],
      getMigrationTarget: () => undefined,
      getSocialIntegration: () => provider,
    },
  });
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => {
  if (originalReturnUrl === undefined) delete process.env.JARVIS_CONNECT_RETURN_URL;
  else process.env.JARVIS_CONNECT_RETURN_URL = originalReturnUrl;
});

describe('public connect start', () => {
  it.each(['instagram', 'tiktok'])('reuses generated state and the existing one-hour return flow for %s', async (name) => {
    await expect(controller.getIntegrationUrl(name, undefined, org, 'jarvis')).resolves.toEqual({ url: 'https://sns.example/authorize' });
    expect(redis.set.mock.calls).toEqual([
      ['organization:fixture-state', org.id, 'EX', 3600],
      ['login:fixture-state', 'fixture-verifier', 'EX', 3600],
      ['redirect:fixture-state', fixed, 'EX', 3600],
    ]);
  });
  it('resolves only the same organization Instagram row to internalId before storing refresh', async () => {
    const internalId = '123456789012345'; // Synthetic fixture, never a real account ID.
    integrationService.getIntegrationById = jest.fn().mockResolvedValue({
      id: 'fixture-row', organizationId: org.id, providerIdentifier: 'instagram', type: 'social', deletedAt: null, internalId,
    });
    await controller.getIntegrationUrl('instagram', 'fixture-row', org, 'jarvis');
    expect(integrationService.getIntegrationById).toHaveBeenCalledTimes(1);
    expect(integrationService.getIntegrationById).toHaveBeenCalledWith(org.id, 'fixture-row');
    expect(redis.set.mock.calls).toEqual([
      ['refresh:fixture-state', internalId, 'EX', 3600],
      ['organization:fixture-state', org.id, 'EX', 3600],
      ['login:fixture-state', 'fixture-verifier', 'EX', 3600],
      ['redirect:fixture-state', fixed, 'EX', 3600],
    ]);
  });
  it.each([
    null,
    { organizationId: 'fixture-other-store' },
    { id: 'fixture-other-row' },
    { providerIdentifier: 'tiktok' },
    { type: 'article' },
    { deletedAt: new Date('2026-01-01T00:00:00Z') },
    ...[undefined, null, '', 'nograph__fixture', '12 34', 12345].map(internalId => ({ internalId })),
  ])('rejects missing, foreign, mismatched or invalid refresh rows before provider I/O (case %#)', async (change) => {
    integrationService.getIntegrationById = jest.fn().mockResolvedValue(change === null ? null : {
      id: 'fixture-row', organizationId: org.id, providerIdentifier: 'instagram', type: 'social', deletedAt: null,
      internalId: '123456789012345', ...change,
    });
    const getProvider = jest.spyOn(controller._integrationManager, 'getSocialIntegration');
    await expect(controller.getIntegrationUrl('instagram', 'fixture-row', org, 'jarvis')).rejects.toMatchObject({ status: 400 });
    expect(integrationService.getIntegrationById).toHaveBeenCalledWith(org.id, 'fixture-row');
    expect(getProvider).not.toHaveBeenCalled();
    expect(provider.generateAuthUrl).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
  it('stops on row lookup failure without generating OAuth state or writing Redis', async () => {
    integrationService.getIntegrationById = jest.fn().mockRejectedValue(new Error('fixture lookup failure'));
    await expect(controller.getIntegrationUrl('instagram', 'fixture-row', org, 'jarvis')).rejects.toThrow('fixture lookup failure');
    expect(provider.generateAuthUrl).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
  it.each(['', 'fixture/row', 'fixture?row'])('rejects unsafe refresh row %s before lookup', async refresh => {
    integrationService.getIntegrationById = jest.fn();
    await expect(controller.getIntegrationUrl('instagram', refresh, org, 'jarvis')).rejects.toMatchObject({ status: 400 });
    expect(integrationService.getIntegrationById).not.toHaveBeenCalled();
    expect(provider.generateAuthUrl).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
  it('does not enable JARVIS refresh for another provider', async () => {
    integrationService.getIntegrationById = jest.fn();
    await expect(controller.getIntegrationUrl('tiktok', 'fixture-row', org, 'jarvis')).rejects.toMatchObject({ status: 400 });
    expect(integrationService.getIntegrationById).not.toHaveBeenCalled();
    expect(provider.generateAuthUrl).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
  it('does not migrate a JARVIS Instagram refresh to another provider', async () => {
    integrationService.getIntegrationById = jest.fn();
    controller._integrationManager.getMigrationTarget = () => 'tiktok';
    await expect(controller.getIntegrationUrl('instagram', 'fixture-row', org, 'jarvis')).rejects.toMatchObject({ status: 400 });
    expect(integrationService.getIntegrationById).not.toHaveBeenCalled();
    expect(provider.generateAuthUrl).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
  it('keeps ordinary connections and refresh state unchanged', async () => {
    integrationService.getIntegrationById = jest.fn();
    await controller.getIntegrationUrl('facebook', 'fixture-refresh-id', org);
    expect(integrationService.getIntegrationById).not.toHaveBeenCalled();
    expect(redis.set.mock.calls).toEqual([
      ['refresh:fixture-state', 'fixture-refresh-id', 'EX', 3600],
      ['organization:fixture-state', org.id, 'EX', 3600],
      ['login:fixture-state', 'fixture-verifier', 'EX', 3600],
    ]);
  });
  it.each(['', 'unknown', 'https://untrusted.example'])('rejects unknown returnTo %s before authorization', async (value) => {
    await expect(controller.getIntegrationUrl('instagram', undefined, org, value)).rejects.toMatchObject({ status: 400 });
    expect(provider.generateAuthUrl).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });
  it.each([undefined, '', 'http://jarvis.example/settings/sns-accounts/return', fixed + '?code=fixture'])('fails closed for missing/invalid server configuration %s', async (value) => {
    if (value === undefined) delete process.env.JARVIS_CONNECT_RETURN_URL;
    else process.env.JARVIS_CONNECT_RETURN_URL = value;
    await expect(controller.getIntegrationUrl('instagram', undefined, org, 'jarvis')).rejects.toMatchObject({ status: 400 });
    expect(provider.generateAuthUrl).not.toHaveBeenCalled();
  });
  it('does not enable JARVIS for other providers or migrated unsupported providers', async () => {
    await expect(controller.getIntegrationUrl('facebook', undefined, org, 'jarvis')).rejects.toMatchObject({ status: 400 });
    controller._integrationManager.getMigrationTarget = () => 'facebook';
    await expect(controller.getIntegrationUrl('instagram', 'fixture-refresh', org, 'jarvis')).rejects.toMatchObject({ status: 400 });
    expect(provider.generateAuthUrl).not.toHaveBeenCalled();
  });
});

describe('secret-free recorded health', () => {
  it('exposes the dedicated GET route', () => {
    expect(Reflect.getMetadata(PATH_METADATA, controller.getIntegrationsHealth)).toBe('/integrations/health');
    expect(Reflect.getMetadata(METHOD_METADATA, controller.getIntegrationsHealth)).toBe(RequestMethod.GET);
  });
  it('scopes a dedicated six-column query to one organization, social and nondeleted records', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = { _integration: { model: { integration: { findMany } } } };
    await IntegrationRepository.prototype.getPublicIntegrationHealth.call(repository, org.id);
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: org.id, deletedAt: null, type: 'social' },
      select: { id: true, providerIdentifier: true, disabled: true, refreshNeeded: true, inBetweenSteps: true, tokenExpiration: true },
    });
  });
  it('uses only the dedicated repository read, without refresh, analytics or posting', async () => {
    const getPublicIntegrationHealth = jest.fn().mockResolvedValue([]);
    await expect(IntegrationService.prototype.getPublicIntegrationHealth.call({ _integrationRepository: { getPublicIntegrationHealth } }, org.id)).resolves.toEqual([]);
    expect(getPublicIntegrationHealth).toHaveBeenCalledWith(org.id);
  });
  it('returns empty integrations as a successful observation, with no-store and UTC timestamp', async () => {
    const result = await controller.getIntegrationsHealth(org);
    expect(Object.keys(result).sort()).toEqual(['checkedAt', 'integrations']);
    expect(result.integrations).toEqual([]);
    expect(new Date(result.checkedAt).toISOString()).toBe(result.checkedAt);
    expect(Reflect.getMetadata(HEADERS_METADATA, controller.getIntegrationsHealth)).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
  });
  it.each(Array.from({ length: 8 }, (_, i) => i))('whitelists response keys and preserves all state flags (%s)', async (i) => {
    const row = { id: 'fixture-integration', providerIdentifier: 'instagram', disabled: !!(i & 1), refreshNeeded: !!(i & 2), inBetweenSteps: !!(i & 4), tokenExpiration: i % 2 ? new Date('2020-01-01T00:00:00Z') : null, token: 'not-a-real-secret', refreshToken: 'not-a-real-secret', internalId: 'excluded', organizationId: org.id };
    integrationService.getPublicIntegrationHealth.mockResolvedValue([row]);
    const result = await controller.getIntegrationsHealth(org);
    expect(result.integrations).toEqual([{ id: row.id, identifier: row.providerIdentifier, disabled: row.disabled, refreshNeeded: row.refreshNeeded, inBetweenSteps: row.inBetweenSteps, tokenExpiration: row.tokenExpiration?.toISOString() ?? null }]);
    expect(integrationService.getPublicIntegrationHealth).toHaveBeenCalledWith(org.id);
  });
  it('uses the authenticated organization rather than a different store', async () => {
    await controller.getIntegrationsHealth({ id: 'fixture-store-b' });
    expect(integrationService.getPublicIntegrationHealth).toHaveBeenCalledWith('fixture-store-b');
  });
  it.each(['', '   ', 'fixture-other-store'])('rejects organization override headers including empty values (%s)', async (override) => {
    await expect(controller.getIntegrationsHealth(org, override)).rejects.toMatchObject({ status: 403 });
    expect(integrationService.getPublicIntegrationHealth).not.toHaveBeenCalled();
  });
});

describe('existing public authentication and health override boundary', () => {
  const make = (authorization?: string, override?: string, path = '/api/public/v1/integrations/health') => {
    const organizations = { getOrgByApiKey: jest.fn().mockImplementation(async (value) => value === 'fixture-store-a' ? org : null), canUseSuperAdminApi: jest.fn().mockResolvedValue(true), getOrgByIdWithSubscription: jest.fn().mockResolvedValue({ id: 'fixture-store-b' }) };
    const middleware = new PublicAuthMiddleware(organizations, { getOrgByOAuthToken: jest.fn() });
    const headers: Record<string, string> = {};
    if (authorization !== undefined) headers.authorization = authorization;
    if (override !== undefined) headers['x-postiz-org'] = override;
    const req: any = { method: 'GET', path, headers };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
    const next = jest.fn();
    return { organizations, middleware, req, res, next };
  };
  it.each([undefined, 'invalid-fixture'])('rejects absent/invalid store API key (%s)', async (authorization) => {
    const x = make(authorization);
    await x.middleware.use(x.req, x.res, x.next);
    expect(x.res.status).toHaveBeenCalledWith(401);
    expect(x.next).not.toHaveBeenCalled();
  });
  it('keeps the API key organization as the authenticated scope', async () => {
    const x = make('fixture-store-a');
    await x.middleware.use(x.req, x.res, x.next);
    expect(x.req.org.id).toBe(org.id);
    expect(x.next).toHaveBeenCalledTimes(1);
  });
  it.each([
    '/api/public/v1/integrations/health',
    '/api/public/v1/integrations/health/',
    '/API/PUBLIC/V1/INTEGRATIONS/HEALTH/',
    '/public/v1/integrations/health',
    '/public/v1/integrations/health/',
    '/PUBLIC/V1/INTEGRATIONS/HEALTH/',
  ].flatMap((path) => ['', '   ', 'fixture-store-b'].map((override) => [path, override])))('rejects override before lookup, even for super-admin (%s, %s)', async (path, override) => {
    const x = make('fixture-store-a', override, path);
    await x.middleware.use(x.req, x.res, x.next);
    expect(x.res.status).toHaveBeenCalledWith(403);
    expect(x.organizations.canUseSuperAdminApi).not.toHaveBeenCalled();
    expect(x.organizations.getOrgByIdWithSubscription).not.toHaveBeenCalled();
    expect(x.next).not.toHaveBeenCalled();
  });
  it.each([undefined, 'invalid-fixture'])('authenticates before rejecting override (%s)', async (authorization) => {
    const x = make(authorization, 'fixture-store-b');
    await x.middleware.use(x.req, x.res, x.next);
    expect(x.res.status).toHaveBeenCalledWith(401);
    expect(x.organizations.getOrgByIdWithSubscription).not.toHaveBeenCalled();
    expect(x.next).not.toHaveBeenCalled();
  });
  it.each(['', 'fixture-store-b'])('rejects HEAD override before looking up another organization (%s)', async (override) => {
    const x = make('fixture-store-a', override);
    x.req.method = 'HEAD';
    await x.middleware.use(x.req, x.res, x.next);
    expect(x.res.status).toHaveBeenCalledWith(403);
    expect(x.organizations.canUseSuperAdminApi).not.toHaveBeenCalled();
    expect(x.organizations.getOrgByIdWithSubscription).not.toHaveBeenCalled();
    expect(x.next).not.toHaveBeenCalled();
  });
  it('leaves the existing super-admin override on other routes unchanged', async () => {
    const x = make('fixture-store-a', 'fixture-store-b', '/api/public/v1/integrations');
    await x.middleware.use(x.req, x.res, x.next);
    expect(x.req.org.id).toBe('fixture-store-b');
    expect(x.next).toHaveBeenCalled();
  });
});
