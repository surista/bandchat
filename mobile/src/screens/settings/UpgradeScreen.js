import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';

// Product IDs — must match App Store Connect / Google Play Console
const PRODUCT_IDS = {
  monthly: 'bandchat_pro_monthly',
  annual: 'bandchat_pro_annual',
  lifetime: 'bandchat_pro_lifetime',
};

const SUBSCRIPTION_SKUS = [PRODUCT_IDS.monthly, PRODUCT_IDS.annual];
const PRODUCT_SKUS = [PRODUCT_IDS.lifetime];

// Fallback prices (shown while loading real prices from store)
const FALLBACK_PRICES = {
  [PRODUCT_IDS.monthly]: '$4.99/mo',
  [PRODUCT_IDS.annual]: '$39.99/yr',
  [PRODUCT_IDS.lifetime]: '$99.99',
};

const PRO_FEATURES = [
  { icon: '👥', label: 'Unlimited band members' },
  { icon: '🎵', label: 'Unlimited songs & setlists' },
  { icon: '💬', label: 'Full message history' },
  { icon: '💰', label: 'Band Kitty finances' },
  { icon: '📊', label: 'Gig stats & insights' },
  { icon: '🎯', label: 'Practice tracker' },
  { icon: '🧠', label: 'Song Intelligence' },
  { icon: '📄', label: 'PDF setlist export' },
  { icon: '📥', label: 'Slack workspace import' },
  { icon: '🎨', label: 'All themes unlocked' },
  { icon: '💾', label: '10 GB storage' },
];

export default function UpgradeScreen({ route }) {
  const { colors } = useTheme();
  const { workspaceId } = route.params;

  const [planData, setPlanData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [iapAvailable, setIapAvailable] = useState(false);
  const [iapHook, setIapHook] = useState(null);
  const [storeProducts, setStoreProducts] = useState({});

  // Load plan status
  useEffect(() => {
    loadPlan();
  }, [workspaceId]);

  const loadPlan = async () => {
    try {
      const data = await api.getWorkspacePlan(workspaceId);
      setPlanData(data);
    } catch (err) {
      console.error('Failed to load plan:', err);
    } finally {
      setLoading(false);
    }
  };

  // Try to initialize IAP
  useEffect(() => {
    let cleanup = null;
    const initIAP = async () => {
      try {
        // Dynamic import — expo-iap requires native build
        const { useIAP } = await import('expo-iap');
        setIapAvailable(true);
      } catch {
        console.log('expo-iap not available (requires native build)');
        setIapAvailable(false);
      }
    };
    initIAP();
    return () => { if (cleanup) cleanup(); };
  }, []);

  const handlePurchase = async (productId) => {
    if (!iapAvailable) {
      Alert.alert('Not Available', 'In-app purchases require a native build. Please install the app from the App Store or Google Play.');
      return;
    }

    setPurchasing(productId);
    try {
      // Dynamic import for purchase flow
      const expoIap = await import('expo-iap');
      const platform = Platform.OS === 'ios' ? 'APPLE' : 'GOOGLE';
      const isSubscription = SUBSCRIPTION_SKUS.includes(productId);

      const result = await expoIap.requestPurchase({
        request: {
          apple: { sku: productId },
          google: { skus: [productId] },
        },
        type: isSubscription ? 'subs' : 'in-app',
      });

      // Get receipt/transaction data
      const purchase = Array.isArray(result) ? result[0] : result;
      if (!purchase) {
        throw new Error('Purchase was cancelled');
      }

      // Send receipt to server for validation
      const receipt = purchase.transactionId || purchase.purchaseToken || '';
      const serverResult = await api.verifyPurchase(workspaceId, platform, receipt, productId);

      // Finish the transaction with the store
      await expoIap.finishTransaction({
        purchase: {
          id: purchase.id,
          productId: purchase.productId,
          transactionId: purchase.transactionId,
          purchaseToken: purchase.purchaseToken || null,
          platform: purchase.platform,
          store: purchase.store,
          transactionDate: purchase.transactionDate,
          purchaseState: purchase.purchaseState,
          isAutoRenewing: purchase.isAutoRenewing,
          quantity: purchase.quantity,
        },
        isConsumable: false,
      });

      // Refresh plan data
      await loadPlan();

      Alert.alert('Welcome to Pro!', 'All features are now unlocked for this workspace.');
    } catch (err) {
      if (err.message?.includes('cancelled') || err.code === 'user-cancelled') {
        // User cancelled — no alert needed
      } else {
        Alert.alert('Purchase Failed', err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setPurchasing(null);
    }
  };

  const handleRestore = async () => {
    if (!iapAvailable) {
      Alert.alert('Not Available', 'In-app purchases require a native build.');
      return;
    }

    setRestoring(true);
    try {
      const expoIap = await import('expo-iap');
      const platform = Platform.OS === 'ios' ? 'APPLE' : 'GOOGLE';

      // Restore from store
      await expoIap.restorePurchases();

      // Get available purchases
      const purchases = await expoIap.getAvailablePurchases({
        alsoPublishToEventListenerIOS: false,
        onlyIncludeActiveItemsIOS: true,
      });

      if (purchases.length === 0) {
        Alert.alert('No Purchases Found', 'No previous purchases were found for this account.');
        return;
      }

      // Send to server for validation
      const receipts = purchases.map(p => p.transactionId || p.purchaseToken || '');
      const result = await api.restorePurchases(workspaceId, platform, receipts);

      if (result.restored) {
        await loadPlan();
        Alert.alert('Restored', 'Your Pro plan has been restored.');
      } else {
        Alert.alert('Not Restored', 'No active Pro subscription was found for this workspace.');
      }
    } catch (err) {
      Alert.alert('Restore Failed', err.message || 'Something went wrong. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const isPro = planData?.effectivePlan === 'PRO';

  const getPrice = (productId) => {
    return storeProducts[productId] || FALLBACK_PRICES[productId];
  };

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Current Plan Status */}
        {isPro ? (
          <View style={[styles.statusCard, { backgroundColor: '#059669', borderColor: '#059669' }]}>
            <Text style={styles.statusIcon}>⭐</Text>
            <Text style={[styles.statusTitle, { color: '#fff' }]}>You're on Pro!</Text>
            <Text style={[styles.statusDesc, { color: 'rgba(255,255,255,0.85)' }]}>
              All features are unlocked for this workspace.
              {planData.planExpiresAt && `\nRenews ${new Date(planData.planExpiresAt).toLocaleDateString()}`}
              {!planData.planExpiresAt && planData.plan === 'PRO' && '\nLifetime access'}
            </Text>
          </View>
        ) : (
          <>
            {/* Hero */}
            <View style={styles.hero}>
              <Text style={styles.heroIcon}>🚀</Text>
              <Text style={[styles.heroTitle, { color: colors.textPrimary }]}>Upgrade to Pro</Text>
              <Text style={[styles.heroDesc, { color: colors.textSecondary }]}>
                Unlock the full power of BandChat for your band.
              </Text>
            </View>

            {/* Pricing Options */}
            <View style={styles.pricingSection}>
              <PricingCard
                title="Monthly"
                price={getPrice(PRODUCT_IDS.monthly)}
                description="Cancel anytime"
                colors={colors}
                onPress={() => handlePurchase(PRODUCT_IDS.monthly)}
                loading={purchasing === PRODUCT_IDS.monthly}
                disabled={!!purchasing}
              />
              <PricingCard
                title="Annual"
                price={getPrice(PRODUCT_IDS.annual)}
                description="Save 33%"
                badge="Best Value"
                colors={colors}
                onPress={() => handlePurchase(PRODUCT_IDS.annual)}
                loading={purchasing === PRODUCT_IDS.annual}
                disabled={!!purchasing}
                highlighted
              />
              <PricingCard
                title="Lifetime"
                price={getPrice(PRODUCT_IDS.lifetime)}
                description="One-time payment"
                colors={colors}
                onPress={() => handlePurchase(PRODUCT_IDS.lifetime)}
                loading={purchasing === PRODUCT_IDS.lifetime}
                disabled={!!purchasing}
              />
            </View>
          </>
        )}

        {/* Features List */}
        <View style={styles.featuresSection}>
          <Text style={[styles.featuresTitle, { color: colors.textPrimary }]}>
            {isPro ? 'Your Pro Features' : 'Everything in Pro'}
          </Text>
          {PRO_FEATURES.map((feature, i) => (
            <View key={i} style={[styles.featureRow, { borderBottomColor: colors.border }]}>
              <Text style={styles.featureIcon}>{feature.icon}</Text>
              <Text style={[styles.featureLabel, { color: colors.textPrimary }]}>{feature.label}</Text>
              {isPro && <Text style={styles.featureCheck}>✓</Text>}
            </View>
          ))}
        </View>

        {/* Free Tier Info */}
        {!isPro && planData && (
          <View style={[styles.usageSection, { backgroundColor: colors.bgSecondary }]}>
            <Text style={[styles.usageTitle, { color: colors.textPrimary }]}>Current Usage (Free)</Text>
            <UsageRow label="Members" value={`${planData.usage?.members || 0} / 3`} colors={colors} />
            <UsageRow label="Songs" value={`${planData.usage?.songs || 0} / 20`} colors={colors} />
            <UsageRow label="Setlists" value={`${planData.usage?.setlists || 0} / 3`} colors={colors} />
            <UsageRow label="Messages" value="90-day history" colors={colors} />
            <UsageRow label="Storage" value="500 MB" colors={colors} />
          </View>
        )}

        {/* Restore Purchases */}
        {!isPro && (
          <TouchableOpacity
            style={styles.restoreButton}
            onPress={handleRestore}
            disabled={restoring}
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
          >
            {restoring ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Text style={[styles.restoreText, { color: colors.primary }]}>Restore Purchases</Text>
            )}
          </TouchableOpacity>
        )}

        <Text style={[styles.disclaimer, { color: colors.textSecondary }]}>
          {Platform.OS === 'ios'
            ? 'Subscriptions auto-renew unless cancelled at least 24 hours before the end of the current period. Manage subscriptions in Settings > Apple ID > Subscriptions.'
            : 'Subscriptions auto-renew unless cancelled. Manage subscriptions in Google Play > Payments & subscriptions.'}
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function PricingCard({ title, price, description, badge, colors, onPress, loading, disabled, highlighted }) {
  return (
    <TouchableOpacity
      style={[
        styles.pricingCard,
        { backgroundColor: colors.bgSecondary, borderColor: highlighted ? '#059669' : colors.border },
        highlighted && styles.pricingCardHighlighted,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${title} plan, ${price}. ${description}`}
    >
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
      <Text style={[styles.pricingTitle, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.pricingPrice, { color: highlighted ? '#059669' : colors.textPrimary }]}>{price}</Text>
      <Text style={[styles.pricingDesc, { color: colors.textSecondary }]}>{description}</Text>
      {loading ? (
        <ActivityIndicator size="small" color="#fff" style={styles.pricingButton} />
      ) : (
        <View style={[styles.pricingButton, highlighted && { backgroundColor: '#059669' }]}>
          <Text style={styles.pricingButtonText}>
            {title === 'Lifetime' ? 'Buy Now' : 'Subscribe'}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function UsageRow({ label, value, colors }) {
  return (
    <View style={styles.usageRow}>
      <Text style={[styles.usageLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.usageValue, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  statusCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
  },
  statusIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  statusTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  statusDesc: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 4,
  },
  hero: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 8,
  },
  heroIcon: {
    fontSize: 48,
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: '800',
  },
  heroDesc: {
    fontSize: 15,
    textAlign: 'center',
    marginTop: 4,
  },
  pricingSection: {
    marginBottom: 24,
    gap: 12,
  },
  pricingCard: {
    borderRadius: 14,
    padding: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    position: 'relative',
  },
  pricingCardHighlighted: {
    borderWidth: 2,
  },
  badge: {
    position: 'absolute',
    top: -10,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  pricingTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  pricingPrice: {
    fontSize: 28,
    fontWeight: '800',
  },
  pricingDesc: {
    fontSize: 13,
    marginTop: 2,
    marginBottom: 12,
  },
  pricingButton: {
    backgroundColor: '#3b82f6',
    paddingVertical: 10,
    paddingHorizontal: 32,
    borderRadius: 8,
    minHeight: 40,
    justifyContent: 'center',
  },
  pricingButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  featuresSection: {
    marginBottom: 24,
  },
  featuresTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  featureIcon: {
    fontSize: 20,
    width: 32,
  },
  featureLabel: {
    fontSize: 15,
    flex: 1,
  },
  featureCheck: {
    fontSize: 16,
    color: '#059669',
    fontWeight: '700',
  },
  usageSection: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  usageTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  usageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  usageLabel: {
    fontSize: 14,
  },
  usageValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  restoreButton: {
    alignItems: 'center',
    paddingVertical: 14,
    marginBottom: 8,
  },
  restoreText: {
    fontSize: 15,
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
  },
});
