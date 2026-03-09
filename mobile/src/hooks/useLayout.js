import { useWindowDimensions } from 'react-native';

const TABLET_BREAKPOINT = 768;
const CONTENT_MAX_WIDTH = 700;
export const MODAL_MAX_WIDTH = 500;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  const isLandscape = width > height;

  return {
    isTablet,
    isLandscape,
    screenWidth: width,
    screenHeight: height,
    contentMaxWidth: isTablet ? CONTENT_MAX_WIDTH : undefined,
    modalMaxWidth: isTablet ? MODAL_MAX_WIDTH : undefined,
  };
}
