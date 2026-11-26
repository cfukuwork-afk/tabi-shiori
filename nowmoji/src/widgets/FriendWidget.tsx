// 1人のウィジェット：ロック画面の丸・ホーム画面の小
// この関数はウィジェットの中だけで動く（外の変数・関数は使えない）
import { AccessoryWidgetBackground, Image, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, frame, lineLimit, minimumScaleFactor, padding, resizable, aspectRatio, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type FPerson = { n: string; c: string; bg: string; k: string; img: string; t: string; w: string; g: string; np?: boolean };
export type FriendWidgetProps = { people: Record<string, FPerson>; order: string[]; empty: string; theme?: string };

const FriendWidget = (p: FriendWidgetProps, env: WidgetEnvironment<{ person: string }>) => {
  'widget';
  const paper = p.theme || '#FFFDF8';
  const dark = paper === '#2F3550';
  const ink = dark ? '#FFFFFF' : '#2B2633';
  const sub = dark ? '#C9CCE0' : '#8A8396';
  const want = (env as any).configuration?.person || '';
  const key = want && p.people[want] ? want : p.order[0];
  const x = key ? p.people[key] : null;
  const url = x ? `nowmoji://g/${x.g}` : 'nowmoji://';

  if (env.widgetFamily === 'accessoryCircular') {
    return (
      <ZStack modifiers={[widgetURL(url)]}>
        <AccessoryWidgetBackground />
        <VStack spacing={0}>
          {x?.img ? (
            <Image uiImage={x.img} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 34, height: 30 })]} />
          ) : (
            <Text modifiers={[font({ size: 13, weight: 'heavy' }), lineLimit(1), minimumScaleFactor(0.35), padding({ horizontal: 4 })]}>{x ? x.k || '·' : '(´ω`)'}</Text>
          )}
          <Text modifiers={[font({ size: 9, weight: 'semibold' }), lineLimit(1), minimumScaleFactor(0.7)]}>{x ? x.n : ''}</Text>
        </VStack>
      </ZStack>
    );
  }
  if (!x) {
    return (
      <VStack spacing={6} modifiers={[containerBackground(paper, 'widget'), widgetURL(url)]}>
        <Text modifiers={[font({ size: 26, weight: 'heavy' }), foregroundStyle(ink)]}>(´ω`)</Text>
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(sub), lineLimit(2)]}>{p.empty}</Text>
      </VStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={4} modifiers={[containerBackground(p.theme && p.theme !== '#FFFDF8' ? paper : x.bg, 'widget'), widgetURL(url)]}>
      <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(x.c), lineLimit(1)]}>{x.n}</Text>
      <Spacer />
      <VStack modifiers={[frame({ maxWidth: 9999 })]}>
        {x.img ? (
          <Image uiImage={x.img} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 78, height: 70 })]} />
        ) : (
          <Text modifiers={[font({ size: 28, weight: 'heavy' }), foregroundStyle(x.np ? sub : ink), lineLimit(1), minimumScaleFactor(0.3)]}>{x.k || '·'}</Text>
        )}
      </VStack>
      <Spacer />
      <Text modifiers={[font({ size: 12 }), foregroundStyle(x.np ? sub : ink), lineLimit(1), minimumScaleFactor(0.8)]}>{x.w}</Text>
      <Text modifiers={[font({ size: 10 }), foregroundStyle(sub)]}>{x.t}</Text>
    </VStack>
  );
};

export default createWidget<FriendWidgetProps, { person: string }>('FriendMood', FriendWidget, { people: {}, order: [], empty: 'Nowmoji' });
