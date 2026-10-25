import type { ExportBundle } from '@/data';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

function csvCell(value: unknown): string {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Operaciones en el formato de la plantilla de la app (se pueden volver a importar). */
export function transactionsToCsv(bundle: ExportBundle): string {
  const assets = new Map(bundle.assets.map((a) => [a.id, a]));
  const wallets = new Map(bundle.wallets.map((w) => [w.id, w]));
  const header = ['date', 'type', 'symbol', 'asset_type', 'quantity', 'price', 'fee', 'currency', 'amount', 'note', 'wallet'];
  const rows = bundle.transactions.map((t) => {
    const a = assets.get(t.assetId);
    return [t.date, t.type, a?.symbol, a?.type, t.quantity, t.price, t.fee, t.currency, t.amount, t.note, wallets.get(t.walletId)?.name]
      .map(csvCell)
      .join(',');
  });
  return [header.join(','), ...rows].join('\n');
}

/** Guarda un archivo temporal y abre el menú para compartirlo o guardarlo. */
export async function shareTextFile(fileName: string, content: string, mimeType: string): Promise<void> {
  if (Platform.OS === 'web') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  await file.write(content);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle: fileName });
}
