import { useWindowDimensions, Platform } from 'react-native';

const TABLET_BREAKPOINT = 768;
const CONTENT_MAX_WIDTH_PORTRAIT = 700;
const CONTENT_MAX_WIDTH_LANDSCAPE = 920;
export const MODAL_MAX_WIDTH = 500;
const SIDEBAR_WIDTH_PORTRAIT = 320;
const SIDEBAR_WIDTH_LANDSCAPE = 380;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT || Platform.isPad;
  const isLandscape = width > height;
  const isTabletLandscape = isTablet && isLandscape;
  // Split view activates on iPad. The threshold (720pt) covers common Stage Manager
  // and Split View multitasking widths — e.g. 11" iPad 2/3 (692pt) and 12.9" iPad 1/2 (678pt)
  // just miss, but 11" 2/3 portrait split (834pt) and full landscape (1180pt+) fit cleanly.
  // Still iPad-only to avoid iPhone Split View (max 414pt) and to keep Android behavior
  // unchanged until we explicitly design for foldables / tablets.
  // Known gap: narrower Stage Manager windows fall back to single-pane; contentMaxWidth
  // still applies via isTablet so they don't stretch across the whole width.
  const isSplitView = Platform.OS === 'ios' && Platform.isPad === true && width >= 720;

  return {
    isTablet,
    isLandscape,
    isTabletLandscape,
    isSplitView,
    screenWidth: width,
    screenHeight: height,
    // Wider content area on tablet landscape so ultra-wide iPads don't
    // sit as a narrow column with large empty gutters
    contentMaxWidth: isTablet
      ? (isLandscape ? CONTENT_MAX_WIDTH_LANDSCAPE : CONTENT_MAX_WIDTH_PORTRAIT)
      : undefined,
    modalMaxWidth: isTablet ? MODAL_MAX_WIDTH : undefined,
    sidebarWidth: isTablet
      ? (isLandscape ? SIDEBAR_WIDTH_LANDSCAPE : SIDEBAR_WIDTH_PORTRAIT)
      : undefined,
    // Tablet-scaled sizes
    listItemPaddingH: isTablet ? 20 : 16,
    listItemPaddingV: isTablet ? 14 : 10,
    attachmentWidth: isTablet ? 320 : 200,
    attachmentHeight: isTablet ? 240 : 150,
  };
}
