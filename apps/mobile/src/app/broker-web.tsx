import { Ionicons } from '@expo/vector-icons';
import { normalizeWebUrl, urlHost } from '@my-finance/core';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrokerWebView, type BrokerNavState, type BrokerWebViewHandle } from '@/components/BrokerWebView';
import { Button, Field, Notice, Row, Screen, Text } from '@/components/ui';
import type { CaptureMessage } from '@/import/captureScript';
import { base64ToBytes } from '@/import/readSheet';
import { usePendingImport } from '@/state/pendingImport';
import { radius, spacing, useTheme } from '@/theme';

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'error'; text: string };

function fileNameFor(name: string, mime: string): string {
  if (name) return name;
  if (/sheet|excel/i.test(mime)) return 'movimientos.xlsx';
  return 'movimientos.csv';
}

/** Web del broker dentro de la app: el usuario inicia sesión y exporta; la app toma el archivo. */
export default function BrokerWebScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ url?: string; name?: string; walletId?: string; next?: string }>();
  const setPending = usePendingImport((s) => s.set);
  const web = useRef<BrokerWebViewHandle>(null);

  const initial = params.url ? normalizeWebUrl(params.url) : undefined;
  const [url, setUrl] = useState(initial);
  const [address, setAddress] = useState('');
  const [addressError, setAddressError] = useState<string | undefined>();
  const [nav, setNav] = useState<BrokerNavState | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [showGuide, setShowGuide] = useState(true);
  const name = params.name || t('brokerWeb.genericName');

  const onMessage = (message: CaptureMessage) => {
    if (message.type === 'mf-busy') {
      setStatus({ kind: 'busy' });
      return;
    }
    if (message.type === 'mf-error') {
      setStatus({ kind: 'error', text: message.code === 'too_large' ? t('brokerWeb.tooLarge') : t('brokerWeb.failed') });
      return;
    }
    try {
      const bytes = 'data' in message ? base64ToBytes(message.data) : new TextEncoder().encode(message.text);
      setPending({ name: fileNameFor(message.name, message.mime), bytes, walletId: params.walletId });
      // Desde la billetera se pasa directo al importador; desde el importador se vuelve a él.
      if (params.next === 'import') router.replace({ pathname: '/import', params: { walletId: params.walletId ?? '' } });
      else router.back();
    } catch {
      setStatus({ kind: 'error', text: t('brokerWeb.failed') });
    }
  };

  if (!url) {
    const open = () => {
      const normalized = normalizeWebUrl(address);
      if (!normalized) setAddressError(t('brokerWeb.invalidAddress'));
      else setUrl(normalized);
    };
    return (
      <Screen>
        <Stack.Screen options={{ title: t('brokerWeb.title') }} />
        <Field
          label={t('brokerWeb.addressLabel')}
          placeholder={t('brokerWeb.addressPlaceholder')}
          value={address}
          onChangeText={(text) => {
            setAddress(text);
            setAddressError(undefined);
          }}
          error={addressError}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          onSubmitEditing={open}
        />
        <Button title={t('brokerWeb.open')} icon="globe-outline" onPress={open} />
        <Notice text={t('brokerWeb.privacy', { name })} />
      </Screen>
    );
  }

  const host = urlHost(nav?.url ?? url);
  const secure = /^https:/i.test(nav?.url ?? url);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <Row gap={spacing.xs} style={{ maxWidth: 240 }}>
              <Ionicons name={secure ? 'lock-closed' : 'warning-outline'} size={14} color={secure ? c.positive : c.warning} />
              <Text style={{ fontWeight: '600' }} numberOfLines={1}>
                {host}
              </Text>
            </Row>
          ),
          headerLeft: () => (
            <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel={t('brokerWeb.close')} hitSlop={12}>
              <Ionicons name="close" size={24} color={c.text} />
            </Pressable>
          ),
        }}
      />

      {showGuide ? (
        <Pressable
          onPress={() => setShowGuide(false)}
          style={{ padding: spacing.md, gap: spacing.xs, backgroundColor: c.card, borderBottomWidth: 1, borderColor: c.border }}
        >
          <Row style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text variant="caption" style={{ flex: 1 }}>
              {t('brokerWeb.privacy', { name })}
            </Text>
            <Ionicons name="close-circle-outline" size={18} color={c.muted} />
          </Row>
          <Text variant="caption" muted>
            {t('brokerWeb.guide')}
          </Text>
          {Platform.OS === 'android' ? (
            <Text variant="caption" muted>
              {t('brokerWeb.androidHint')}
            </Text>
          ) : null}
        </Pressable>
      ) : null}

      <BrokerWebView
        ref={web}
        url={url}
        onMessage={onMessage}
        onNavigation={setNav}
        onLoadError={() => setStatus({ kind: 'error', text: t('brokerWeb.loadError') })}
      />

      {status.kind !== 'idle' ? (
        <Pressable
          onPress={() => setStatus({ kind: 'idle' })}
          style={{
            position: 'absolute',
            left: spacing.lg,
            right: spacing.lg,
            bottom: insets.bottom + 64,
            padding: spacing.md,
            borderRadius: radius.md,
            backgroundColor: c.card,
            borderWidth: 1,
            borderColor: status.kind === 'error' ? c.warning : c.border,
          }}
        >
          <Row>
            {status.kind === 'busy' ? <ActivityIndicator color={c.primary} /> : <Ionicons name="alert-circle-outline" size={18} color={c.warning} />}
            <Text style={{ flex: 1 }}>{status.kind === 'busy' ? t('brokerWeb.capturing') : status.text}</Text>
          </Row>
        </Pressable>
      ) : null}

      {Platform.OS !== 'web' ? (
        <Row
          style={{
            justifyContent: 'space-around',
            paddingTop: spacing.sm,
            paddingBottom: insets.bottom + spacing.sm,
            borderTopWidth: 1,
            borderColor: c.border,
            backgroundColor: c.card,
          }}
        >
          <ToolbarButton icon="chevron-back" label={t('brokerWeb.back')} disabled={!nav?.canGoBack} onPress={() => web.current?.goBack()} />
          <ToolbarButton icon="chevron-forward" label={t('brokerWeb.forward')} disabled={!nav?.canGoForward} onPress={() => web.current?.goForward()} />
          <ToolbarButton icon="refresh" label={t('brokerWeb.reload')} onPress={() => web.current?.reload()} />
          <ToolbarButton icon="close" label={t('brokerWeb.close')} onPress={() => router.back()} />
        </Row>
      ) : null}
    </View>
  );
}

function ToolbarButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: 'chevron-back' | 'chevron-forward' | 'refresh' | 'close';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={{ padding: spacing.sm, opacity: disabled ? 0.35 : 1 }}
    >
      <Ionicons name={icon} size={22} color={c.text} />
    </Pressable>
  );
}
