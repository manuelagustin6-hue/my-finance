import {
  canAddAsset,
  canImport,
  GENERIC_TEMPLATE_EXAMPLE,
  importCsv,
  isBeforeOpening,
  isSmartResult,
  missingHoldings,
  parseCsv,
  detectSmartMapping,
  transactionFingerprint,
  type Asset,
  type AssetSearchResult,
  type ColumnRole,
  type ImportedRow,
  type ImportResult,
  type RowAction,
  type SmartImportResult,
} from '@my-finance/core';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, View } from 'react-native';
import { Button, Card, Chips, Divider, Field, Notice, Row, Screen, Section, Text } from '@/components/ui';
import { isPlanLimitError, market, repository, type NewTransaction } from '@/data';
import { useImports, useInvalidateUserData, usePortfolio } from '@/hooks/queries';
import { useFormat } from '@/hooks/useFormat';
import { shareTextFile } from '@/lib/exporter';
import { loadImportActions, saveImportActions } from '@/lib/importMemory';
import { usePlan } from '@/state/app';
import { spacing, useTheme } from '@/theme';

type AssetResolution =
  | { kind: 'owned'; asset: Asset }
  | { kind: 'catalog'; result: AssetSearchResult }
  | { kind: 'custom'; symbol: string; name: string; type: Asset['type']; currency: string };

interface Analysis {
  fileName: string;
  text: string;
  result: ImportResult | SmartImportResult;
  actions: Record<string, RowAction>;
  resolutions: Map<string, AssetResolution>;
  fresh: ImportedRow[];
  duplicates: number;
  /** Filas anteriores al saldo inicial de la billetera (no se importan). */
  skippedBefore: number;
  /** Activos vendidos por más de lo que había (falta la tenencia inicial). */
  missing: [string, number][];
}

const ACTIONS: RowAction[] = ['buy', 'sell', 'dividend', 'interest', 'fee', 'deposit', 'withdraw', 'transfer_in', 'split', 'ignore'];
const ROLES: ColumnRole[] = ['date', 'type', 'symbol', 'instrument', 'quantity', 'price', 'gross', 'fee', 'currency', 'total'];
const keyOf = (row: Pick<ImportedRow, 'symbol' | 'assetType'>) => `${row.symbol}|${row.assetType ?? ''}`;

async function readFile(asset: DocumentPicker.DocumentPickerAsset): Promise<string> {
  if (Platform.OS === 'web') return (await fetch(asset.uri)).text();
  return new File(asset.uri).text();
}

export default function ImportScreen() {
  const { t } = useTranslation();
  const c = useTheme();
  const f = useFormat();
  const plan = usePlan();
  const p = usePortfolio();
  const imports = useImports();
  const invalidate = useInvalidateUserData();
  const [walletId, setWalletId] = useState<string | undefined>();
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [pasted, setPasted] = useState('');
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
          : { kind: 'custom', symbol: row.symbol, name: row.name ?? row.symbol, type: row.assetType ?? 'other', currency: row.currency },
      );
    }
    return map;
  }

  /** Interpreta el archivo con las acciones elegidas y prepara la vista previa. */
  async function analyze(text: string, fileName: string, chosen?: Record<string, RowAction>) {
    let actions = chosen;
    if (!actions) {
      const mapping = detectSmartMapping(parseCsv(text));
      actions = mapping ? await loadImportActions(mapping.headers) : {};
    }
    const result = importCsv(text, undefined, { actions, defaultCurrency: wallet?.currency });
    const resolutions = await resolveAssets(result.rows);

    // Duplicados: operaciones que ya existen en la billetera elegida.
    const walletTxs = p.effective.filter((tx) => tx.walletId === wallet?.id);
    const existing = new Set(walletTxs.map((tx) => transactionFingerprint(tx)));
    const fresh: ImportedRow[] = [];
    let duplicates = 0;
    let skippedBefore = 0;
    const seen = new Set<string>();
    for (const row of result.rows) {
      if (isBeforeOpening(row.date, wallet?.openingDate)) {
        skippedBefore += 1;
        continue;
      }
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

    // Tenencia faltante: se combinan las operaciones ya cargadas en la billetera con las nuevas.
    const symbolOf = (assetId: string) => p.assetsById.get(assetId)?.symbol ?? assetId;
    const missing = missingHoldings([
      ...walletTxs.map((tx) => ({ ...tx, key: symbolOf(tx.assetId) })),
      ...fresh.filter((r) => r.assetType !== 'cash').map((r) => ({ ...r, key: r.symbol })),
    ]);

    setAnalysis({ fileName, text, result, actions, resolutions, fresh, duplicates, skippedBefore, missing: [...missing] });
  }

  const run = async (load: () => Promise<{ text: string; name: string } | null>) => {
    setMessage(null);
    setBusy(true);
    try {
      const file = await load();
      if (file) await analyze(file.text, file.name);
    } catch {
      setMessage({ text: t('importer.readError'), tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  const pickFile = () =>
    run(async () => {
      const picked = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', '*/*'],
        copyToCacheDirectory: true,
      });
      if (picked.canceled || !picked.assets[0]) return null;
      return { text: await readFile(picked.assets[0]), name: picked.assets[0].name };
    });

  const changeAction = async (key: string, action: RowAction) => {
    if (!analysis) return;
    setBusy(true);
    try {
      await analyze(analysis.text, analysis.fileName, { ...analysis.actions, ...currentActions(analysis), [key]: action });
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
              : await repository.createCustomAsset({ symbol: res.symbol, name: res.name, type: res.type, currency: res.currency });
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
      if (isSmartResult(analysis.result)) await saveImportActions(analysis.result.mapping.headers, currentActions(analysis));
      await invalidate();
      setAnalysis(null);
      setPasted('');
      setMessage({ text: t('importer.success', { count: transactions.length }), tone: 'info' });
    } catch (error) {
      if (isPlanLimitError(error)) router.replace(`/paywall?reason=${error.reason}`);
      else setMessage({ text: t('common.error'), tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  if (p.wallets.length === 0) {
    return (
      <Screen>
        <Notice text={t('tx.needWallet')} />
        <Button title={t('home.createWallet')} onPress={() => router.replace('/wallet/new')} />
      </Screen>
    );
  }

  const smart = analysis && isSmartResult(analysis.result) ? analysis.result : null;
  const customSymbols = analysis
    ? [...analysis.resolutions.values()].filter((r): r is Extract<AssetResolution, { kind: 'custom' }> => r.kind === 'custom').map((r) => r.symbol)
    : [];
  const issues = analysis
    ? [...analysis.result.errors.map((e) => ({ ...e, error: true })), ...analysis.result.warnings.map((w) => ({ ...w, error: false }))]
    : [];

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
      <Button title={t('importer.chooseFile')} icon="document-attach-outline" onPress={pickFile} loading={busy && !analysis} />

      {!analysis ? (
        <Card style={{ gap: spacing.sm }}>
          <Field
            label={t('importer.pasteLabel')}
            placeholder={t('importer.pastePlaceholder')}
            value={pasted}
            onChangeText={setPasted}
            multiline
            numberOfLines={4}
            style={{ minHeight: 96, textAlignVertical: 'top' }}
            autoCorrect={false}
          />
          <Button
            title={t('importer.analyzePaste')}
            variant="secondary"
            small
            disabled={pasted.trim().length === 0}
            onPress={() => void run(async () => ({ text: pasted, name: t('importer.pastedName') }))}
          />
        </Card>
      ) : null}

      {message ? <Notice text={message.text} tone={message.tone} /> : null}

      {analysis ? (
        <>
          <Section title={t('importer.preview')}>
            <Card style={{ gap: spacing.sm }}>
              <Text style={{ fontWeight: '600' }}>{analysis.fileName}</Text>
              <Text>{t('importer.rows', { count: analysis.fresh.length })}</Text>
              {smart && smart.ignored > 0 ? <Text muted>{t('importer.ignoredRows', { count: smart.ignored })}</Text> : null}
              {analysis.duplicates > 0 ? <Text muted>{t('importer.duplicates', { count: analysis.duplicates })}</Text> : null}
              {analysis.skippedBefore > 0 ? (
                <Text muted>{t('opening.skippedBefore', { count: analysis.skippedBefore, date: f.date(wallet!.openingDate!) })}</Text>
              ) : null}
              {customSymbols.length > 0 ? (
                <Text variant="caption" color={c.warning}>
                  {t('importer.unknownSymbols', { symbols: customSymbols.join(', ') })}
                </Text>
              ) : null}
            </Card>
            {analysis.missing.length > 0 ? (
              <Notice
                tone="warning"
                text={t('importer.missingHoldings', {
                  list: analysis.missing.map(([symbol, qty]) => `${symbol} (${f.num(qty, 4)})`).join(', '),
                })}
              />
            ) : null}
            <Button title={t('importer.confirm')} onPress={confirmImport} loading={busy} disabled={analysis.fresh.length === 0} />
            <Button title={t('common.cancel')} variant="ghost" small onPress={() => setAnalysis(null)} />
          </Section>

          {smart ? (
            <Section title={t('importer.typesTitle')}>
              <Text variant="caption" muted>
                {t('importer.typesHelp')}
              </Text>
              <Card style={{ gap: spacing.md }}>
                {smart.types.map((type, i) => (
                  <View key={type.key} style={{ gap: spacing.xs }}>
                    {i > 0 ? <Divider /> : null}
                    <Row style={{ justifyContent: 'space-between' }}>
                      <Text style={{ fontWeight: '600', flex: 1 }} numberOfLines={2}>
                        {type.label}
                      </Text>
                      <Text variant="caption" muted>
                        ×{type.count}
                        {type.unknown && type.action === 'ignore' ? ` · ${t('importer.unknownType')}` : ''}
                      </Text>
                    </Row>
                    <Chips
                      options={ACTIONS.map((a) => ({ value: a, label: a === 'ignore' ? t('importer.ignore') : t(`txTypes.${a}`) }))}
                      value={type.action}
                      onChange={(a) => void changeAction(type.key, a)}
                    />
                  </View>
                ))}
              </Card>
            </Section>
          ) : null}

          {smart ? (
            <Section title={t('importer.columnsTitle')}>
              <Card style={{ gap: spacing.xs }}>
                {ROLES.filter((role) => smart.mapping.columns[role]?.length).map((role) => (
                  <Row key={role} style={{ justifyContent: 'space-between' }}>
                    <Text muted>{t(`importer.roles.${role}`)}</Text>
                    <Text style={{ flexShrink: 1 }} numberOfLines={1}>
                      {smart.mapping.columns[role]!.map((i) => smart.mapping.headers[i]).join(' + ')}
                    </Text>
                  </Row>
                ))}
                <Text variant="caption" muted>
                  {smart.mapping.numberFormat === 'comma' ? t('importer.numbersComma') : t('importer.numbersDot')}
                </Text>
              </Card>
            </Section>
          ) : null}

          {issues.length > 0 ? (
            <Section title={t('importer.warnings')}>
              <Card style={{ gap: spacing.xs }}>
                {issues.slice(0, 30).map((issue, i) => (
                  <Text key={i} variant="caption" color={issue.error ? c.negative : c.warning}>
                    {t('importer.line', { line: issue.line })}: {issue.message}
                  </Text>
                ))}
              </Card>
            </Section>
          ) : null}
        </>
      ) : null}

      <Button
        title={t('importer.shareTemplate')}
        variant="ghost"
        small
        onPress={() => void shareTextFile('plantilla-my-finance.csv', GENERIC_TEMPLATE_EXAMPLE, 'text/csv')}
      />
    </Screen>
  );
}

/** Acción actual de cada tipo (sugerida o elegida), para conservarla al cambiar otra. */
function currentActions(analysis: Analysis): Record<string, RowAction> {
  return isSmartResult(analysis.result) ? Object.fromEntries(analysis.result.types.map((x) => [x.key, x.action])) : analysis.actions;
}
