/**
 * WebsiteTab — admin-only tab in SettingsModal for managing band website.
 * Three states: no website, config form, deployed.
 */

import { useState, useEffect } from 'react';
import api from '../../services/api';
import { useToast } from '../../context/ToastContext';
import ConfirmDialog from '../common/ConfirmDialog';

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

export default function WebsiteTab({ workspace }) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [websiteData, setWebsiteData] = useState(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deploySuccessUrl, setDeploySuccessUrl] = useState(null);

  // Config form state — band identity
  const [bandName, setBandName] = useState('');
  const [tagline, setTagline] = useState('');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [genre, setGenre] = useState('');
  const [founded, setFounded] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  // Template/genre
  const [template, setTemplate] = useState('covers');
  // Branding
  const [primaryColor, setPrimaryColor] = useState('#ff3250');
  const [secondaryColor, setSecondaryColor] = useState('#ffc800');
  const [logoUrl, setLogoUrl] = useState('');
  const [heroImages, setHeroImages] = useState([]);
  const [mediaImages, setMediaImages] = useState([]);
  const [logoUploading, setLogoUploading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
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

  const [configDirty, setConfigDirty] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    loadWebsite();
  }, [workspace?.id]);

  async function loadWebsite() {
    if (!workspace?.id) return;
    setLoading(true);
    try {
      const data = await api.getWebsiteConfig(workspace.id);
      setWebsiteData(data);
      if (data.websiteConfig) {
        const c = data.websiteConfig;
        setBandName(c.bandName || c.band?.name || workspace.name || '');
        setTagline(c.tagline || c.band?.tagline || '');
        setDescription(c.description || c.band?.description || '');
        setLocation(c.location || c.band?.location || '');
        setGenre(c.genre || c.band?.genre || '');
        setFounded(c.founded || c.band?.founded || '');
        setContactEmail(c.contactEmail || c.emails?.info || '');
        setTemplate(c.template || c.theme?.template || 'covers');
        setPrimaryColor(c.theme?.primaryAccent || c.primaryColor || '#ff3250');
        setSecondaryColor(c.theme?.secondaryAccent || c.secondaryColor || '#ffc800');
        setLogoUrl(c.images?.logo || '');
        setHeroImages(c.images?.heroImages || []);
        setMediaImages(c.images?.mediaImages || []);
        // Social — handle both flat and array formats
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
        // Features
        const f = c.features || {};
        setShowSongs(f.songs !== false);
        setShowArchive(f.archive !== false);
        setShowSetlists(f.setlists !== false);
        setShowTimeline(f.timeline !== false);
        setShowMedia(f.media !== false);
        setShowStats(f.stats !== false);
        setShowSongRequests(f.songRequests === true);
        setShowTrivia(f.trivia === true);
        // SEO
        setSeoTitle(c.seo?.title || '');
        setSeoDescription(c.seo?.description || '');
      } else {
        setBandName(workspace.name || '');
      }
    } catch (err) {
      toast.error('Failed to load website config');
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
      emails: {
        info: contactEmail.trim(),
      },
      social: socialArray,
      socialLinks: {
        instagram: instagram.trim(),
        facebook: facebook.trim(),
        youtube: youtube.trim(),
        spotify: spotify.trim(),
      },
      template,
      theme: {
        template,
        primaryAccent: primaryColor,
        secondaryAccent: secondaryColor,
      },
      images: {
        logo: logoUrl || null,
        heroImages,
        mediaImages,
      },
      features: {
        songs: showSongs,
        archive: showArchive,
        setlists: showSetlists,
        timeline: showTimeline,
        media: showMedia,
        stats: showStats,
        songRequests: showSongRequests,
        trivia: showTrivia,
        blog: false,
        community: false,
        merch: false,
      },
      seo: {
        title: seoTitle.trim() || `${bandName.trim()} | Official Website`,
        description: seoDescription.trim() || description.trim(),
      },
    };
  }

  async function handleSaveConfig() {
    if (!bandName.trim()) {
      toast.warning('Band name is required');
      return;
    }
    setSavingConfig(true);
    try {
      await api.updateWebsiteConfig(workspace.id, getConfig());
      toast.success('Website config saved');
      setConfigDirty(false);
      await loadWebsite();
    } catch (err) {
      toast.error(err.message || 'Failed to save config');
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleDeploy() {
    if (!bandName.trim()) {
      toast.warning('Band name is required');
      return;
    }
    setDeploying(true);
    try {
      await api.updateWebsiteConfig(workspace.id, getConfig());
      const result = await api.deployWebsite(workspace.id);
      setWebsiteData(result);
      setConfigDirty(false);
      setDeploySuccessUrl(result.websiteUrl);
      await loadWebsite();
    } catch (err) {
      toast.error(err.message || 'Deployment failed');
    } finally {
      setDeploying(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    try {
      await api.syncWebsite(workspace.id);
      toast.success('Sync triggered — site will rebuild shortly');
    } catch (err) {
      toast.error(err.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDelete() {
    setDeleteLoading(true);
    try {
      await api.deleteWebsite(workspace.id);
      toast.success('Website deleted');
      setWebsiteData(null);
      setDeleteOpen(false);
      await loadWebsite();
    } catch (err) {
      toast.error(err.message || 'Failed to delete website');
    } finally {
      setDeleteLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="animate-spin w-6 h-6 border-2 border-[var(--color-primary)] border-t-transparent rounded-full" />
      </div>
    );
  }

  const isDeployed = websiteData?.websiteEnabled && websiteData?.websiteStatus === 'active';
  const isDeployingStatus = websiteData?.websiteStatus === 'deploying';

  // Deployed state
  if (isDeployed) {
    return (
      <div className="space-y-6">
        {renderDeploySuccessModal()}
        {/* Status card */}
        <div className="bg-[var(--color-modal-card)] rounded-lg p-5 border border-[var(--color-modal-border)]">
          <div className="flex items-center gap-3 mb-3">
            <span className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-semibold text-green-400">Active</span>
          </div>
          <a
            href={websiteData.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-primary)] hover:underline text-lg font-medium break-all"
          >
            {websiteData.websiteUrl}
          </a>
          {websiteData.websiteDeployedAt && (
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              Last deployed: {new Date(websiteData.websiteDeployedAt).toLocaleString()}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <a
            href={websiteData.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn bg-[var(--color-primary)] hover:opacity-90 text-white min-h-[44px] px-4"
          >
            View Site
          </a>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="btn btn-secondary min-h-[44px] px-4"
          >
            {syncing ? 'Syncing...' : 'Sync Now'}
          </button>
          <button
            onClick={() => setDeleteOpen(true)}
            className="btn bg-red-600/20 text-red-400 hover:bg-red-600/30 min-h-[44px] px-4"
          >
            Delete Website
          </button>
        </div>

        {/* Config form for editing */}
        <div className="border-t border-[var(--color-modal-border)] pt-6">
          <h4 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-4">Edit Configuration</h4>
          {renderConfigForm()}
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleSaveConfig}
              disabled={savingConfig || !bandName.trim()}
              className="btn bg-[var(--color-primary)] hover:opacity-90 text-white min-h-[44px] px-4"
            >
              {savingConfig ? 'Saving...' : 'Save Config'}
            </button>
            <button
              onClick={handleDeploy}
              disabled={deploying || !bandName.trim()}
              className="btn btn-secondary min-h-[44px] px-4"
            >
              {deploying ? 'Deploying...' : 'Save & Redeploy'}
            </button>
          </div>
        </div>

        <ConfirmDialog
          isOpen={deleteOpen}
          onClose={() => setDeleteOpen(false)}
          onConfirm={handleDelete}
          title="Delete Website"
          message="This will permanently remove the website, Vercel project, and GitHub repository. This action cannot be undone."
          confirmText={deleteLoading ? 'Deleting...' : 'Delete Website'}
          variant="danger"
        />
      </div>
    );
  }

  // Not yet deployed — show empty state + config form
  return (
    <div className="space-y-6">
      {renderDeploySuccessModal()}
      {!websiteData?.websiteConfig && !isDeployingStatus && (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="text-5xl mb-4">🌐</div>
          <h3 className="text-lg font-medium text-[var(--color-text-primary)] mb-2">
            Launch Your Band Website
          </h3>
          <p className="text-[var(--color-text-muted)] max-w-md mb-4">
            Get a professional website for your band in minutes. Your website automatically stays
            in sync with your BandChat data — gigs, members, songs, setlists, and photos all
            update automatically.
          </p>
        </div>
      )}

      {isDeployingStatus && (
        <div className="bg-yellow-900/30 border border-yellow-600/50 rounded-lg p-4 flex items-center gap-3">
          <div className="animate-spin w-5 h-5 border-2 border-yellow-400 border-t-transparent rounded-full" />
          <span className="text-yellow-300 text-sm">Setting up your website... This usually takes about 60 seconds.</span>
        </div>
      )}

      {websiteData?.websiteStatus === 'error' && (
        <div className="bg-red-900/30 border border-red-600/50 rounded-lg p-4">
          <span className="text-red-300 text-sm">Something went wrong. We couldn't deploy your website. This is usually temporary.</span>
        </div>
      )}

      {renderConfigForm()}

      <div className="flex gap-3">
        <button
          onClick={handleDeploy}
          disabled={deploying || !bandName.trim()}
          className="btn bg-green-600 hover:bg-green-700 text-white min-h-[44px] px-6"
        >
          {deploying ? 'Deploying...' : websiteData?.websiteConfig ? 'Deploy Website' : 'Create & Deploy Website'}
        </button>
        {websiteData?.websiteEnabled && (
          <button
            onClick={() => setDeleteOpen(true)}
            className="btn bg-red-600/20 text-red-400 hover:bg-red-600/30 min-h-[44px] px-4"
          >
            Delete Website
          </button>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Website"
        message="This will permanently remove the website, Vercel project, and GitHub repository. This action cannot be undone."
        confirmText={deleteLoading ? 'Deleting...' : 'Delete Website'}
        variant="danger"
      />
    </div>
  );

  function renderDeploySuccessModal() {
    if (!deploySuccessUrl) return null;
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60" onClick={() => setDeploySuccessUrl(null)}>
        <div className="bg-[var(--color-modal-bg)] rounded-xl p-8 max-w-md w-full mx-4 text-center shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="text-5xl mb-4">🎉</div>
          <h3 className="text-xl font-bold text-[var(--color-text-primary)] mb-2">Website Deployed!</h3>
          <p className="text-[var(--color-text-muted)] mb-4">
            Your site is being built and will be live in 2-3 minutes at:
          </p>
          <a
            href={deploySuccessUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[var(--color-primary)] font-semibold text-lg hover:underline break-all"
          >
            {deploySuccessUrl}
          </a>
          <p className="text-xs text-[var(--color-text-muted)] mt-4">
            The first build takes a little longer. Future updates will be faster.
          </p>
          <button
            onClick={() => setDeploySuccessUrl(null)}
            className="btn bg-[var(--color-primary)] hover:opacity-90 text-white min-h-[44px] px-6 mt-6"
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  function renderConfigForm() {
    const dirty = (setter) => (e) => { setter(e.target.value); setConfigDirty(true); };
    const dirtyCheck = (setter) => (e) => { setter(e.target.checked); setConfigDirty(true); };

    async function handleDropUpload(files, setter) {
      const imageFiles = [...files].filter(f => f.type.startsWith('image/'));
      if (!imageFiles.length) return;
      setImageUploading(true);
      try {
        const urls = [];
        for (const file of imageFiles) {
          const result = await api.uploadFile(file, workspace.id);
          urls.push(result.url);
        }
        setter(prev => [...prev, ...urls]);
        setConfigDirty(true);
      } catch (err) {
        toast.error('Failed to upload image(s)');
      } finally {
        setImageUploading(false);
      }
    }

    return (
      <div className="space-y-6">
        {/* Band Identity */}
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">Band Identity</h4>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[var(--color-text-muted)] mb-1 block">Band Name *</label>
              <input type="text" value={bandName} onChange={dirty(setBandName)} className="modal-input w-full" placeholder="Your band name" maxLength={500} />
            </div>
            <div>
              <label className="text-sm text-[var(--color-text-muted)] mb-1 block">Tagline</label>
              <input type="text" value={tagline} onChange={dirty(setTagline)} className="modal-input w-full" placeholder="e.g. Tokyo's Premier Rock Covers Band" maxLength={500} />
            </div>
            <div>
              <label className="text-sm text-[var(--color-text-muted)] mb-1 block">About</label>
              <textarea value={description} onChange={dirty(setDescription)} className="modal-input w-full min-h-[80px] resize-y" placeholder="Tell people about your band" maxLength={2000} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-sm text-[var(--color-text-muted)] mb-1 block">Location</label>
                <input type="text" value={location} onChange={dirty(setLocation)} className="modal-input w-full" placeholder="Tokyo, Japan" maxLength={200} />
              </div>
              <div>
                <label className="text-sm text-[var(--color-text-muted)] mb-1 block">Genre</label>
                <input type="text" value={genre} onChange={dirty(setGenre)} className="modal-input w-full" placeholder="Rock Covers" maxLength={200} />
              </div>
              <div>
                <label className="text-sm text-[var(--color-text-muted)] mb-1 block">Founded</label>
                <input type="number" value={founded} onChange={dirty(setFounded)} className="modal-input w-full" placeholder="2024" min={1900} max={2100} />
              </div>
            </div>
          </div>
        </div>

        {/* Template / Genre */}
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">Design Template</h4>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">Choose a style that fits your band's vibe</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => { setTemplate(t.id); setConfigDirty(true); }}
                className={`relative rounded-lg p-3 text-left transition-all border-2 ${
                  template === t.id
                    ? 'border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]'
                    : 'border-transparent hover:border-[var(--color-modal-border)]'
                }`}
                style={{ background: t.bg }}
              >
                <div className="flex gap-1.5 mb-2">
                  <span className="w-4 h-4 rounded-full" style={{ background: t.accent }} />
                  <span className="w-4 h-4 rounded-full" style={{ background: t.accent2 }} />
                </div>
                <span className={`text-sm font-semibold block ${t.light ? 'text-gray-800' : 'text-white'}`}>{t.label}</span>
                <span className={`text-xs block mt-0.5 ${t.light ? 'text-gray-500' : 'text-gray-400'}`}>{t.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Branding */}
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">Branding</h4>
          <div className="flex gap-6 mb-4">
            <div>
              <label className="text-sm text-[var(--color-text-muted)] mb-1 block">Primary Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={primaryColor} onChange={dirty(setPrimaryColor)} className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
                <input type="text" value={primaryColor} onChange={dirty(setPrimaryColor)} className="modal-input w-24 text-sm" maxLength={7} />
              </div>
            </div>
            <div>
              <label className="text-sm text-[var(--color-text-muted)] mb-1 block">Secondary Color</label>
              <div className="flex items-center gap-2">
                <input type="color" value={secondaryColor} onChange={dirty(setSecondaryColor)} className="w-10 h-10 rounded cursor-pointer border-0 p-0" />
                <input type="text" value={secondaryColor} onChange={dirty(setSecondaryColor)} className="modal-input w-24 text-sm" maxLength={7} />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Logo Upload */}
            <div>
              <label className="text-sm text-[var(--color-text-muted)] mb-1 block">Logo</label>
              {logoUrl ? (
                <div className="relative inline-block">
                  <img src={logoUrl} alt="Logo" className="w-24 h-24 object-contain rounded-lg bg-[var(--color-modal-card)] border border-[var(--color-modal-border)]" />
                  <button
                    onClick={() => { setLogoUrl(''); setConfigDirty(true); }}
                    className="absolute -top-2 -right-2 w-6 h-6 bg-red-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-700"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <label className={`flex items-center justify-center w-24 h-24 rounded-lg border-2 border-dashed border-[var(--color-modal-border)] cursor-pointer hover:border-[var(--color-primary)] transition-colors ${logoUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setLogoUploading(true);
                      try {
                        const result = await api.uploadFile(file, workspace.id);
                        setLogoUrl(result.url);
                        setConfigDirty(true);
                      } catch (err) {
                        toast.error('Failed to upload logo');
                      } finally {
                        setLogoUploading(false);
                      }
                    }}
                  />
                  <span className="text-[var(--color-text-muted)] text-xs text-center px-2">
                    {logoUploading ? 'Uploading...' : 'Upload logo'}
                  </span>
                </label>
              )}
            </div>
            {/* Hero Images */}
            <div
              onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-[var(--color-primary)]'); }}
              onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-[var(--color-primary)]'); }}
              onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('ring-2', 'ring-[var(--color-primary)]'); handleDropUpload(e.dataTransfer.files, setHeroImages); }}
              className="rounded-lg p-3 transition-all"
            >
              <label className="text-sm text-[var(--color-text-muted)] mb-1 block">Hero Images</label>
              <p className="text-xs text-[var(--color-text-muted)] mb-2">Full-width background images that rotate on the homepage. Drag & drop or click to add. Recommended: 1920x1080px.</p>
              <div className="flex flex-wrap gap-2">
                {heroImages.map((url, i) => (
                  <div key={url} className="relative">
                    <img src={url} alt={`Hero ${i + 1}`} className="w-28 h-20 object-cover rounded-lg border border-[var(--color-modal-border)]" />
                    <button
                      onClick={() => { setHeroImages(prev => prev.filter((_, j) => j !== i)); setConfigDirty(true); }}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-700"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <label className={`flex items-center justify-center w-28 h-20 rounded-lg border-2 border-dashed border-[var(--color-modal-border)] cursor-pointer hover:border-[var(--color-primary)] transition-colors ${imageUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = [...(e.target.files || [])];
                      if (!files.length) return;
                      setImageUploading(true);
                      try {
                        const urls = [];
                        for (const file of files) {
                          const result = await api.uploadFile(file, workspace.id);
                          urls.push(result.url);
                        }
                        setHeroImages(prev => [...prev, ...urls]);
                        setConfigDirty(true);
                      } catch (err) {
                        toast.error('Failed to upload image(s)');
                      } finally {
                        setImageUploading(false);
                      }
                    }}
                  />
                  <span className="text-[var(--color-text-muted)] text-xs text-center px-1">
                    {imageUploading ? '...' : '+ Add'}
                  </span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Contact & Social */}
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">Contact & Social</h4>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[var(--color-text-muted)] mb-1 block">Contact Email</label>
              <input type="email" value={contactEmail} onChange={dirty(setContactEmail)} className="modal-input w-full" placeholder="bookings@yourband.com" maxLength={500} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="url" value={instagram} onChange={dirty(setInstagram)} className="modal-input w-full" placeholder="Instagram URL" />
              <input type="url" value={facebook} onChange={dirty(setFacebook)} className="modal-input w-full" placeholder="Facebook URL" />
              <input type="url" value={youtube} onChange={dirty(setYoutube)} className="modal-input w-full" placeholder="YouTube URL" />
              <input type="url" value={spotify} onChange={dirty(setSpotify)} className="modal-input w-full" placeholder="Spotify URL" />
            </div>
          </div>
        </div>

        {/* Features */}
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">Website Pages</h4>
          <p className="text-xs text-[var(--color-text-muted)] mb-3">Choose which pages to show on your website. Shows and About are always included.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Songs', showSongs, setShowSongs],
              ['Gig Archive', showArchive, setShowArchive],
              ['Setlists', showSetlists, setShowSetlists],
              ['Timeline', showTimeline, setShowTimeline],
              ['Media', showMedia, setShowMedia],
              ['Stats', showStats, setShowStats],
              ['Song Requests', showSongRequests, setShowSongRequests],
              ['Trivia', showTrivia, setShowTrivia],
            ].map(([label, value, setter]) => (
              <label key={label} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={value} onChange={dirtyCheck(setter)} className="w-4 h-4 rounded accent-[var(--color-primary)]" />
                <span className="text-sm text-[var(--color-text-primary)]">{label}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Media Photos */}
        <div
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('ring-2', 'ring-[var(--color-primary)]'); }}
          onDragLeave={(e) => { e.currentTarget.classList.remove('ring-2', 'ring-[var(--color-primary)]'); }}
          onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('ring-2', 'ring-[var(--color-primary)]'); handleDropUpload(e.dataTransfer.files, setMediaImages); }}
          className="rounded-lg p-3 transition-all"
        >
          <h4 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">Media Photos</h4>
          <p className="text-xs text-[var(--color-text-muted)] mb-2">Drag & drop or click to add. Gig photos from BandChat sync automatically.</p>
          <div className="flex flex-wrap gap-2">
            {mediaImages.map((url, i) => (
              <div key={url} className="relative">
                <img src={url} alt={`Media ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-[var(--color-modal-border)]" />
                <button
                  onClick={() => { setMediaImages(prev => prev.filter((_, j) => j !== i)); setConfigDirty(true); }}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-600 text-white rounded-full text-xs flex items-center justify-center hover:bg-red-700"
                >
                  &times;
                </button>
              </div>
            ))}
            <label className={`flex items-center justify-center w-20 h-20 rounded-lg border-2 border-dashed border-[var(--color-modal-border)] cursor-pointer hover:border-[var(--color-primary)] transition-colors ${imageUploading ? 'opacity-50 pointer-events-none' : ''}`}>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = [...(e.target.files || [])];
                  if (!files.length) return;
                  setImageUploading(true);
                  try {
                    const urls = [];
                    for (const file of files) {
                      const result = await api.uploadFile(file, workspace.id);
                      urls.push(result.url);
                    }
                    setMediaImages(prev => [...prev, ...urls]);
                    setConfigDirty(true);
                  } catch (err) {
                    toast.error('Failed to upload image(s)');
                  } finally {
                    setImageUploading(false);
                  }
                }}
              />
              <span className="text-[var(--color-text-muted)] text-xs text-center px-1">
                {imageUploading ? '...' : '+ Add'}
              </span>
            </label>
          </div>
        </div>

        {/* SEO */}
        <div>
          <h4 className="text-sm font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-3">SEO</h4>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-[var(--color-text-muted)] mb-1 block">Page Title</label>
              <input type="text" value={seoTitle} onChange={dirty(setSeoTitle)} className="modal-input w-full" placeholder={`${bandName || 'Your Band'} | Official Website`} maxLength={200} />
            </div>
            <div>
              <label className="text-sm text-[var(--color-text-muted)] mb-1 block">Meta Description</label>
              <input type="text" value={seoDescription} onChange={dirty(setSeoDescription)} className="modal-input w-full" placeholder="Brief description for search engines" maxLength={300} />
            </div>
          </div>
        </div>
      </div>
    );
  }
}
