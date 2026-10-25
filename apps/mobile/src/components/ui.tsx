import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text as RNText,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { radius, spacing, useTheme } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export function Screen({
  children,
  scroll = true,
  refreshing,
  onRefresh,
}: {
  children: ReactNode;
  scroll?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const c = useTheme();
  if (!scroll) return <View style={[styles.screen, { backgroundColor: c.background }]}>{children}</View>;
  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.muted} /> : undefined
      }
    >
      {children}
    </ScrollView>
  );
}

type TextVariant = 'title' | 'heading' | 'body' | 'label' | 'caption' | 'number';

export function Text({
  children,
  variant = 'body',
  muted,
  color,
  style,
  numberOfLines,
  align,
}: {
  children: ReactNode;
  variant?: TextVariant;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  align?: 'left' | 'center' | 'right';
}) {
  const c = useTheme();
  return (
    <RNText
      numberOfLines={numberOfLines}
      style={[textStyles[variant], { color: color ?? (muted ? c.muted : c.text), textAlign: align }, style]}
    >
      {children}
    </RNText>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const c = useTheme();
  const content = <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })} accessibilityRole="button">
      {content}
    </Pressable>
  );
}

export function Row({ children, style, gap = spacing.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="heading">{title}</Text>
        {action}
      </Row>
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  small,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'pro';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  small?: boolean;
}) {
  const c = useTheme();
  const bg = { primary: c.primary, secondary: c.cardAlt, danger: c.negative, ghost: 'transparent', pro: c.pro }[variant];
  const fg = { primary: c.primaryText, secondary: c.text, danger: '#FFFFFF', ghost: c.primary, pro: '#FFFFFF' }[variant];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <Row gap={spacing.xs} style={{ justifyContent: 'center' }}>
          {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
          <RNText style={[styles.buttonText, small && { fontSize: 14 }, { color: fg }]}>{title}</RNText>
        </Row>
      )}
    </Pressable>
  );
}

export function Field({
  label,
  error,
  help,
  ...input
}: TextInputProps & { label: string; error?: string; help?: string }) {
  const c = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="label" muted>
        {label}
      </Text>
      <TextInput
        placeholderTextColor={c.muted}
        {...input}
        style={[
          styles.input,
          { backgroundColor: c.card, color: c.text, borderColor: error ? c.negative : c.border },
          input.style,
        ]}
      />
      {error ? (
        <Text variant="caption" color={c.negative}>
          {error}
        </Text>
      ) : help ? (
        <Text variant="caption" muted>
          {help}
        </Text>
      ) : null}
    </View>
  );
}

/** Selector de opciones en chips con desplazamiento horizontal. */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T | undefined;
  onChange: (value: T) => void;
  label?: string;
}) {
  const c = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <Text variant="label" muted>
          {label}
        </Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.xs }}>
        {options.map((o) => {
          const active = o.value === value;
          return (
            <Pressable
              key={o.value}
              onPress={() => onChange(o.value)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[
                styles.chip,
                { backgroundColor: active ? c.primary : c.card, borderColor: active ? c.primary : c.border },
              ]}
            >
              <RNText style={{ color: active ? c.primaryText : c.text, fontWeight: '600', fontSize: 14 }}>{o.label}</RNText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

export function ListItem({
  title,
  subtitle,
  right,
  rightSub,
  rightSubColor,
  onPress,
  icon,
  leading,
}: {
  title: string;
  subtitle?: string;
  right?: string;
  rightSub?: string;
  rightSubColor?: string;
  onPress?: () => void;
  icon?: IconName;
  leading?: ReactNode;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.listItem, { opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole={onPress ? 'button' : undefined}
    >
      {leading}
      {icon ? <Ionicons name={icon} size={20} color={c.muted} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: '600' }} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" muted numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right !== undefined || rightSub !== undefined ? (
        <View style={{ alignItems: 'flex-end', gap: 2 }}>
          {right !== undefined ? <Text style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>{right}</Text> : null}
          {rightSub !== undefined ? (
            <Text variant="caption" color={rightSubColor} muted={!rightSubColor} style={{ fontVariant: ['tabular-nums'] }}>
              {rightSub}
            </Text>
          ) : null}
        </View>
      ) : null}
      {onPress && right === undefined ? <Ionicons name="chevron-forward" size={18} color={c.muted} /> : null}
    </Pressable>
  );
}

export function Divider() {
  const c = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

/** Metadato etiqueta/valor en una grilla de dos columnas. */
export function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, gap: 2 }}>
      <Text variant="caption" muted>
        {label}
      </Text>
      <Text style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }} color={color}>
        {value}
      </Text>
    </View>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing.md, columnGap: spacing.md }}>{children}</View>;
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warning' }) {
  const c = useTheme();
  const color = tone === 'warning' ? c.warning : c.muted;
  return (
    <Row style={[styles.notice, { borderColor: c.border, backgroundColor: c.cardAlt }]} gap={spacing.sm}>
      <Ionicons name={tone === 'warning' ? 'warning-outline' : 'information-circle-outline'} size={18} color={color} />
      <Text variant="caption" color={color} style={{ flex: 1 }}>
        {text}
      </Text>
    </Row>
  );
}

export function EmptyState({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl }}>
      <Text variant="heading" align="center">
        {title}
      </Text>
      {body ? (
        <Text muted align="center">
          {body}
        </Text>
      ) : null}
      {children}
    </Card>
  );
}

export function ProBadge() {
  const c = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: c.pro }]}>
      <RNText style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>PRO</RNText>
    </View>
  );
}

/** Bloque que reemplaza contenido Pro cuando el usuario está en el plan Gratis. */
export function ProGate({ reason, description }: { reason: string; description: string }) {
  const { t } = useTranslation();
  return (
    <Card style={{ gap: spacing.md }}>
      <Row>
        <ProBadge />
        <Text variant="heading">{t('proGate.title')}</Text>
      </Row>
      <Text muted>{description}</Text>
      <Button
        title={t('proGate.cta')}
        variant="pro"
        onPress={() => router.push({ pathname: '/paywall', params: { reason } })}
      />
    </Card>
  );
}

export function Loading() {
  const c = useTheme();
  return (
    <View style={{ padding: spacing.xl, alignItems: 'center' }}>
      <ActivityIndicator color={c.muted} />
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <Card style={{ gap: spacing.md, alignItems: 'center' }}>
      <Text muted align="center">
        {t('common.error')}
      </Text>
      {onRetry ? <Button title={t('common.retry')} variant="secondary" small onPress={onRetry} /> : null}
    </Card>
  );
}

const textStyles = StyleSheet.create({
  title: { fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16 },
  label: { fontSize: 14, fontWeight: '600' },
  caption: { fontSize: 13 },
  number: { fontSize: 16, fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
  screen: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xl * 2, flexGrow: 1 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: spacing.lg, gap: spacing.sm },
  button: { borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: spacing.lg, alignItems: 'center', minHeight: 48 },
  buttonSmall: { paddingVertical: 8, minHeight: 36, paddingHorizontal: spacing.md },
  buttonText: { fontSize: 16, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 16 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  notice: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.md, padding: spacing.md, alignItems: 'flex-start' },
  badge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
});
