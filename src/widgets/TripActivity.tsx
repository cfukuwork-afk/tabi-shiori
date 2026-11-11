// ロック画面・ダイナミックアイランドのライブアクティビティ：出発まであと◯分・搭乗口・座席
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { activityBackgroundTint, font, foregroundStyle, lineLimit, padding } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

export type TripActivityProps = {
  icon: string; // SF Symbol（airplane / tram.fill など）
  title: string; // NH 211
  from: string;
  to: string;
  at: number; // 出発の時刻（ミリ秒）
  time: string; // 08:31（現地）
  seatLabel: string;
  seat: string;
  codeLabel: string;
  code: string;
  leftLabel: string; // 「出発まで」
};

const TripActivity = (p: TripActivityProps, env: LiveActivityEnvironment) => {
  'widget';
  const accent = '#FF5B3A';
  const sub = '#9CA0A8';
  const white = env.isLuminanceReduced ? '#DDDDDD' : '#FFFFFF';
  const at = new Date(p.at);
  const icon = p.icon as any;
  return {
    banner: (
      <VStack alignment="leading" spacing={6} modifiers={[padding({ all: 14 }), activityBackgroundTint('#15171C')]}>
        <HStack spacing={6}>
          <Image systemName={icon} color={accent} size={14} />
          <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(white), lineLimit(1)]}>{p.title}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(sub)]}>{p.leftLabel}</Text>
          <Text date={at} dateStyle="relative" modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(accent)]} />
        </HStack>
        <HStack spacing={8}>
          <Text modifiers={[font({ size: 22, weight: 'heavy' }), foregroundStyle(white), lineLimit(1)]}>{p.from}</Text>
          <Image systemName="arrow.right" color={sub} size={13} />
          <Text modifiers={[font({ size: 22, weight: 'heavy' }), foregroundStyle(white), lineLimit(1)]}>{p.to}</Text>
          <Spacer />
          <Text modifiers={[font({ size: 22, weight: 'heavy' }), foregroundStyle(white)]}>{p.time}</Text>
        </HStack>
        <HStack spacing={14}>
          {p.seat ? <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(sub)]}>{`${p.seatLabel} ${p.seat}`}</Text> : <Text> </Text>}
          <Spacer />
          {p.code ? <Text modifiers={[font({ size: 12, weight: 'heavy', design: 'monospaced' }), foregroundStyle(white)]}>{`${p.codeLabel} ${p.code}`}</Text> : <Text> </Text>}
        </HStack>
      </VStack>
    ),
    compactLeading: <Image systemName={icon} color={accent} />,
    compactTrailing: <Text date={at} dateStyle="timer" modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(accent)]} />,
    minimal: <Image systemName={icon} color={accent} />,
    expandedLeading: (
      <VStack alignment="leading" spacing={2} modifiers={[padding({ leading: 6 })]}>
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(sub)]}>{p.title}</Text>
        <Text modifiers={[font({ size: 20, weight: 'heavy' }), foregroundStyle(white), lineLimit(1)]}>{p.from}</Text>
      </VStack>
    ),
    expandedTrailing: (
      <VStack alignment="trailing" spacing={2} modifiers={[padding({ trailing: 6 })]}>
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(sub)]}>{p.time}</Text>
        <Text modifiers={[font({ size: 20, weight: 'heavy' }), foregroundStyle(white), lineLimit(1)]}>{p.to}</Text>
      </VStack>
    ),
    expandedBottom: (
      <HStack spacing={10} modifiers={[padding({ horizontal: 8 })]}>
        <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(sub)]}>{p.leftLabel}</Text>
        <Text date={at} dateStyle="relative" modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(accent)]} />
        <Spacer />
        {p.seat ? <Text modifiers={[font({ size: 12, weight: 'bold' }), foregroundStyle(white)]}>{`${p.seatLabel} ${p.seat}`}</Text> : <Text> </Text>}
        {p.code ? <Text modifiers={[font({ size: 12, weight: 'heavy', design: 'monospaced' }), foregroundStyle(white)]}>{p.code}</Text> : <Text> </Text>}
      </HStack>
    ),
  };
};

export default createLiveActivity<TripActivityProps>('TripActivity', TripActivity);
