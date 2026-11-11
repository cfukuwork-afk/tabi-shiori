// ホーム画面・ロック画面のウィジェット：次の予定（あと何日・時刻・予約番号）
// この関数はウィジェットの中だけで動く（外の変数・関数は使えない）
import { HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { containerBackground, font, foregroundStyle, lineLimit, padding, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type NextWidgetProps = {
  kicker: string; // 「あと3日」「今日」など
  type: string; // 飛行機・電車…
  title: string;
  sub: string; // 東京 → 京都 など
  when: string; // 12/1(火) 08:31
  code: string;
  codeLabel: string;
  trip: string;
  empty: string; // 予定がないときの文
};

const NextWidget = (p: NextWidgetProps, env: WidgetEnvironment) => {
  'widget';
  const ink = '#15171C';
  const accent = '#FF5B3A';
  const sub = '#9CA0A8';
  const fam = env.widgetFamily;
  if (fam === 'accessoryRectangular' || fam === 'accessoryInline') {
    if (!p.title) return <Text>{p.empty}</Text>;
    return (
      <VStack alignment="leading" spacing={1}>
        <Text modifiers={[font({ size: 12, weight: 'bold' })]}>{`${p.kicker} · ${p.when}`}</Text>
        <Text modifiers={[font({ size: 14, weight: 'heavy' }), lineLimit(1)]}>{p.title}</Text>
        {p.code ? <Text modifiers={[font({ size: 12, design: 'monospaced' }), lineLimit(1)]}>{p.code}</Text> : <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>{p.sub}</Text>}
      </VStack>
    );
  }
  if (!p.title) {
    return (
      <VStack alignment="leading" spacing={4} modifiers={[containerBackground(ink, 'widget'), widgetURL('tripfold://')]}>
        <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(accent)]}>Tripfold</Text>
        <Spacer />
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundStyle('#FFFFFF')]}>{p.empty}</Text>
      </VStack>
    );
  }
  if (fam === 'systemMedium' || fam === 'systemLarge') {
    return (
      <HStack spacing={12} modifiers={[containerBackground(ink, 'widget'), widgetURL('tripfold://')]}>
        <VStack alignment="leading" spacing={3}>
          <Text modifiers={[font({ size: 12, weight: 'heavy' }), foregroundStyle(accent)]}>{`${p.kicker} · ${p.type}`}</Text>
          <Text modifiers={[font({ size: 19, weight: 'heavy' }), foregroundStyle('#FFFFFF'), lineLimit(2)]}>{p.title}</Text>
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundStyle(sub), lineLimit(1)]}>{p.sub}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 15, weight: 'bold' }), foregroundStyle('#FFFFFF')]}>{p.when}</Text>
        </VStack>
        <Spacer />
        <VStack alignment="trailing" spacing={2}>
          <Text modifiers={[font({ size: 11, weight: 'bold' }), foregroundStyle(sub)]}>{p.code ? p.codeLabel : ''}</Text>
          <Text modifiers={[font({ size: 20, weight: 'heavy', design: 'monospaced' }), foregroundStyle('#FFFFFF'), lineLimit(1)]}>{p.code}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(sub), lineLimit(1)]}>{p.trip}</Text>
        </VStack>
      </HStack>
    );
  }
  return (
    <VStack alignment="leading" spacing={3} modifiers={[containerBackground(ink, 'widget'), widgetURL('tripfold://')]}>
      <Text modifiers={[font({ size: 12, weight: 'heavy' }), foregroundStyle(accent)]}>{p.kicker}</Text>
      <Text modifiers={[font({ size: 16, weight: 'heavy' }), foregroundStyle('#FFFFFF'), lineLimit(2)]}>{p.title}</Text>
      <Text modifiers={[font({ size: 11, weight: 'semibold' }), foregroundStyle(sub), lineLimit(1)]}>{p.sub}</Text>
      <Spacer />
      <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle('#FFFFFF')]}>{p.when}</Text>
      {p.code ? <Text modifiers={[font({ size: 13, weight: 'heavy', design: 'monospaced' }), foregroundStyle('#FFFFFF'), lineLimit(1), padding({ top: 1 })]}>{p.code}</Text> : <Text> </Text>}
    </VStack>
  );
};

export default createWidget<NextWidgetProps>('NextTrip', NextWidget, {
  kicker: '',
  type: '',
  title: '',
  sub: '',
  when: '',
  code: '',
  codeLabel: '',
  trip: '',
  empty: 'Tripfold',
});
