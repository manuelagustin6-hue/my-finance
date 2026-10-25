import { ASSET_TYPES, type AssetType } from '@my-finance/core';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Chips, Field, Screen, Text } from '@/components/ui';
import { repository } from '@/data';
import { keys } from '@/hooks/queries';
import { BASE_CURRENCIES } from '@/lib/config';
import { parseInput } from '@/lib/confirm';

export default function CustomAssetScreen() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState<AssetType>('bond');
  const [currency, setCurrency] = useState('USD');
  const [price, setPrice] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const manualPrice = parseInput(price);
  const errors = {
    symbol: symbol.trim() === '' ? t('tx.errors.asset') : undefined,
    name: name.trim() === '' ? t('wallets.nameRequired') : undefined,
    price: manualPrice !== undefined && !(manualPrice >= 0) ? t('tx.errors.price') : undefined,
  };

  const submit = async () => {
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    setSaving(true);
    try {
      const asset = await repository.createCustomAsset({
        symbol: symbol.trim(),
        name: name.trim(),
        type,
        currency,
        manualPrice,
      });
      await qc.invalidateQueries({ queryKey: keys.assets });
      router.replace({ pathname: '/transaction', params: { assetId: asset.id } });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen>
      <Text muted>{t('market.customHelp')}</Text>
      <Field label={t('market.symbol')} value={symbol} onChangeText={setSymbol} autoCapitalize="characters" maxLength={20} error={submitted ? errors.symbol : undefined} />
      <Field label={t('market.name')} value={name} onChangeText={setName} maxLength={80} error={submitted ? errors.name : undefined} />
      <Chips
        label={t('wallets.type')}
        options={ASSET_TYPES.map((x) => ({ value: x, label: t(`assetTypes.${x}`) }))}
        value={type}
        onChange={setType}
      />
      <Chips label={t('tx.currency')} options={BASE_CURRENCIES.map((x) => ({ value: x, label: x }))} value={currency} onChange={setCurrency} />
      <Field
        label={`${t('asset.manualPrice')} (${t('common.optional')})`}
        value={price}
        onChangeText={setPrice}
        keyboardType="decimal-pad"
        error={submitted ? errors.price : undefined}
      />
      <Button title={t('common.save')} onPress={submit} loading={saving} />
    </Screen>
  );
}
