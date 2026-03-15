import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Switch,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useLayout } from '../../hooks/useLayout';
import { successNotification } from '../../utils/haptics';
import api from '../../services/api';

const THEMES = [
  { id: 'rock', label: 'Rock', bg: '#0a0a0a', accent: '#e81c2e', accent2: '#ff5722', desc: 'Bold & high energy' },
  { id: 'grunge', label: 'Grunge', bg: '#1a1611', accent: '#a63c2e', accent2: '#bfa84f', desc: 'Raw & textured' },
  { id: 'pop', label: 'Pop', bg: '#faf8ff', accent: '#f637e3', accent2: '#7c3aed', desc: 'Bright & playful', light: true },
  { id: 'jazz', label: 'Jazz', bg: '#0b1021', accent: '#c9a84c', accent2: '#6b7394', desc: 'Sophisticated & warm' },
  { id: 'covers', label: 'Covers', bg: '#121218', accent: '#ff2d78', accent2: '#00c2ff', desc: 'Fun & versatile' },
  { id: 'country', label: 'Country', bg: '#1c1712', accent: '#c8873a', accent2: '#a0522d', desc: 'Rustic & honest' },
  { id: 'metal', label: 'Metal', bg: '#050505', accent: '#8b0000', accent2: '#4a4a4a', desc: 'Dark & aggressive' },
  { id: 'electronic', label: 'Electronic', bg: '#080810', accent: '#00ffc8', accent2: '#6a00ff', desc: 'Futuristic & sharp' },
  { id: 'funk', label: 'Funk / Soul', bg: '#1a0e08', accent: '#e86a17', accent2: '#daa520', desc: 'Groovy & retro' },
  { id: 'reggae', label: 'Reggae', bg: '#0f1a0a', accent: '#2d8b2e', accent2: '#daa520', desc: 'Warm & positive' },
  { id: 'classical', label: 'Classical', bg: '#fdfcf9', accent: '#1a1a1a', accent2: '#9e8a5e', desc: 'Elegant & refined', light: true },
];

export default function WebsiteSettingsScreen({ route }) {
  const { workspaceId, workspaceName } = route.params;
  const { colors } = useTheme();
  const { isTablet, contentMaxWidth } = useLayout();

  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [websiteData, setWebsiteData] = useState(null);

  // Config form — band identity
  const [bandName, setBandName] = useState(workspaceName || '');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [genre, setGenre] = useState('');
  const [founded, setFounded] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  // Template
  const [template, setTemplate] = useState('covers');
  // Branding
  const [primaryColor, setPrimaryColor] = useState('#ff3250');
  const [secondaryColor, setSecondaryColor] = useState('#ffc800');
  const [logoUrl, setLogoUrl] = useState('');
  const [heroImageUrl, setHeroImageUrl] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [heroUploading, setHeroUploading] = useState(false);
  // Social
  const [instagram, setInstagram] = useState('');
  const [facebook, setFacebook] = useState('');
  const [youtube, setYoutube] = useState('');
  const [spotify, setSpotify] = useState('');
  // Features
  const [showSongs, setShowSongs] = useState(true);
  const [showArchive, setShowArchive] = useState(true);
  const [showSetlists, setShowSetlists] = useState(true);
  const [showTimeline, setShowTimeline] = useState(true);
  const [showMedia, setShowMedia] = useState(true);
  const [showStats, setShowStats] = useState(true);
  const [showSongRequests, setShowSongRequests] = useState(false);
  const [showTrivia, setShowTrivia] = useState(false);
  // SEO
  const [seoTitle, setSeoTitle] = useState('');
  const [seoDescription, setSeoDescription] = useState('');

  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    loadWebsite();
  }, [workspaceId]);

  async function loadWebsite() {
    setLoading(true);
    try {
      const data = await api.getWebsiteConfig(workspaceId);
      setWebsiteData(data);
      if (data.websiteConfig) {
        const c = data.websiteConfig;
        setBandName(c.bandName || c.band?.name || workspaceName || '');
        setTagline(c.tagline || c.band?.tagline || '');
        setDescription(c.description || c.band?.description || '');
        setLocation(c.location || c.band?.location || '');
        setGenre(c.genre || c.band?.genre || '');
        setFounded(String(c.founded || c.band?.founded || ''));
        setContactEmail(c.contactEmail || c.emails?.info || '');
        setTemplate(c.template || c.theme?.template || 'covers');
        setPrimaryColor(c.theme?.primaryAccent || '#ff3250');
        setSecondaryColor(c.theme?.secondaryAccent || '#ffc800');
        setLogoUrl(c.images?.logo || '');
        setHeroImageUrl(c.images?.heroImages?.[0] || '');
        if (Array.isArray(c.social)) {
          setInstagram(c.social.find(s => s.platform === 'instagram')?.url || '');
          setFacebook(c.social.find(s => s.platform === 'facebook')?.url || '');
          setYoutube(c.social.find(s => s.platform === 'youtube')?.url || '');
          setSpotify(c.social.find(s => s.platform === 'spotify')?.url || '');
        } else {
          setInstagram(c.socialLinks?.instagram || '');
          setFacebook(c.socialLinks?.facebook || '');
          setYoutube(c.socialLinks?.youtube || '');
          setSpotify(c.socialLinks?.spotify || '');
        }
        const f = c.features || {};
        setShowSongs(f.songs !== false);
        setShowArchive(f.archive !== false);
        setShowSetlists(f.setlists !== false);
        setShowTimeline(f.timeline !== false);
        setShowMedia(f.media !== false);
        setShowStats(f.stats !== false);
        setShowSongRequests(f.songRequests === true);
        setShowTrivia(f.trivia === true);
        setSeoTitle(c.seo?.title || '');
        setSeoDescription(c.seo?.description || '');
      }
    } catch {
      Alert.alert('Error', 'Failed to load website config');
    } finally {
      setLoading(false);
    }
  }

  function getConfig() {
    const socialArray = [
      instagram.trim() && { platform: 'instagram', url: instagram.trim(), label: 'Instagram' },
      facebook.trim() && { platform: 'facebook', url: facebook.trim(), label: 'Facebook' },
      youtube.trim() && { platform: 'youtube', url: youtube.trim(), label: 'YouTube' },
      spotify.trim() && { platform: 'spotify', url: spotify.trim(), label: 'Spotify' },
    ].filter(Boolean);

    return {
      bandName: bandName.trim(),
      band: {
        name: bandName.trim(),
        tagline: tagline.trim(),
        description: description.trim(),
        location: location.trim(),
        genre: genre.trim(),
        founded: founded ? parseInt(founded) || null : null,
      },
      tagline: tagline.trim(),
      description: description.trim(),
      location: location.trim(),
      genre: genre.trim(),
      founded: founded ? parseInt(founded) || null : null,
      contactEmail: contactEmail.trim(),
      emails: { info: contactEmail.trim() },
      social: socialArray,
      socialLinks: { instagram: instagram.trim(), facebook: facebook.trim(), youtube: youtube.trim(), spotify: spotify.trim() },
      template,
      theme: { template, primaryAccent: primaryColor, secondaryAccent: secondaryColor },
      images: { logo: logoUrl || null, heroImages: heroImageUrl ? [heroImageUrl] : [] },
      features: {
        songs: showSongs, archive: showArchive, setlists: showSetlists,
        timeline: showTimeline, media: showMedia, stats: showStats,
        songRequests: showSongRequests, trivia: showTrivia,
        blog: false, community: false, merch: false,
      },
      seo: {
        title: seoTitle.trim() || `${bandName.trim()} | Official Website`,
        description: seoDescription.trim() || description.trim(),
      },
    };
  }

  const handleSaveConfig = useCallback(async () => {
    if (!bandName.trim()) { Alert.alert('Error', 'Band name is required'); return; }
    setSavingConfig(true);
    try {
      await api.updateWebsiteConfig(workspaceId, getConfig());
      successNotification();
      Alert.alert('Saved', 'Website config saved');
      await loadWebsite();
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save config');
    } finally { setSavingConfig(false); }
  }, [workspaceId, bandName, tagline, description, location, genre, founded, contactEmail, primaryColor, secondaryColor, instagram, facebook, youtube, spotify, showSongs, showArchive, showSetlists, showTimeline, showMedia, showStats, showSongRequests, showTrivia, seoTitle, seoDescription, logoUrl, heroImageUrl, template]);

  const handleDeploy = useCallback(async () => {
    if (!bandName.trim()) { Alert.alert('Error', 'Band name is required'); return; }
    setDeploying(true);
    try {
      await api.updateWebsiteConfig(workspaceId, getConfig());
      await api.deployWebsite(workspaceId);
      successNotification();
      Alert.alert('Success', 'Website deployed!');
      await loadWebsite();
    } catch (err) {
      Alert.alert('Error', err.message || 'Deployment failed');
    } finally { setDeploying(false); }
  }, [workspaceId, bandName, tagline, description, location, genre, founded, contactEmail, primaryColor, secondaryColor, instagram, facebook, youtube, spotify, showSongs, showArchive, showSetlists, showTimeline, showMedia, showStats, showSongRequests, showTrivia, seoTitle, seoDescription, logoUrl, heroImageUrl, template]);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      await api.syncWebsite(workspaceId);
      successNotification();
      Alert.alert('Synced', 'Website will rebuild shortly');
    } catch (err) {
      Alert.alert('Error', err.message || 'Sync failed');
    } finally { setSyncing(false); }
  }, [workspaceId]);

  const handleDelete = useCallback(() => {
    Alert.alert('Delete Website', 'This will permanently remove the website, Vercel project, and GitHub repository. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        try {
          await api.deleteWebsite(workspaceId);
          Alert.alert('Deleted', 'Website has been removed');
          await loadWebsite();
        } catch (err) { Alert.alert('Error', err.message || 'Failed to delete'); }
      }},
    ]);
  }, [workspaceId]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
        <View style={styles.center}><ActivityIndicator size="large" color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const isDeployed = websiteData?.websiteEnabled && websiteData?.websiteStatus === 'active';

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bgPrimary }]} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={[styles.content, isTablet && { maxWidth: contentMaxWidth, alignSelf: 'center', width: '100%' }]} keyboardShouldPersistTaps="handled">
          {/* Status card */}
          {isDeployed && (
            <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
              <View style={styles.statusRow}>
                <View style={styles.statusDot} />
                <Text style={[styles.statusText, { color: '#22c55e' }]}>Active</Text>
              </View>
              <TouchableOpacity onPress={() => Linking.openURL(websiteData.websiteUrl)}>
                <Text style={[styles.urlText, { color: colors.primary }]}>{websiteData.websiteUrl}</Text>
              </TouchableOpacity>
              {websiteData.websiteDeployedAt && (
                <Text style={[styles.deployedAt, { color: colors.textSecondary }]}>Last deployed: {new Date(websiteData.websiteDeployedAt).toLocaleString()}</Text>
              )}
              <View style={styles.actionRow}>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.primary }]} onPress={() => Linking.openURL(websiteData.websiteUrl)} accessibilityLabel="View website">
                  <Text style={styles.actionBtnText}>View Site</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.actionBtn, { backgroundColor: colors.bgTertiary }]} onPress={handleSync} disabled={syncing} accessibilityLabel="Sync website">
                  <Text style={[styles.actionBtnText, { color: colors.textPrimary }]}>{syncing ? 'Syncing...' : 'Sync Now'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {!isDeployed && !websiteData?.websiteConfig && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>🌐</Text>
              <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>Launch Your Band Website</Text>
              <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
                Get a professional website for your band in minutes. Automatically syncs your gigs, members, songs, and setlists from BandChat.
              </Text>
            </View>
          )}

          {websiteData?.websiteStatus === 'deploying' && (
            <View style={[styles.statusBanner, { backgroundColor: 'rgba(234,179,8,0.15)', borderColor: 'rgba(234,179,8,0.3)' }]}>
              <ActivityIndicator size="small" color="#eab308" />
              <Text style={{ color: '#eab308', fontSize: 14, marginLeft: 10 }}>Setting up your website...</Text>
            </View>
          )}

          {websiteData?.websiteStatus === 'error' && (
            <View style={[styles.statusBanner, { backgroundColor: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)' }]}>
              <Text style={{ color: '#ef4444', fontSize: 14 }}>Deployment failed. Check config and try again.</Text>
            </View>
          )}

          {/* Band Identity */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>BAND IDENTITY</Text>
          <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Band Name *</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]} value={bandName} onChangeText={setBandName} placeholder="Your band name" placeholderTextColor={colors.textSecondary} maxLength={500} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>Tagline</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]} value={tagline} onChangeText={setTagline} placeholder="e.g. Tokyo's Premier Rock Band" placeholderTextColor={colors.textSecondary} maxLength={500} />

            <Text style={[styles.label, { color: colors.textSecondary }]}>About</Text>
            <TextInput style={[styles.input, styles.textArea, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]} value={description} onChangeText={setDescription} placeholder="Tell people about your band" placeholderTextColor={colors.textSecondary} multiline maxLength={2000} />

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Location</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]} value={location} onChangeText={setLocation} placeholder="Tokyo, Japan" placeholderTextColor={colors.textSecondary} maxLength={200} />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Genre</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]} value={genre} onChangeText={setGenre} placeholder="Rock Covers" placeholderTextColor={colors.textSecondary} maxLength={200} />
              </View>
            </View>

            <Text style={[styles.label, { color: colors.textSecondary }]}>Founded Year</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border, width: 120 }]} value={founded} onChangeText={setFounded} placeholder="2024" placeholderTextColor={colors.textSecondary} keyboardType="number-pad" maxLength={4} />
          </View>

          {/* Branding */}
          {/* Template / Genre */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>DESIGN TEMPLATE</Text>
          <Text style={[{ color: colors.textSecondary, fontSize: 12, marginBottom: 8, marginLeft: 4 }]}>Choose a style that fits your band's vibe</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {THEMES.map((t) => (
              <TouchableOpacity
                key={t.id}
                onPress={() => setTemplate(t.id)}
                style={{
                  width: '31%',
                  backgroundColor: t.bg,
                  borderRadius: 10,
                  padding: 10,
                  borderWidth: 2,
                  borderColor: template === t.id ? colors.primary : 'transparent',
                }}
                activeOpacity={0.7}
              >
                <View style={{ flexDirection: 'row', gap: 4, marginBottom: 6 }}>
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: t.accent }} />
                  <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: t.accent2 }} />
                </View>
                <Text style={{ fontSize: 13, fontWeight: '700', color: t.light ? '#1a1a1a' : '#fff' }}>{t.label}</Text>
                <Text style={{ fontSize: 10, color: t.light ? '#666' : '#999', marginTop: 2 }}>{t.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>BRANDING</Text>
          <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Primary Color</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]} value={primaryColor} onChangeText={setPrimaryColor} placeholder="#ff3250" placeholderTextColor={colors.textSecondary} maxLength={7} autoCapitalize="none" />
              </View>
              <View style={{ width: 12 }} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>Secondary Color</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]} value={secondaryColor} onChangeText={setSecondaryColor} placeholder="#ffc800" placeholderTextColor={colors.textSecondary} maxLength={7} autoCapitalize="none" />
              </View>
            </View>

            {/* Logo */}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Logo</Text>
            {logoUrl ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Image source={{ uri: logoUrl }} style={{ width: 72, height: 72, borderRadius: 8, backgroundColor: colors.bgTertiary }} resizeMode="contain" />
                <TouchableOpacity onPress={() => setLogoUrl('')} style={{ backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}>
                  <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.uploadBtn, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                disabled={logoUploading}
                onPress={async () => {
                  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
                  if (result.canceled) return;
                  setLogoUploading(true);
                  try {
                    const asset = result.assets[0];
                    const formData = new FormData();
                    formData.append('file', { uri: asset.uri, name: 'logo.jpg', type: 'image/jpeg' });
                    formData.append('workspaceId', workspaceId);
                    const uploaded = await api.uploadFile(formData, workspaceId);
                    setLogoUrl(uploaded.url);
                  } catch { Alert.alert('Error', 'Failed to upload logo'); }
                  finally { setLogoUploading(false); }
                }}
              >
                <Text style={[styles.uploadBtnText, { color: colors.textSecondary }]}>{logoUploading ? 'Uploading...' : 'Upload Logo'}</Text>
              </TouchableOpacity>
            )}

            {/* Hero Image */}
            <Text style={[styles.label, { color: colors.textSecondary }]}>Hero Image</Text>
            {heroImageUrl ? (
              <View style={{ gap: 8 }}>
                <Image source={{ uri: heroImageUrl }} style={{ width: '100%', height: 100, borderRadius: 8 }} resizeMode="cover" />
                <TouchableOpacity onPress={() => setHeroImageUrl('')} style={{ backgroundColor: 'rgba(239,68,68,0.15)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignSelf: 'flex-start' }}>
                  <Text style={{ color: '#ef4444', fontSize: 14, fontWeight: '600' }}>Remove</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.uploadBtn, { backgroundColor: colors.bgTertiary, borderColor: colors.border }]}
                disabled={heroUploading}
                onPress={async () => {
                  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.8 });
                  if (result.canceled) return;
                  setHeroUploading(true);
                  try {
                    const asset = result.assets[0];
                    const formData = new FormData();
                    formData.append('file', { uri: asset.uri, name: 'hero.jpg', type: 'image/jpeg' });
                    formData.append('workspaceId', workspaceId);
                    const uploaded = await api.uploadFile(formData, workspaceId);
                    setHeroImageUrl(uploaded.url);
                  } catch { Alert.alert('Error', 'Failed to upload hero image'); }
                  finally { setHeroUploading(false); }
                }}
              >
                <Text style={[styles.uploadBtnText, { color: colors.textSecondary }]}>{heroUploading ? 'Uploading...' : 'Upload Hero Image'}</Text>
              </TouchableOpacity>
            )}
            <Text style={[{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }]}>Full-width background image for the homepage</Text>
          </View>

          {/* Contact & Social */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>CONTACT & SOCIAL</Text>
          <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Contact Email</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]} value={contactEmail} onChangeText={setContactEmail} placeholder="bookings@yourband.com" placeholderTextColor={colors.textSecondary} keyboardType="email-address" autoCapitalize="none" maxLength={500} />
            {[
              ['Instagram', instagram, setInstagram],
              ['Facebook', facebook, setFacebook],
              ['YouTube', youtube, setYoutube],
              ['Spotify', spotify, setSpotify],
            ].map(([lbl, val, setter]) => (
              <View key={lbl}>
                <Text style={[styles.label, { color: colors.textSecondary }]}>{lbl}</Text>
                <TextInput style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]} value={val} onChangeText={setter} placeholder={`${lbl} URL`} placeholderTextColor={colors.textSecondary} keyboardType="url" autoCapitalize="none" />
              </View>
            ))}
          </View>

          {/* Features */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>WEBSITE PAGES</Text>
          <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
            {[
              ['Songs', showSongs, setShowSongs],
              ['Gig Archive', showArchive, setShowArchive],
              ['Setlists', showSetlists, setShowSetlists],
              ['Timeline', showTimeline, setShowTimeline],
              ['Media', showMedia, setShowMedia],
              ['Stats', showStats, setShowStats],
              ['Song Requests', showSongRequests, setShowSongRequests],
              ['Trivia', showTrivia, setShowTrivia],
            ].map(([lbl, val, setter]) => (
              <View key={lbl} style={styles.toggleRow}>
                <Text style={[styles.toggleLabel, { color: colors.textPrimary }]}>{lbl}</Text>
                <Switch value={val} onValueChange={setter} trackColor={{ false: colors.bgTertiary, true: colors.primary }} thumbColor="#ffffff" />
              </View>
            ))}
          </View>

          {/* SEO */}
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>SEO</Text>
          <View style={[styles.card, { backgroundColor: colors.bgSecondary }]}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>Page Title</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]} value={seoTitle} onChangeText={setSeoTitle} placeholder={`${bandName || 'Your Band'} | Official Website`} placeholderTextColor={colors.textSecondary} maxLength={200} />
            <Text style={[styles.label, { color: colors.textSecondary }]}>Meta Description</Text>
            <TextInput style={[styles.input, { backgroundColor: colors.bgTertiary, color: colors.textPrimary, borderColor: colors.border }]} value={seoDescription} onChangeText={setSeoDescription} placeholder="Brief description for search engines" placeholderTextColor={colors.textSecondary} maxLength={300} />
          </View>

          {/* Actions */}
          <View style={styles.buttonGroup}>
            {isDeployed ? (
              <>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.primary }, (!bandName.trim() || savingConfig) && { opacity: 0.5 }]} onPress={handleSaveConfig} disabled={savingConfig || !bandName.trim()}>
                  {savingConfig ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Save Config</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: colors.bgTertiary }, (!bandName.trim() || deploying) && { opacity: 0.5 }]} onPress={handleDeploy} disabled={deploying || !bandName.trim()}>
                  {deploying ? <ActivityIndicator color={colors.textPrimary} size="small" /> : <Text style={[styles.primaryBtnText, { color: colors.textPrimary }]}>Save & Redeploy</Text>}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: 'rgba(239,68,68,0.15)' }]} onPress={handleDelete}>
                  <Text style={[styles.primaryBtnText, { color: '#ef4444' }]}>Delete Website</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: '#22c55e' }, (!bandName.trim() || deploying) && { opacity: 0.5 }]} onPress={handleDeploy} disabled={deploying || !bandName.trim()}>
                {deploying ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>{websiteData?.websiteConfig ? 'Deploy Website' : 'Create & Deploy Website'}</Text>}
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 12, padding: 16, marginBottom: 16 },
  sectionTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, marginTop: 16, marginBottom: 8, marginLeft: 4 },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 },
  textArea: { minHeight: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row' },
  statusRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22c55e', marginRight: 8 },
  statusText: { fontSize: 14, fontWeight: '700' },
  urlText: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
  deployedAt: { fontSize: 12, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  actionBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  actionBtnText: { fontSize: 15, fontWeight: '600', color: '#ffffff' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  toggleLabel: { fontSize: 16 },
  emptyState: { alignItems: 'center', paddingVertical: 32 },
  emptyEmoji: { fontSize: 48, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyDesc: { fontSize: 15, textAlign: 'center', maxWidth: 300, lineHeight: 22 },
  statusBanner: { borderWidth: 1, borderRadius: 10, padding: 14, flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  buttonGroup: { gap: 12, marginTop: 8 },
  primaryBtn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#ffffff' },
  uploadBtn: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, paddingVertical: 16, alignItems: 'center' },
  uploadBtnText: { fontSize: 14, fontWeight: '500' },
});
