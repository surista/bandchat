import { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  StyleSheet,
  Platform,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Purchases from 'react-native-purchases';
import { useTheme } from '../../context/ThemeContext';
import api from '../../services/api';
import { APP_BASE_URL } from '../../utils/constants';
import { useLayout } from '../../hooks/useLayout';

// Product IDs — must match App Store Connect / Google Play Console and RevenueCat dashboard
const PRODUCT_IDS = {
  monthly: 'bandchat_pro_monthly',
  annual: 'bandchat_pro_annual',
  lifetime: 'bandchat_pro_lifetime',
};

// Fallback prices shown while real prices load from RevenueCat
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
  const { isTablet, contentMaxWidth } = useLayout();
  const { workspaceId } = route.params;

  const [planData, setPlanData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [restoring, setRestoring] = useState(false);
  // Map of productId -> RevenueCat Package object
  const [packages, setPackages] = useState({});
  // Map of productId -> formatted price string
  const [storePrices, setStorePrices] = useState({});
  // Whether the store (RevenueCat) is available for purchases
  const [storeAvailable, setStoreAvailable] = useState(true);

  // Load plan status and RevenueCat offerings in parallel on mount
  useEffect(() => {
    const load = async () => {
      try {
        await Promise.all([loadPlan(), loadOfferings()]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [workspaceId]);

  const loadPlan = async () => {
    try {
      const data = await api.getWorkspacePlan(workspaceId);
      setPlanData(data);
    } catch (err) {
      console.error('Failed to load plan:', err);
    }
  };

  const loadOfferings = async () => {
    try {
      const offerings = await Purchases.getOfferings();
      const current = offerings.current;
      if (!current) return;

      const pkgMap = {};
      const priceMap = {};

      for (const pkg of current.availablePackages) {
        const productId = pkg.product.identifier;
        pkgMap[productId] = pkg;
        // RevenueCat provides a pre-formatted price string e.g. "$4.99"
        const priceString = pkg.product.priceString || '';
        if (productId === PRODUCT_IDS.monthly && priceString) {
          priceMap[productId] = `${priceString}/mo`;
        } else if (productId === PRODUCT_IDS.annual && priceString) {
          priceMap[productId] = `${priceString}/yr`;
        } else if (priceString) {
          priceMap[productId] = priceString;
        }
      }

      setPackages(pkgMap);
      setStorePrices(priceMap);
    } catch (err) {
      console.log('RevenueCat offerings unavailable:', err.message);
      // If RevenueCat isn't configured (missing API key) or SDK not ready, disable purchases
      setStoreAvailable(false);
    }
  };

  const getPrice = (productId) => {
    return storePrices[productId] || FALLBACK_PRICES[productId];
  };

  const handlePurchase = async (productId) => {
    if (!storeAvailable) {
      Alert.alert('Store Unavailable', 'In-app purchases are not available right now. Please try again later.');
      return;
    }
    setPurchasing(productId);
    try {
      // Tag this purchase with the workspace so the server can sync the plan
      await Purchases.setAttributes({ workspaceId });

      const pkg = packages[productId];
      if (!pkg) {
        throw new Error('Product not available. Please check your connection and try again.');
      }

      const { customerInfo } = await Purchases.purchasePackage(pkg);

      if (customerInfo.entitlements.active['BandChat Pro']) {
        // Sync the activated plan to the BandChat server
        await api.activatePurchase(workspaceId);
        await loadPlan();
        Alert.alert('Welcome to Pro!', 'All features are now unlocked for this workspace.');
      } else {
        Alert.alert('Purchase Issue', 'Purchase completed but Pro entitlement was not found. Please restore purchases or contact support.');
      }
    } catch (err) {
      // PurchaseCancelledError has userCancelled = true
      if (err.userCancelled) {
        // User cancelled — no alert needed
      } else {
        Alert.alert('Purchase Failed', err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setPurchasing(null);
    }
  };

  const handleRestore = async () => {
    if (!storeAvailable) {
      Alert.alert('Store Unavailable', 'In-app purchases are not available right now. Please try again later.');
      return;
    }
    setRestoring(true);
    try {
      // Tag this restore attempt with the workspace
      await Purchases.setAttributes({ workspaceId });

      const customerInfo = await Purchases.restorePurchases();

      if (customerInfo.entitlements.active['BandChat Pro']) {
        // Sync restored plan to the server
        await api.activatePurchase(workspaceId);
        await loadPlan();
        Alert.alert('Restored', 'Your Pro plan has been restored.');
      } else {
        Alert.alert('No Active Subscription', 'No active Pro subscription was found for this Apple ID / Google account.');
      }
    } catch (err) {
      Alert.alert('Restore Failed', err.message || 'Something went wrong. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const isPro = planData?.effectivePlan === 'PRO';

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }, isTablet && styles.tabletContainer]} edges={['bottom']}>
      <ScrollView contentContainerStyle={[styles.scrollContent, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]}>

        {/* Current Plan Status */}
        {isPro ? (
          <View style={[styles.statusCard, { backgroundColor: '#059669', borderColor: '#059669' }]}>
            <Text style={styles.statusIcon}>⭐</Text>
            <Text style={[styles.statusTitle, { color: '#fff' }]}>You're on Pro!</Text>
            <Text style={[styles.statusDesc, { color: 'rgba(255,255,255,0.85)' }]}>
              All features are unlocked for this workspace.
              {planData.planExpiresAt
                ? `\nRenews ${new Date(planData.planExpiresAt).toLocaleDateString()}`
                : '\nLifetime access'}
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

            {/* Store unavailable notice */}
            {!storeAvailable && (
              <View style={[styles.storeNotice, { backgroundColor: '#78350f' }]}>
                <Text style={styles.storeNoticeText}>
                  In-app purchases are temporarily unavailable. Please try again later.
                </Text>
              </View>
            )}

            {/* Pricing Options */}
            <View style={styles.pricingSection}>
              <PricingCard
                title="Monthly"
                price={getPrice(PRODUCT_IDS.monthly)}
                description="Cancel anytime"
                colors={colors}
                onPress={() => handlePurchase(PRODUCT_IDS.monthly)}
                loading={purchasing === PRODUCT_IDS.monthly}
                disabled={!!purchasing || restoring || !storeAvailable}
              />
              <PricingCard
                title="Annual"
                price={getPrice(PRODUCT_IDS.annual)}
                description="Save 33%"
                badge="Best Value"
                colors={colors}
                onPress={() => handlePurchase(PRODUCT_IDS.annual)}
                loading={purchasing === PRODUCT_IDS.annual}
                disabled={!!purchasing || restoring || !storeAvailable}
                highlighted
              />
              <PricingCard
                title="Lifetime"
                price={getPrice(PRODUCT_IDS.lifetime)}
                description="One-time payment"
                colors={colors}
                onPress={() => handlePurchase(PRODUCT_IDS.lifetime)}
                loading={purchasing === PRODUCT_IDS.lifetime}
                disabled={!!purchasing || restoring || !storeAvailable}
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

        {/* Free Tier Usage */}
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
            disabled={restoring || !!purchasing || !storeAvailable}
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

        <View style={styles.legalLinks}>
          <TouchableOpacity
            onPress={() => Linking.openURL(
              Platform.OS === 'ios'
                ? 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/'
                : `${APP_BASE_URL}/terms`
            )}
            accessibilityRole="link"
            accessibilityLabel={Platform.OS === 'ios' ? 'Terms of Use (EULA)' : 'Terms of Service'}
          >
            <Text style={[styles.legalLink, { color: colors.primary }]}>
              {Platform.OS === 'ios' ? 'Terms of Use (EULA)' : 'Terms of Service'}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.legalSeparator, { color: colors.textSecondary }]}>|</Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(`${APP_BASE_URL}/privacy`)}
            accessibilityRole="link"
            accessibilityLabel="Privacy Policy"
          >
            <Text style={[styles.legalLink, { color: colors.primary }]}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
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
  tabletContainer: { maxWidth: 700, width: '100%', alignSelf: 'center' },
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
  storeNotice: {
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
  },
  storeNoticeText: {
    color: '#fbbf24',
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '600',
  },
  disclaimer: {
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  legalLink: {
    fontSize: 12,
    fontWeight: '600',
  },
  legalSeparator: {
    fontSize: 12,
  },
});
