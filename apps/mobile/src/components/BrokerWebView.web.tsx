import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Notice } from '@/components/ui';
import type { BrokerWebViewProps } from './BrokerWebView';

export type { BrokerNavState, BrokerWebViewHandle, BrokerWebViewProps } from './BrokerWebView';

/** En la web no hay navegador interno: la página se abre en otra pestaña. */
export function BrokerWebView({ url }: BrokerWebViewProps) {
  const { t } = useTranslation();
  useEffect(() => {
    window.open(url, '_blank', 'noopener');
  }, [url]);
  return <Notice text={t('brokerWeb.webOnly')} />;
}
