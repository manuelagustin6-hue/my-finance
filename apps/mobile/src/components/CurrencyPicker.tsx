import { ALL_CURRENCY_CODES, currencyName, MAIN_CURRENCIES } from '@my-finance/core';
import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FlatList, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { i18nLanguage } from '@/lib/language';
import { radius, spacing, useTheme } from '@/theme';
import { Divider, Text } from './ui';

/** Monedas cripto estables que también se usan como moneda de cotización. */
const EXTRA = ['USDT', 'USDC'];

export function useCurrencyLabel() {
  return (code: string) => `${code} · ${currencyName(code, i18nLanguage())}`;
}

/** Campo que abre un selector con buscador de todas las monedas. */
export function CurrencyField({
  label,
  value,
  onChange,
  includeStablecoins,
}: {
  label: string;
  value: string;
  onChange: (code: string) => void;
  includeStablecoins?: boolean;
}) {
  const c = useTheme();
  const nameOf = useCurrencyLabel();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="label" muted>
        {label}
      </Text>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        style={{
          borderWidth: 1,
          borderColor: c.border,
          backgroundColor: c.card,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text>{nameOf(value)}</Text>
        <Ionicons name="chevron-down" size={18} color={c.muted} />
      </Pressable>
      <CurrencyPickerModal
        visible={open}
        selected={value}
        includeStablecoins={includeStablecoins}
        onClose={() => setOpen(false)}
        onSelect={(code) => {
          onChange(code);
          setOpen(false);
        }}
      />
    </View>
  );
}

export function CurrencyPickerModal({
  visible,
  selected,
  onSelect,
  onClose,
  includeStablecoins,
}: {
  visible: boolean;
  selected?: string;
  onSelect: (code: string) => void;
  onClose: () => void;
  includeStablecoins?: boolean;
}) {
  const { t } = useTranslation();
  const c = useTheme();
  const nameOf = useCurrencyLabel();
  const [query, setQuery] = useState('');

  const items = useMemo(() => {
    const codes = [...(includeStablecoins ? EXTRA : []), ...ALL_CURRENCY_CODES];
    const q = query.trim().toLowerCase();
    if (!q) return codes;
    return codes.filter((code) => nameOf(code).toLowerCase().includes(q));
  }, [query, includeStablecoins, nameOf]);

  const mainCount = MAIN_CURRENCIES.length + (includeStablecoins ? EXTRA.length : 0);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: c.background }}>
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text variant="heading">{t('fx.chooseCurrency')}</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')}>
              <Ionicons name="close" size={24} color={c.text} />
            </Pressable>
          </View>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('fx.searchCurrency')}
            placeholderTextColor={c.muted}
            autoCorrect={false}
            style={{
              borderWidth: 1,
              borderColor: c.border,
              backgroundColor: c.card,
              color: c.text,
              borderRadius: radius.md,
              paddingHorizontal: spacing.md,
              paddingVertical: 12,
              fontSize: 16,
            }}
          />
        </View>
        <FlatList
          data={items}
          keyExtractor={(code) => code}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}
          ItemSeparatorComponent={Divider}
          renderItem={({ item, index }) => (
            <>
              {!query && index === mainCount ? (
                <Text variant="label" muted style={{ paddingVertical: spacing.sm }}>
                  {t('fx.otherCurrencies')}
                </Text>
              ) : null}
              <Pressable
                onPress={() => onSelect(item)}
                accessibilityRole="button"
                style={{ paddingVertical: spacing.md, flexDirection: 'row', justifyContent: 'space-between' }}
              >
                <Text style={{ fontWeight: item === selected ? '700' : '400' }}>{nameOf(item)}</Text>
                {item === selected ? <Ionicons name="checkmark" size={20} color={c.primary} /> : null}
              </Pressable>
            </>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

/** Botones para alternar la moneda en la que se ve la cartera. */
export function CurrencyToggle({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string | undefined;
  onChange: (code: string) => void;
}) {
  const c = useTheme();
  if (options.length < 2) return null;
  return (
    <View style={{ flexDirection: 'row', backgroundColor: c.cardAlt, borderRadius: 999, padding: 3, alignSelf: 'flex-start' }}>
      {options.map((code) => {
        const active = code === value;
        return (
          <Pressable
            key={code}
            onPress={() => onChange(code)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 6,
              borderRadius: 999,
              backgroundColor: active ? c.card : 'transparent',
            }}
          >
            <Text variant="label" color={active ? c.text : c.muted}>
              {code}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
