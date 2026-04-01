// app/coin-history.tsx - Coin transaction history screen

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { getCoinTransactions } from '@/utils/coins';
import { CoinTransaction, COIN_TRANSACTION_LABELS, COIN_TRANSACTION_ICONS } from '@/types/coins';
import { colors } from '@/styles/commonStyles';
import { useCoinBalance } from '@/hooks/useCoinBalance';

// Hide development header
export const unstable_settings = {
  headerShown: false,
};

const PAGE_SIZE = 20;

export default function CoinHistoryScreen() {
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'earned' | 'spent'>('all');
  const [userId, setUserId] = useState<string | null>(null);
  const { coins, loading: coinsLoading } = useCoinBalance(userId);
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadTransactions();
  }, []);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter]);

  async function loadTransactions() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setUserId(user.id);
    
    setLoading(true);
    const data = await getCoinTransactions(user.id);
    setTransactions(data);
    setLoading(false);
  }
  
  const filteredTransactions = transactions.filter((tx) => {
    if (filter === 'earned') return tx.amount > 0;
    if (filter === 'spent') return tx.amount < 0;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const paginatedTransactions = filteredTransactions.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  function renderTransaction({ item }: { item: CoinTransaction }) {
    const isPositive = item.amount > 0;
    const icon = COIN_TRANSACTION_ICONS[item.type];
    const label = COIN_TRANSACTION_LABELS[item.type];

    return (
      <View style={styles.transactionCard}>
        <View style={styles.transactionLeft}>
          <View style={[
            styles.iconContainer,
            isPositive ? styles.iconContainerPositive : styles.iconContainerNegative,
          ]}>
            <Text style={styles.iconEmoji}>{icon}</Text>
          </View>
          
          <View style={styles.transactionInfo}>
            <Text style={styles.transactionLabel}>{label}</Text>
            {item.description && (
              <Text style={styles.transactionDescription} numberOfLines={1}>
                {item.description}
              </Text>
            )}
            <Text style={styles.transactionDate}>
              {new Date(item.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </View>

        <View style={styles.transactionRight}>
          <Text style={[
            styles.transactionAmount,
            isPositive ? styles.amountPositive : styles.amountNegative,
          ]}>
            {isPositive ? '+' : ''}{item.amount}
          </Text>
          <Text style={{ fontSize: 16 }}>🍿</Text>
        </View>
      </View>
    );
  }

  function renderPagination() {
    if (totalPages <= 1) return null;

    return (
      <View style={styles.paginationContainer}>
        {/* Previous Button */}
        <Pressable
          style={[styles.paginationButton, currentPage === 1 && styles.paginationButtonDisabled]}
          onPress={() => goToPage(currentPage - 1)}
          disabled={currentPage === 1}
        >
          <MaterialCommunityIcons
            name="chevron-left"
            size={20}
            color={currentPage === 1 ? '#ccc' : colors.primary}
          />
        </Pressable>

        {/* Page Numbers */}
        <View style={styles.pageNumbersContainer}>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((page) => {
              // Show first, last, current, and pages near current
              if (page === 1 || page === totalPages) return true;
              if (Math.abs(page - currentPage) <= 1) return true;
              return false;
            })
            .reduce((acc: (number | string)[], page, index, arr) => {
              // Add ellipsis between non-consecutive pages
              if (index > 0) {
                const prevPage = arr[index - 1];
                if (page - prevPage > 1) {
                  acc.push('...');
                }
              }
              acc.push(page);
              return acc;
            }, [])
            .map((item, index) => {
              if (item === '...') {
                return (
                  <Text key={`ellipsis-${index}`} style={styles.ellipsis}>...</Text>
                );
              }
              const page = item as number;
              return (
                <Pressable
                  key={page}
                  style={[
                    styles.pageNumber,
                    currentPage === page && styles.pageNumberActive,
                  ]}
                  onPress={() => goToPage(page)}
                >
                  <Text style={[
                    styles.pageNumberText,
                    currentPage === page && styles.pageNumberTextActive,
                  ]}>
                    {page}
                  </Text>
                </Pressable>
              );
            })}
        </View>

        {/* Next Button */}
        <Pressable
          style={[styles.paginationButton, currentPage === totalPages && styles.paginationButtonDisabled]}
          onPress={() => goToPage(currentPage + 1)}
          disabled={currentPage === totalPages}
        >
          <MaterialCommunityIcons
            name="chevron-right"
            size={20}
            color={currentPage === totalPages ? '#ccc' : colors.primary}
          />
        </Pressable>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Coin History</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Full Balance Display */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Your Balance</Text>
        <View style={styles.balanceRow}>
          <Text style={styles.balanceAmount}>
            {coinsLoading ? '...' : coins.toLocaleString()}
          </Text>
          <Text style={styles.coinIcon}>🍿</Text>
        </View>
        <Text style={styles.balanceSubtext}>POPCoins</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        {(['all', 'earned', 'spent'] as const).map((f) => (
          <Pressable
            key={f}
            style={[
              styles.filterTab,
              filter === f && styles.filterTabActive,
            ]}
            onPress={() => setFilter(f)}
          >
            <Text style={[
              styles.filterTabText,
              filter === f && styles.filterTabTextActive,
            ]}>
              {f === 'all' ? 'All' : f === 'earned' ? 'Earned' : 'Spent'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Page Info */}
      {!loading && filteredTransactions.length > 0 && (
        <View style={styles.pageInfoContainer}>
          <Text style={styles.pageInfoText}>
            Page {currentPage} of {totalPages} · {filteredTransactions.length} transaction{filteredTransactions.length !== 1 ? 's' : ''}
          </Text>
        </View>
      )}

      {/* Transactions List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filteredTransactions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={{ fontSize: 64 }}>🍿</Text>
          <Text style={styles.emptyText}>No transactions yet</Text>
          <Text style={styles.emptySubtext}>
            {filter === 'earned' && "You haven't earned any coins yet"}
            {filter === 'spent' && "You haven't spent any coins yet"}
            {filter === 'all' && "Start creating requests to see transactions"}
          </Text>
        </View>
      ) : (
        <>
          <FlatList
            data={paginatedTransactions}
            renderItem={renderTransaction}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
          {renderPagination()}
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background, // ← Dark background
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border, // ← Dark border
  },
  backButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text, // ← White text
  },
  balanceCard: {
    backgroundColor: colors.primary,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
    padding: 20,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  balanceLabel: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
    marginBottom: 8,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
  },
  coinIcon: {
    fontSize: 32,
  },
  balanceSubtext: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.7)',
    marginTop: 4,
    fontWeight: '500',
  },
  filterContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: colors.card, // ← Dark card
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterTabText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary, // ← Light gray
  },
  filterTabTextActive: {
    color: '#fff',
  },
  pageInfoContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  pageInfoText: {
    fontSize: 13,
    color: colors.textSecondary, // ← Light gray
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text, // ← White text
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: colors.textSecondary, // ← Light gray
    marginTop: 8,
    textAlign: 'center',
  },
  listContent: {
    padding: 16,
  },
  transactionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card, // ← Dark card
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconContainerPositive: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)', // ← Slightly more opaque for dark
  },
  iconContainerNegative: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)', // ← Slightly more opaque for dark
  },
  iconEmoji: {
    fontSize: 24,
  },
  transactionInfo: {
    flex: 1,
  },
  transactionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text, // ← White text
    marginBottom: 2,
  },
  transactionDescription: {
    fontSize: 13,
    color: colors.textSecondary, // ← Light gray
    marginBottom: 2,
  },
  transactionDate: {
    fontSize: 12,
    color: colors.textSecondary, // ← Light gray
  },
  transactionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: '700',
  },
  amountPositive: {
    color: '#10b981',
  },
  amountNegative: {
    color: '#ef4444',
  },
  // Pagination styles
  paginationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: colors.border, // ← Dark border
    gap: 8,
  },
  paginationButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card, // ← Dark card
  },
  paginationButtonDisabled: {
    opacity: 0.4,
  },
  pageNumbersContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  pageNumber: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card, // ← Dark card
  },
  pageNumberActive: {
    backgroundColor: colors.primary,
  },
  pageNumberText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary, // ← Light gray
  },
  pageNumberTextActive: {
    color: '#fff',
  },
  ellipsis: {
    fontSize: 14,
    color: colors.textSecondary, // ← Light gray
    paddingHorizontal: 4,
  },
});