import { useImperativeHandle, useRef, type Ref } from 'react';
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { CAPTURE_SCRIPT, INLINE_FILE_SCRIPT, parseCaptureMessage, type CaptureMessage } from '@/import/captureScript';

export interface BrokerWebViewHandle {
  goBack(): void;
  goForward(): void;
  reload(): void;
}

export interface BrokerNavState {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
  loading: boolean;
}

export interface BrokerWebViewProps {
  url: string;
  ref?: Ref<BrokerWebViewHandle>;
  onMessage(message: CaptureMessage): void;
  onNavigation(state: BrokerNavState): void;
  onLoadError(): void;
}

/**
 * Navegador para iniciar sesión en la web del broker. Sesión en modo incógnito (se borra al cerrar)
 * y solo páginas https; las descargas de archivos se capturan y se envían a la app.
 */
export function BrokerWebView({ url, ref, onMessage, onNavigation, onLoadError }: BrokerWebViewProps) {
  const web = useRef<WebView<object>>(null);

  useImperativeHandle(ref, () => ({
    goBack: () => web.current?.goBack(),
    goForward: () => web.current?.goForward(),
    reload: () => web.current?.reload(),
  }));

  return (
    <WebView
      ref={web}
      source={{ uri: url }}
      incognito
      originWhitelist={['https://*', 'about:*']}
      injectedJavaScriptBeforeContentLoaded={CAPTURE_SCRIPT}
      injectedJavaScriptBeforeContentLoadedForMainFrameOnly={false}
      injectedJavaScript={INLINE_FILE_SCRIPT}
      injectedJavaScriptForMainFrameOnly
      onMessage={(event) => {
        const message = parseCaptureMessage(event.nativeEvent.data);
        if (message) onMessage(message);
      }}
      // iOS: el servidor respondió con un archivo; se vuelve a pedir desde la página, con la sesión.
      onFileDownload={({ nativeEvent }) => {
        if (!/^https:/i.test(nativeEvent.downloadUrl)) return;
        web.current?.injectJavaScript(`window.__mfFetchDownload && window.__mfFetchDownload(${JSON.stringify(nativeEvent.downloadUrl)}); true;`);
      }}
      onShouldStartLoadWithRequest={(request) => {
        if (/^(https|about|blob|data):/i.test(request.url)) return true;
        // Enlaces de correo o teléfono se abren afuera; el resto (http sin cifrar, esquemas raros) se bloquea.
        if (/^(mailto|tel):/i.test(request.url)) void Linking.openURL(request.url).catch(() => undefined);
        return false;
      }}
      onNavigationStateChange={(nav) =>
        onNavigation({ url: nav.url, canGoBack: nav.canGoBack, canGoForward: nav.canGoForward, loading: nav.loading })
      }
      onError={onLoadError}
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically
      allowsBackForwardNavigationGestures
      startInLoadingState
      allowFileAccess={false}
      mixedContentMode="never"
      style={{ flex: 1 }}
      containerStyle={{ flex: 1 }}
    />
  );
}
