// 有料機能：トリップパス（その旅だけ・買い切り）と Tripfold Plus（年額・全部の旅）
// ストアの部品（expo-iap）が入っていない古いアプリ・Web では、課金なしで全部使える
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { requireOptionalNativeModule } from 'expo';
import type { Trip } from './data';

export const SKU_PASS = 'com.fukuda.tripfold.trippass';
export const SKU_PLUS = 'com.fukuda.tripfold.plus.yearly';
export const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

const NATIVE = Platform.OS !== 'web' && !!requireOptionalNativeModule('ExpoIap');
// 画面確認用（Webで購入画面を出す）。本番では使わない
export const IAP_AVAILABLE = NATIVE || process.env.EXPO_PUBLIC_PAYWALL_DEMO === '1';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const iap: any = NATIVE ? require('expo-iap') : null;

/** 無料で共有できる写真の枚数（1つの旅につき） */
export const FREE_SHARED_PHOTOS = 20;

const K_PLUS = 'tf.plus.v1';

/** その旅で有料機能が使えるか */
export const unlocked = (trip: Trip | undefined, plus: boolean) => !IAP_AVAILABLE || plus || !!trip?.pass;

export type Prices = { pass?: string; plus?: string };

/**
 * 課金の状態と操作
 * onPass: トリップパスが買えたとき、どの旅に付けるか（買う前に覚えておいた旅）
 */
export function usePlus(onPass: (tripId: string) => void) {
  const [plus, setPlus] = useState(false);
  const [prices, setPrices] = useState<Prices>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const passFor = useRef<string | null>(null);
  const onPassRef = useRef(onPass);
  onPassRef.current = onPass;

  const check = async () => {
    if (!iap) return;
    try {
      const on = !!(await iap.hasActiveSubscriptions([SKU_PLUS]));
      setPlus(on);
      AsyncStorage.setItem(K_PLUS, on ? '1' : '0').catch(() => {});
    } catch {}
  };

  useEffect(() => {
    if (!iap) return;
    let subs: { remove: () => void }[] = [];
    (async () => {
      if ((await AsyncStorage.getItem(K_PLUS).catch(() => null)) === '1') setPlus(true);
      try {
        await iap.initConnection();
        subs = [
          iap.purchaseUpdatedListener(async (p: any) => {
            const isPass = p?.productId === SKU_PASS || p?.id === SKU_PASS;
            // パスは先に旅へ付けてから、取引を終える（途中で落ちても買ったものが消えないように）
            if (isPass && passFor.current) {
              onPassRef.current(passFor.current);
              passFor.current = null;
            }
            try {
              await iap.finishTransaction({ purchase: p, isConsumable: isPass });
            } catch {}
            setBusy(false);
            if (!isPass) await check();
          }),
          iap.purchaseErrorListener((e: any) => {
            setBusy(false);
            passFor.current = null;
            if (!iap.isUserCancelledError?.(e)) setError('buy');
          }),
        ];
        const [subsP, inapp] = await Promise.all([
          iap.fetchProducts({ skus: [SKU_PLUS], type: 'subs' }).catch(() => []),
          iap.fetchProducts({ skus: [SKU_PASS], type: 'in-app' }).catch(() => []),
        ]);
        setPrices({ plus: subsP?.[0]?.displayPrice, pass: inapp?.[0]?.displayPrice });
        await check();
      } catch {}
    })();
    const app = AppState.addEventListener('change', (st) => {
      if (st === 'active') check();
    });
    return () => {
      subs.forEach((s) => s.remove());
      app.remove();
      iap.endConnection?.().catch?.(() => {});
    };
  }, []);

  const buyPass = async (tripId: string) => {
    if (!iap) return;
    setError('');
    setBusy(true);
    passFor.current = tripId;
    try {
      await iap.requestPurchase({ request: { apple: { sku: SKU_PASS }, google: { skus: [SKU_PASS] } }, type: 'in-app' });
    } catch {
      setBusy(false);
      passFor.current = null;
      setError('buy');
    }
  };
  const buyPlus = async () => {
    if (!iap) return;
    setError('');
    setBusy(true);
    try {
      await iap.requestPurchase({ request: { apple: { sku: SKU_PLUS }, google: { skus: [SKU_PLUS] } }, type: 'subs' });
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
  return { plus, prices, busy, error, buyPass, buyPlus, restore, manage, storeAvailable: NATIVE };
}
export type PlusApi = ReturnType<typeof usePlus>;
