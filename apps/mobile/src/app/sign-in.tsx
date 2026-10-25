import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';
import { Button, Field, Notice, Screen, Text } from '@/components/ui';
import { getSupabase } from '@/lib/supabase';
import { spacing } from '@/theme';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'warning' } | null>(null);

  async function submit() {
    const cleanEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(cleanEmail) || password.length < 8) {
      setMessage({ text: t('auth.invalid'), tone: 'warning' });
      return;
    }
    setLoading(true);
    setMessage(null);
    const auth = getSupabase().auth;
    const { data, error } =
      mode === 'signIn'
        ? await auth.signInWithPassword({ email: cleanEmail, password })
        : await auth.signUp({ email: cleanEmail, password });
    setLoading(false);
    if (error) {
      setMessage({ text: error.message, tone: 'warning' });
    } else if (mode === 'signUp' && !data.session) {
      setMessage({ text: t('auth.checkEmail'), tone: 'info' });
    }
  }

  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg, paddingTop: spacing.xl * 2 }}>
        <View style={{ gap: spacing.sm }}>
          <Text variant="title">{t('auth.title')}</Text>
          <Text muted>{t('auth.subtitle')}</Text>
        </View>
        <Field
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
        />
        <Field
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
          textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
          onSubmitEditing={submit}
        />
        {message ? <Notice text={message.text} tone={message.tone} /> : null}
        <Button title={mode === 'signIn' ? t('auth.signIn') : t('auth.signUp')} onPress={submit} loading={loading} />
        <Button
          title={mode === 'signIn' ? t('auth.toSignUp') : t('auth.toSignIn')}
          variant="ghost"
          onPress={() => {
            setMode(mode === 'signIn' ? 'signUp' : 'signIn');
            setMessage(null);
          }}
        />
      </View>
    </Screen>
  );
}
