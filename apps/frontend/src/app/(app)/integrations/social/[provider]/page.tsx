import { ContinueIntegration } from '@gitroom/frontend/components/launches/continue.integration';
import { cookies } from 'next/headers';
import { getJarvisConnectReturnUrl } from '@gitroom/helpers/utils/jarvis.connect.return';
import { getInstagramCallbackApiBase } from '@gitroom/helpers/utils/instagram.callback';

export const dynamic = 'force-dynamic';

export default async function Page(
  props: {
    params: Promise<{
      provider: string;
    }>;
    searchParams: Promise<any>;
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;

  const {
    provider
  } = params;

  const get = (await cookies()).get('auth');
  return <ContinueIntegration searchParams={searchParams} provider={provider} logged={!!get?.name}
    jarvisReturnUrl={getJarvisConnectReturnUrl(process.env.JARVIS_CONNECT_RETURN_URL)}
    callbackApiBase={getInstagramCallbackApiBase(provider, process.env.INSTAGRAM_CALLBACK_URL)} />;
}
