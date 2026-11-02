import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSync } from '../lib/syncContext';
import { dayLabel, formatForeign, formatINR } from '../lib/money';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

export default function DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useSync();
  const t = state.txns.find((x) => x.id === id);

  if (!t) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Transaction not found</Text>
        <Text style={styles.body}>
          It may have been deleted by a later sync. Go back and pull to refresh.
        </Text>
      </View>
    );
  }

  const isDebit = t.direction === 'debit';
  return (
    <ScrollView style={styles.container}>
      <Text style={styles.merchant}>{t.merchant}</Text>
      <Text style={isDebit ? styles.debit : styles.credit}>
        {isDebit ? '-' : '+'}
        {formatINR(t.inrMinor)}
      </Text>
      {t.currency !== 'INR' && (
        <Text style={styles.fxNote}>
          Original amount: {formatForeign(t.amountMinor, t.currency)}
          {t.fxConverted
            ? ' — converted to INR using the rate the server supplied.'
            : ' — no conversion rate supplied, shown as-is.'}
        </Text>
      )}
      {t.isOwnTransfer && (
        <Text style={styles.ownNote}>
          Money moved between your own accounts — not counted as spending or earning.
        </Text>
      )}
      <Field label="Direction" value={isDebit ? 'Money out (debit)' : 'Money in (credit)'} />
      <Field label="Category" value={t.category} />
      <Field label="Status" value={t.status} />
      <Field label="Account" value={`${t.accountLabel} (${t.accountId})`} />
      <Field label="Occurred" value={`${dayLabel(t.occurredAt)} · ${t.occurredAt}`} />
      {t.updatedAt && <Field label="Last updated" value={t.updatedAt} />}
      <Field label="Transaction id" value={t.id} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  center: { flex: 1, backgroundColor: '#fff', padding: 24, justifyContent: 'center' },
  title: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 14, color: '#555', marginTop: 8, lineHeight: 20 },
  merchant: { fontSize: 20, fontWeight: '700' },
  debit: { color: '#c62828', fontSize: 24, fontWeight: '700', marginTop: 8 },
  credit: { color: '#2e7d32', fontSize: 24, fontWeight: '700', marginTop: 8 },
  fxNote: { fontSize: 13, color: '#555', marginTop: 8, lineHeight: 18 },
  ownNote: {
    fontSize: 13,
    color: '#555',
    marginTop: 8,
    backgroundColor: '#f4f4f4',
    padding: 10,
    borderRadius: 8,
    lineHeight: 18,
  },
  field: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12 },
  label: { fontSize: 12, color: '#888', textTransform: 'uppercase' },
  value: { fontSize: 15, marginTop: 4 },
});
