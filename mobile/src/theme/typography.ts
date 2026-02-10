export type FontSizePreset = 'small' | 'medium' | 'large' | 'xlarge';

export interface FontSizes {
  xs: number;
  sm: number;
  md: number;
  lg: number;
  xl: number;
  xxl: number;
  xxxl: number;
}

const FONT_SIZE_SCALES: Record<FontSizePreset, FontSizes> = {
  small: {
    xs: 10,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 30,
  },
  medium: {
    xs: 11,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 22,
    xxl: 28,
    xxxl: 34,
  },
  large: {
    xs: 13,
    sm: 15,
    md: 17,
    lg: 19,
    xl: 24,
    xxl: 32,
    xxxl: 38,
  },
  xlarge: {
    xs: 15,
    sm: 17,
    md: 19,
    lg: 22,
    xl: 28,
    xxl: 36,
    xxxl: 44,
  },
};

export function getFontSizes(preset: FontSizePreset): FontSizes {
  return FONT_SIZE_SCALES[preset];
}
