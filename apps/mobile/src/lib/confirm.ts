import { parseNumber } from '@my-finance/core';
import { Alert, Platform } from 'react-native';

/** Confirmación de acción destructiva, compatible con web. */
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  cancelLabel: string,
  onConfirm: () => void,
) {
  if (Platform.OS === 'web') {
    if (globalThis.confirm?.(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: cancelLabel, style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}

/**
 * Interpreta números escritos con coma o punto decimal ("1.234,56", "1234.5").
 * Vacío → undefined; texto inválido → NaN.
 */
export function parseInput(value: string): number | undefined {
  const s = value.trim();
  if (s === '') return undefined;
  if (!/^[-+]?[\d.,\s]+$/.test(s)) return NaN;
  return parseNumber(s);
}
