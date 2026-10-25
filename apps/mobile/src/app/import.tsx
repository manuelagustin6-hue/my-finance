import {
  canAddAsset,
  canImport,
  GENERIC_TEMPLATE_EXAMPLE,
  IMPORT_TEMPLATES,
  importCsv,
  transactionFingerprint,
  type Asset,
  type AssetSearchResult,
  type ImportResult,
  type ImportedRow,
  type TemplateId,
} from '@my-finance/core';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { Button, Card, Chips, Divider, Notice, Screen, Section, Text } from '@/components/ui';
import { isPlanLimitError, market, repository, type NewTransaction } from '@/data';
import { useImports, useInvalidateUserData, usePortfolio } from '@/hooks/queries';
import { shareTextFile } from '@/lib/exporter';
import { usePlan } from '@/state/app';
import { spacing, useTheme } from '@/theme';

type AssetResolution =
  | { kind: 'owned'; asset: Asset }
  | { kind: 'catalog'; result: AssetSearchResult }
  | { kind: 'custom'; symbol: string; type: Asset['type']; currency: string };

interface Analysis {
  fileName: string;
  result: ImportResult;
  resolutions: Map<string, AssetResolution>;
  fresh: ImportedRow[];
  duplicates: number;
}

const AUTO = 'auto';
const keyOf = (row: Pick<ImportedRow, 'symbol' | 'assetType'>) => `${row.symbol}|${row.assetType ?? ''}`;

async function readFile(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web') return (await fetch(asset.uri)).text();
  return new File(asset.uri).text();
}

export default function ImportScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const plan = usePlan();
  const p = usePortfolio();
  const imports = useImports();
  const invalidate = useInvalidateUserData();
  const [walletId, setWalletId] = useState<string | undefined>();
  const [templateId, setTemplateId] = useState<string>(AUTO);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: 'info' | 'warning' } | null>(null);

  const wallet = p.wallets.find((w) => w.id === (walletId ?? p.wallets[0]?.id));

  /** Vincula cada símbolo con un activo propio, uno del catálogo o uno personalizado nuevo. */
  async function resolveAssets(rows: ImportedRow[]): Promise<Map<string, AssetResolution>> {
    const map = new Map<string, AssetResolution>();
    for (const row of rows) {
      const key = keyOf(row);
      if (map.has(key)) continue;
      const owned = p.assets.find((a) => a.symbol.toUpperCase() === row.symbol && (!row.assetType || a.type === row.assetType));
      if (owned) {
        map.set(key, { kind: 'owned', asset: owned });
        continue;
      }
      const results = await market.search(row.symbol).catch(() => [] as AssetSearchResult[]);
      const match = results.find((r) => r.symbol.toUpperCase() === row.symbol && (!row.assetType || r.type === row.assetType));
      map.set(
        key,
        match
          ? { kind: 'catalog', result: match }
          : { kind: 'custom', symbol: row.symbol, type: row.assetType ?? 'other', currency: row.currency },
      );
    }
    return map;
  }

  const pickFile = async () => {
    setMessage(null);
    const picked = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'],
      copyToCacheDirectory: true,
    });
    if (picked.canceled || !picked.assets[0]) return;
    setBusy(true);
    try {
      const text = await readFile(picked.assets[0]);
      const result = importCsv(text, templateId === AUTO ? undefined : (templateId as TemplateId));
      const resolutions = await resolveAssets(result.rows);

      // Duplicados: operaciones que ya existen en la billetera elegida.
      const existing = new Set(
        p.transactions
          .filter((tx) => tx.walletId === wallet?.id)
          .map((tx) => transactionFingerprint({ ...tx, assetId: tx.assetId })),
      );
      const fresh: ImportedRow[] = [];
      let duplicates = 0;
      const seen = new Set<string>();
      for (const row of result.rows) {
        const res = resolutions.get(keyOf(row));
        const assetId = res?.kind === 'owned' ? res.asset.id : undefined;
        const fp = transactionFingerprint({ ...row, assetId: assetId ?? row.symbol });
        if ((assetId && existing.has(transactionFingerprint({ ...row, assetId }))) || seen.has(fp)) {
          duplicates += 1;
          continue;
        }
        seen.add(fp);
        fresh.push(row);
      }
      setAnalysis({ fileName: picked.assets[0].name, result, resolutions, fresh, duplicates });
    } catch {
      setMessage({ text: t('importer.readError'), tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  const confirmImport = async () => {
    if (!analysis || !wallet) return;
    if (!canImport(plan, imports.data?.length ?? 0).allowed) {
      router.replace('/paywall?reason=imports');
      return;
    }
    // Límite de activos del plan Gratis: se verifica antes de escribir nada.
    const held = new Set(p.transactions.map((tx) => tx.assetId));
    const newKeys = new Set(analysis.fresh.map(keyOf).filter((k) => analysis.resolutions.get(k)?.kind !== 'owned'));
    for (let i = 0; i < newKeys.size; i++) {
      if (!canAddAsset(plan, held, `__new_${i}`).allowed) {
        router.replace('/paywall?reason=assets');
        return;
      }
      held.add(`__new_${i}`);
    }

    setBusy(true);
    setMessage(null);
    try {
      const job = await repository.createImport({
        walletId: wallet.id,
        template: analysis.result.templateId,
        fileName: analysis.fileName,
        rowsTotal: analysis.result.rows.length + analysis.result.errors.length,
        rowsImported: 0,
        rowsSkipped: analysis.duplicates + analysis.result.errors.length,
      });

      const assetIds = new Map<string, string>();
      for (const [key, res] of analysis.resolutions) {
        if (!analysis.fresh.some((r) => keyOf(r) === key)) continue;
        const asset =
          res.kind === 'owned'
            ? res.asset
            : res.kind === 'catalog'
              ? await repository.ensureAsset(res.result)
              : await repository.createCustomAsset({ symbol: res.symbol, name: res.symbol, type: res.type, currency: res.currency });
        assetIds.set(key, asset.id);
      }

      const transactions: NewTransaction[] = analysis.fresh.map((row) => ({
        walletId: wallet.id,
        assetId: assetIds.get(keyOf(row))!,
        type: row.type,
        quantity: row.quantity,
        price: row.price,
        amount: row.amount,
        fee: row.fee,
        currency: row.currency,
        date: row.date,
        note: row.note,
        source: 'csv',
        externalId: row.externalId,
      }));
      await repository.saveTransactions(transactions, job.id);
      await repository.updateImport(job.id, { rowsImported: transactions.length });
      await invalidate();
      setAnalysis(null);
      setMessage({ text: t('importer.success', { count: transactions.length }), tone: 'info' });
    } catch (error) {
      if (isPlanLimitError(error)) router.replace(`/paywall?reason=${error.reason}`);
      else setMessage({ text: t('common.error'), tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  const customSymbols = analysis
    ? [...analysis.resolutions.values()].filter((r): r is Extract<AssetResolution, { kind: 'custom' }> => r.kind === 'custom').map((r) => r.symbol)
    : [];
  const issues = analysis ? [...analysis.result.errors.map((e) => ({ ...e, error: true })), ...analysis.result.warnings.map((w) => ({ ...w, error: false }))] : [];

  if (p.wallets.length === 0) {
    return (
      <Screen>
        <Notice text={t('tx.needWallet')} />
        <Button title={t('home.createWallet')} onPress={() => router.replace('/wallet/new')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Text muted>{t('importer.intro')}</Text>
      <Chips
        label={t('importer.wallet')}
        options={p.wallets.map((w) => ({ value: w.id, label: w.name }))}
        value={wallet?.id}
        onChange={(id) => {
          setWalletId(id);
          setAnalysis(null);
        }}
      />
      <Chips
        label={t('importer.format')}
        options={[{ value: AUTO, label: t('importer.autodetect') }, ...IMPORT_TEMPLATES.map((x) => ({ value: x.id, label: x.name }))]}
        value={templateId}
        onChange={(id) => {
          setTemplateId(id);
          setAnalysis(null);
        }}
      />
      <Button title={t('importer.chooseFile')} icon="document-attach-outline" onPress={pickFile} loading={busy && !analysis} />
      <Button
        title={t('importer.shareTemplate')}
        variant="ghost"
        small
        onPress={() => void shareTextFile('plantilla-my-finance.csv', GENERIC_TEMPLATE_EXAMPLE, 'text/csv')}
      />

      {message ? <Notice text={message.text} tone={message.tone} /> : null}

      {analysis ? (
        <Section title={t('importer.preview')}>
          <Card style={{ gap: spacing.sm }}>
            <Text style={{ fontWeight: '600' }}>{analysis.fileName}</Text>
            <Text>{t('importer.rows', { count: analysis.fresh.length })}</Text>
            {analysis.duplicates > 0 ? <Text muted>{t('importer.duplicates', { count: analysis.duplicates })}</Text> : null}
            {customSymbols.length > 0 ? (
              <Text variant="caption" color={c.warning}>
                {t('importer.unknownSymbols', { symbols: customSymbols.join(', ') })}
              </Text>
            ) : null}
            {issues.length > 0 ? (
              <>
                <Divider />
                {issues.slice(0, 30).map((issue, i) => (
                  <View key={i}>
                    <Text variant="caption" color={issue.error ? c.negative : c.warning}>
                      {t('importer.line', { line: issue.line })}: {issue.message}
                    </Text>
                  </View>
                ))}
              </>
            ) : null}
          </Card>
          <Button title={t('importer.confirm')} onPress={confirmImport} loading={busy} disabled={analysis.fresh.length === 0} />
        </Section>
      ) : null}

      <Section title={t('importer.supported')}>
        <Card style={{ gap: spacing.sm }}>
          {IMPORT_TEMPLATES.map((x) => (
            <View key={x.id} style={{ gap: 2 }}>
              <Text style={{ fontWeight: '600' }}>{x.name}</Text>
              <Text variant="caption" muted>
                {x.description}
              </Text>
            </View>
          ))}
        </Card>
      </Section>
    </Screen>
  );
}
