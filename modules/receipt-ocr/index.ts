import { requireOptionalNativeModule } from 'expo';

export type OcrLine = { text: string; x: number; y: number; w: number; h: number };

// Expo Go にはこの部品が入っていないので null になる（App Store 版・TestFlight 版で使える）
const Native = requireOptionalNativeModule<{ recognize(uri: string): Promise<OcrLine[]> }>('ReceiptOcr');

export const ocrAvailable = !!Native;

export async function recognizeReceipt(uri: string): Promise<OcrLine[] | null> {
  if (!Native) return null;
  return Native.recognize(uri);
}
