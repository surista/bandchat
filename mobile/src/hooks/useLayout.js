import { useWindowDimensions, Platform } from 'react-native';

const TABLET_BREAKPOINT = 768;
const CONTENT_MAX_WIDTH = 700;
export const MODAL_MAX_WIDTH = 500;
const SIDEBAR_WIDTH = 320;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT || Platform.isPad;
  const isLandscape = width > height;

  return {
    isTablet,
    isLandscape,
    screenWidth: width,
    screenHeight: height,
    contentMaxWidth: isTablet ? CONTENT_MAX_WIDTH : undefined,
    modalMaxWidth: isTablet ? MODAL_MAX_WIDTH : undefined,
    sidebarWidth: isTablet ? SIDEBAR_WIDTH : undefined,
    // Tablet-scaled sizes
    listItemPaddingH: isTablet ? 20 : 16,
    listItemPaddingV: isTablet ? 14 : 10,
    attachmentWidth: isTablet ? 300 : 200,
    attachmentHeight: isTablet ? 225 : 150,
  };
}
