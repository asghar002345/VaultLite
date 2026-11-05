import { router } from 'expo-router';
import { useState } from 'react';
import { Switch, View } from 'react-native';
import { getAddress, isAddress, type Hex } from 'viem';

import { Field, ListRow, Notice, Section } from '@/components/states';
import { Button, Input, Screen, T } from '@/components/ui';
import { TOKENS } from '@/config/tokens';
import { Spacing } from '@/constants/theme';
import { shortAddr } from '@/lib/format';
import {
  approvalCall,
  isSmartAccountConfigured,
  parseApprovalAmount,
  parseCalldata,
  parseWei,
  reviewBatch,
  SMART_ACCOUNT_CONFIG,
  tokenMeta,
  type Call,
} from '@/modules/smartAccount';
import { setBatchDraft } from '@/modules/smartAccount/batch-draft';

const USDC = TOKENS.find((t) => t.chain === 'baseSepolia' && t.symbol === 'USDC');

export default function BatchComposer() {
  const configured = isSmartAccountConfigured(SMART_ACCOUNT_CONFIG.baseSepolia);
  const [calls, setCalls] = useState<Call[]>([]);
  const [token, setToken] = useState(USDC?.address ?? '');
  const [spender, setSpender] = useState('');
  const [amount, setAmount] = useState('');
  const [decimals, setDecimals] = useState(String(USDC?.decimals ?? 18));
  const [unlimited, setUnlimited] = useState(false);
  const [to, setTo] = useState('');
  const [data, setData] = useState('');
  const [value, setValue] = useState('0');
  const [formErr, setFormErr] = useState<string | null>(null);

  const known = isAddress(token) ? tokenMeta(getAddress(token)) : null;
  const dec = known?.decimals ?? Number(decimals);
  const rows = reviewBatch(calls);

  const addApproval = () => {
    setFormErr(null);
    if (!isAddress(token) || !isAddress(spender)) return setFormErr('Token and spender must be addresses.');
    if (!Number.isInteger(dec) || dec < 0 || dec > 36) return setFormErr('Decimals must be a whole number from 0 to 36.');
    const amt = parseApprovalAmount(amount, dec, unlimited);
    if (amt === null) return setFormErr('Enter an amount, or turn on unlimited.');
    setCalls((cs) => [...cs, approvalCall(token as Hex, spender as Hex, amt)]);
    setAmount('');
    setUnlimited(false);
  };

  const addCall = () => {
    setFormErr(null);
    if (!isAddress(to)) return setFormErr('Contract address is invalid.');
    const calldata = parseCalldata(data);
    if (calldata === null) return setFormErr('Calldata must be even-length hex.');
    const wei = parseWei(value);
    if (wei === null) return setFormErr('Value must be a whole number of wei.');
    setCalls((cs) => [...cs, { to: getAddress(to), value: wei, data: calldata }]);
    setData('');
    setValue('0');
  };

  return (
    <Screen testID="batch-composer">
      <T variant="title">Batch calls</T>
      <T variant="caption">Base Sepolia · one UserOp. An ERC-20 approve and a contract call go out together.</T>
      {!configured ? (
        <Notice testID="bundler-not-configured" tone="disabled">
          Bundler not configured. You can still build the batch, but sending needs EXPO_PUBLIC_BUNDLER_PROXY_URL.
        </Notice>
      ) : (
        <Notice>Gas is paid by the smart account. No paymaster policy covers a batch — the proxy returns not_sponsorable — so this UserOp is self-paid.</Notice>
      )}
      <Section title={`Calls (${calls.length})`} group={calls.length > 0}>
        {calls.length === 0 ? <T variant="caption">Nothing added yet.</T> : null}
        {rows.map((r) => (
          <ListRow
            key={r.index}
            testID={`batch-call-${r.index}`}
            icon={r.approval ? 'key' : 'send'}
            title={`${r.index + 1}. ${r.title}`}
            subtitle={r.approval ? `Spender ${shortAddr(r.approval.spender)} · ${r.approval.amountLabel}` : `${shortAddr(r.to)} · ${r.detail}`}
            danger={!!r.warning}
            onPress={() => setCalls((cs) => cs.filter((_, i) => i !== r.index))}
            value="Remove"
          />
        ))}
      </Section>
      <Section title="Token approval">
        <Field label="Token" helper={known ? `${known.symbol} · ${known.decimals} decimals` : 'Base Sepolia ERC-20 address'}>
          <Input testID="batch-token" value={token} onChangeText={setToken} placeholder="0x…" autoCapitalize="none" />
        </Field>
        {!known ? (
          <Field label="Decimals">
            <Input testID="batch-decimals" value={decimals} onChangeText={setDecimals} keyboardType="number-pad" />
          </Field>
        ) : null}
        <Field label="Spender">
          <Input testID="batch-spender" value={spender} onChangeText={setSpender} placeholder="0x…" autoCapitalize="none" />
        </Field>
        <Field label="Amount" helper={unlimited ? 'Unlimited (max uint256)' : 'Token units, not wei'}>
          <Input testID="batch-amount" value={amount} onChangeText={setAmount} editable={!unlimited} placeholder={unlimited ? 'Unlimited' : '0.00'} keyboardType="decimal-pad" />
        </Field>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.md }}>
          <T variant="label">Unlimited approval</T>
          <Switch testID="batch-unlimited" value={unlimited} onValueChange={setUnlimited} />
        </View>
        <Button testID="batch-add-approval" variant="secondary" icon="plus" title="Add approval" onPress={addApproval} />
      </Section>
      <Section title="Contract call">
        <Field label="Contract">
          <Input testID="batch-to" value={to} onChangeText={setTo} placeholder="0x…" autoCapitalize="none" />
        </Field>
        <Field label="Calldata" helper="Hex, including the 4-byte selector. Empty sends no data.">
          <Input testID="batch-data" value={data} onChangeText={setData} placeholder="0x" autoCapitalize="none" />
        </Field>
        <Field label="Value (wei)">
          <Input testID="batch-value" value={value} onChangeText={setValue} keyboardType="number-pad" />
        </Field>
        <Button testID="batch-add-call" variant="secondary" icon="plus" title="Add contract call" onPress={addCall} />
      </Section>
      {formErr ? <Notice tone="danger">{formErr}</Notice> : null}
      <Button
        testID="batch-review"
        title="Review batch"
        disabled={calls.length === 0}
        onPress={() => {
          setBatchDraft(calls);
          router.push('/smart-account/batch-review');
        }}
      />
    </Screen>
  );
}
