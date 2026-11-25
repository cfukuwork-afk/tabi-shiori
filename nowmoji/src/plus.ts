// Nowmoji Plus（月額・年額の自動更新サブスク）
// ストアの部品（expo-iap）がない環境（Web・古いアプリ）では、購入画面は出ない
import { useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';

export const SKU_MONTH = 'com.fukuda.nowmoji.plus.monthly';
export const SKU_YEAR = 'com.fukuda.nowmoji.plus.yearly';
export const EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const NATIVE = Platform.OS !== 'web' && !!requireOptionalNativeModule('ExpoIap');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const iap: any = NATIVE ? require('expo-iap') : null;
const K_PLUS = 'nm.plus.v1';

export type Prices = { month?: string; year?: string; trial?: boolean };

export function usePlus(onChange?: (on: boolean) => void) {
  const [plus, setPlus] = useState(false);
  const [prices, setPrices] = useState<Prices>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const check = async () => {
    if (!iap) return;
    try {
      const on = !!(await iap.hasActiveSubscriptions([SKU_MONTH, SKU_YEAR]));
      setPlus((was) => {
        if (was !== on) onChange?.(on);
        return on;
      });
      AsyncStorage.setItem(K_PLUS, on ? '1' : '0').catch(() => {});
    } catch {}
  };

  useEffect(() => {
    let subs: { remove: () => void }[] = [];
    (async () => {
      if ((await AsyncStorage.getItem(K_PLUS).catch(() => null)) === '1') setPlus(true);
      if (!iap) return;
      try {
        await iap.initConnection();
        subs = [
          iap.purchaseUpdatedListener(async (p: any) => {
            try {
              await iap.finishTransaction({ purchase: p, isConsumable: false });
            } catch {}
            setBusy(false);
            await check();
          }),
          iap.purchaseErrorListener((e: any) => {
            setBusy(false);
            if (!iap.isUserCancelledError?.(e)) setError('buy');
          }),
        ];
        const list = await iap.fetchProducts({ skus: [SKU_MONTH, SKU_YEAR], type: 'subs' }).catch(() => []);
        const find = (id: string) => (list || []).find((x: any) => x.id === id || x.productId === id);
        const y = find(SKU_YEAR);
        const trial = !!(y?.subscriptionInfoIOS?.introductoryOffer || y?.introductoryPriceIOS || y?.subscription?.introductoryOffer);
        setPrices({ month: find(SKU_MONTH)?.displayPrice, year: y?.displayPrice, trial });
        await check();
      } catch {}
    })();
    const app = AppState.addEventListener('change', (st) => st === 'active' && check());
    return () => {
      subs.forEach((s) => s.remove());
      app.remove();
      iap?.endConnection?.().catch?.(() => {});
    };
  }, []);

  const buy = async (sku: string) => {
    if (!iap) return;
    setError('');
    setBusy(true);
    try {
      await iap.requestPurchase({ request: { apple: { sku }, google: { skus: [sku] } }, type: 'subs' });
    } catch {
      setBusy(false);
      setError('buy');
    }
  };
  const restore = async () => {
    if (!iap) return;
    setBusy(true);
    try {
      await iap.restorePurchases?.();
    } catch {}
    await check();
    setBusy(false);
  };
  const manage = () => {
    if (iap?.deepLinkToSubscriptions) iap.deepLinkToSubscriptions({}).catch(() => Linking.openURL('https://apps.apple.com/account/subscriptions'));
    else Linking.openURL('https://apps.apple.com/account/subscriptions');
  };
  return { plus, prices, busy, error, buy, restore, manage, storeAvailable: NATIVE };
}
export type PlusApi = ReturnType<typeof usePlus>;
