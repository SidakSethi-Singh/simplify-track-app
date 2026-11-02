import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSync } from '../lib/syncContext';
import { groupByMonth, filterByAccount, filterBySearch } from '../lib/totals';
import { dayLabel, formatForeign, formatINR, monthLabel } from '../lib/money';
import { Txn } from '../lib/types';

function Row({ t, onPress }: { t: Txn; onPress: () => void }) {
  const isDebit = t.direction === 'debit';
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={styles.rowLeft}>
        <Text style={styles.merchant} numberOfLines={1}>
          {t.merchant}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {dayLabel(t.occurredAt)} · {t.category}
          {t.status === 'PENDING' ? ' · PENDING' : ''}
          {t.isOwnTransfer ? ' · Own transfer' : ''}
        </Text>
      </View>
      <View style={styles.rowRight}>
        <Text style={isDebit ? styles.debit : styles.credit}>
          {isDebit ? '-' : '+'}
          {formatINR(t.inrMinor)}
        </Text>
        {t.currency !== 'INR' && (
          <Text style={styles.fx}>
            {t.fxConverted ? '≈ ' : '~ '}
            {formatForeign(t.amountMinor, t.currency)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

export default function TrackScreen() {
  const router = useRouter();
  const { state, serverUrl, setServerUrl, sync, resetLocalData } = useSync();
  const [query, setQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState<string | null>(null);
  const [showServer, setShowServer] = useState(false);
  const [serverDraft, setServerDraft] = useState(serverUrl);

  // The saved server URL loads asynchronously after first render; keep the
  // editor in sync until the user presses Connect (which changes serverUrl).
  useEffect(() => {
    setServerDraft(serverUrl);
  }, [serverUrl]);

  const sections = useMemo(() => {
    const filtered = filterByAccount(
      filterBySearch(state.txns, query),
      accountFilter,
    );
    return groupByMonth(filtered).map((g) => ({
      title: g.key,
      spendMinor: g.spendMinor,
      incomeMinor: g.incomeMinor,
      count: g.count,
      data: g.txns,
    }));
  }, [state.txns, query, accountFilter]);

  const totalCount = state.txns.length;

  return (
    <View style={styles.container}>
      <View style={styles.searchBox}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by merchant…"
          placeholderTextColor="#888"
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>

      <View style={styles.chips}>
        <Pressable
          onPress={() => setAccountFilter(null)}
          style={[styles.chip, accountFilter === null && styles.chipActive]}>
          <Text style={accountFilter === null ? styles.chipTextActive : styles.chipText}>
            All accounts
          </Text>
        </Pressable>
        {state.accounts.map((a) => (
          <Pressable
            key={a.id}
            onPress={() => setAccountFilter(a.id)}
            style={[styles.chip, accountFilter === a.id && styles.chipActive]}>
            <Text style={accountFilter === a.id ? styles.chipTextActive : styles.chipText}>
              {a.nickname || a.bank}
            </Text>
          </Pressable>
        ))}
      </View>

      {state.syncing && (
        <View style={styles.banner}>
          <ActivityIndicator size="small" />
          <Text style={styles.bannerText}>
            Syncing… {state.stats.total.toLocaleString('en-IN')} transactions loaded
          </Text>
        </View>
      )}
      {!state.syncing && state.lastError && (
        <View style={[styles.banner, styles.bannerWarn]}>
          <Text style={styles.bannerText}>
            Couldn&apos;t reach the server — showing saved data. Pull to retry.
          </Text>
        </View>
      )}
      {!state.syncing && state.lastSyncedAt && !state.lastError && (
        <Text style={styles.synced}>
          Last synced{' '}
          {new Date(state.lastSyncedAt).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
          })}
          {state.stats.skipped > 0 ? ` · ${state.stats.skipped} rows skipped` : ''}
        </Text>
      )}

      <SectionList
        sections={sections}
        keyExtractor={(t) => t.id}
        renderSectionHeader={({ section }) => (
          <View style={styles.header}>
            <Text style={styles.headerMonth}>{monthLabel(section.title)}</Text>
            <Text style={styles.headerTotals}>
              Spent {formatINR(section.spendMinor)} · Earned {formatINR(section.incomeMinor)} ·{' '}
              {section.count} txns
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Row
            t={item}
            onPress={() => router.push({ pathname: '/detail', params: { id: item.id } })}
          />
        )}
        initialNumToRender={20}
        windowSize={10}
        removeClippedSubviews
        refreshControl={
          <RefreshControl refreshing={state.syncing} onRefresh={() => void sync()} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {totalCount === 0 ? 'No transactions yet' : 'No matches'}
            </Text>
            <Text style={styles.emptyBody}>
              {totalCount === 0
                ? 'Check the server URL below, then pull to refresh.'
                : 'Try a different search or account filter.'}
            </Text>
          </View>
        }
        ListFooterComponent={
          <View style={styles.footer}>
            <Pressable onPress={() => setShowServer((s) => !s)}>
              <Text style={styles.serverToggle}>
                {showServer ? 'Hide server settings ▲' : 'Server settings ▼'} · {serverUrl}
              </Text>
            </Pressable>
            {showServer && (
              <View style={styles.serverBox}>
                <Text style={styles.serverHelp}>
                  Run the mock server on your computer with `node server.js`, then
                  enter its address here. On a real phone use your computer&apos;s
                  LAN IP (not localhost). Android emulator: 10.0.2.2:4010.
                </Text>
                <TextInput
                  value={serverDraft}
                  onChangeText={setServerDraft}
                  style={styles.serverInput}
                  autoCorrect={false}
                  autoCapitalize="none"
                  placeholder="http://192.168.1.20:4010"
                />
                <View style={styles.serverButtons}>
                  <Pressable
                    style={styles.button}
                    onPress={() => setServerUrl(serverDraft)}>
                    <Text style={styles.buttonText}>Connect &amp; sync</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.button, styles.buttonDanger]}
                    onPress={() => void resetLocalData()}>
                    <Text style={styles.buttonText}>Reset local data</Text>
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  searchBox: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  search: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: '#111', borderColor: '#111' },
  chipText: { fontSize: 13, color: '#333' },
  chipTextActive: { fontSize: 13, color: '#fff' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    padding: 10,
    backgroundColor: '#eef4ff',
    borderRadius: 8,
  },
  bannerWarn: { backgroundColor: '#fff4e0' },
  bannerText: { fontSize: 13, flex: 1 },
  synced: { fontSize: 12, color: '#777', paddingHorizontal: 16, paddingTop: 8 },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, backgroundColor: '#fff' },
  headerMonth: { fontSize: 17, fontWeight: '700' },
  headerTotals: { fontSize: 13, color: '#555', marginTop: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  rowLeft: { flex: 1, paddingRight: 12 },
  rowRight: { alignItems: 'flex-end' },
  merchant: { fontSize: 15 },
  sub: { fontSize: 12, color: '#777', marginTop: 2 },
  debit: { color: '#c62828', fontSize: 15, fontWeight: '600' },
  credit: { color: '#2e7d32', fontSize: 15, fontWeight: '600' },
  fx: { fontSize: 11, color: '#888', marginTop: 2 },
  empty: { padding: 32, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyBody: { fontSize: 13, color: '#777', marginTop: 6, textAlign: 'center' },
  footer: { padding: 16 },
  serverToggle: { fontSize: 13, color: '#555' },
  serverBox: { marginTop: 12, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, padding: 12 },
  serverHelp: { fontSize: 12, color: '#555', lineHeight: 17 },
  serverInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
    fontSize: 14,
  },
  serverButtons: { flexDirection: 'row', gap: 8, marginTop: 10 },
  button: { backgroundColor: '#111', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 10 },
  buttonDanger: { backgroundColor: '#8a1c1c' },
  buttonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
