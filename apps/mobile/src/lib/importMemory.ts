import AsyncStorage from '@react-native-async-storage/async-storage';
import type { RowAction } from '@my-finance/core';

/** Las elecciones por tipo de operación se recuerdan por formato de archivo (sus encabezados). */
function keyFor(headers: readonly string[]): string {
  return `my-finance:import-actions:${headers.map((h) => h.trim().toLowerCase()).join('|')}`;
}

export async function loadImportActions(headers: readonly string[]): Promise<Record<string, RowAction>> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(headers));
    return raw ? (JSON.parse(raw) as Record<string, RowAction>) : {};
  } catch {
    return {};
  }
}

export async function saveImportActions(headers: readonly string[], actions: Record<string, RowAction>): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(headers), JSON.stringify(actions));
  } catch {
    // Es una comodidad: si no se puede guardar, la próxima vez se vuelve a sugerir.
  }
}
