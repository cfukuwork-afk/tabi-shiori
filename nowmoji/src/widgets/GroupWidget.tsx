// グループのウィジェット：ロック画面の横長（最近の3人）・ホーム画面の中（5人）・大（ひとことも）
// この関数はウィジェットの中だけで動く（外の変数・関数は使えない）
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { background, font, foregroundStyle, frame, lineLimit, minimumScaleFactor, padding, resizable, aspectRatio, shapes, containerBackground, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type WPerson = { n: string; c: string; bg: string; k: string; img: string; t: string; w: string };
export type GroupWidgetProps = {
  groups: Record<string, { name: string; people: WPerson[] }>;
  order: string[];
  empty: string;
  hint: string;
  theme?: string;
};

const GroupWidget = (p: GroupWidgetProps, env: WidgetEnvironment<{ group: string }>) => {
  'widget';
  const paper = p.theme || '#FFFDF8';
  const dark = paper === '#2F3550';
  const ink = dark ? '#FFFFFF' : '#2B2633';
  const sub = dark ? '#C9CCE0' : '#8A8396';
  const want = (env as any).configuration?.group || '';
  const gid = want && p.groups[want] ? want : p.order[0];
  const g = gid ? p.groups[gid] : null;
  const fam = env.widgetFamily;
  const url = gid ? `nowmoji://g/${gid}` : 'nowmoji://';

  if (fam === 'accessoryRectangular' || fam === 'accessoryInline') {
    if (!g) return <Text modifiers={[font({ size: 12, weight: 'bold' }), widgetURL(url)]}>{p.empty}</Text>;
    const top = g.people.filter((x) => x.k || x.img).slice(0, 3);
    const rest = g.people.length - top.length;
    return (
      <VStack alignment="leading" spacing={2} modifiers={[widgetURL(url)]}>
        <HStack spacing={4}>
          <Text modifiers={[font({ size: 11, weight: 'heavy' }), lineLimit(1)]}>{g.name}</Text>
          {rest > 0 ? <Text modifiers={[font({ size: 10, weight: 'semibold' }), foregroundStyle({ type: 'hierarchical', style: 'secondary' } as any)]}>{`+${rest}`}</Text> : null}
          <Spacer />
        </HStack>
        {top.length === 0 ? (
          <Text modifiers={[font({ size: 11 }), lineLimit(1)]}>{p.hint}</Text>
        ) : (
          <HStack spacing={4}>
            {top.map((x, i) => (
              <VStack key={i} spacing={1} modifiers={[frame({ maxWidth: 9999 })]}>
                {x.img ? (
                  <Image uiImage={x.img} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ height: 24 })]} />
                ) : (
                  <Text modifiers={[font({ size: 13, weight: 'heavy' }), lineLimit(1), minimumScaleFactor(0.45), frame({ height: 24 })]}>{x.k}</Text>
                )}
                <Text modifiers={[font({ size: 9, weight: 'semibold' }), lineLimit(1)]}>{x.n}</Text>
              </VStack>
            ))}
          </HStack>
        )}
      </VStack>
    );
  }

  if (!g) {
    return (
      <VStack spacing={6} modifiers={[containerBackground(paper, 'widget'), widgetURL(url)]}>
        <Text modifiers={[font({ size: 28, weight: 'heavy' }), foregroundStyle(ink)]}>(´ω`)</Text>
        <Text modifiers={[font({ size: 13, weight: 'bold' }), foregroundStyle(sub)]}>{p.empty}</Text>
      </VStack>
    );
  }

  if (fam === 'systemLarge') {
    return (
      <VStack alignment="leading" spacing={8} modifiers={[containerBackground(paper, 'widget'), widgetURL(url)]}>
        <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(sub), lineLimit(1)]}>{g.name}</Text>
        {g.people.slice(0, 5).map((x, i) => (
          <HStack key={i} spacing={10}>
            <VStack modifiers={[frame({ width: 58, height: 52 }), background(x.bg, shapes.roundedRectangle({ cornerRadius: 12 }))]}>
              {x.img ? (
                <Image uiImage={x.img} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 46, height: 46 })]} />
              ) : (
                <Text modifiers={[font({ size: 14, weight: 'heavy' }), foregroundStyle(ink), lineLimit(1), minimumScaleFactor(0.4), padding({ horizontal: 3 })]}>{x.k || '·'}</Text>
              )}
            </VStack>
            <VStack alignment="leading" spacing={1}>
              <HStack spacing={6}>
                <Text modifiers={[font({ size: 13, weight: 'heavy' }), foregroundStyle(x.c), lineLimit(1)]}>{x.n}</Text>
                <Text modifiers={[font({ size: 11 }), foregroundStyle(sub)]}>{x.t}</Text>
              </HStack>
              <Text modifiers={[font({ size: 14 }), foregroundStyle(ink), lineLimit(2)]}>{x.w}</Text>
            </VStack>
            <Spacer />
          </HStack>
        ))}
        <Spacer />
      </VStack>
    );
  }

  return (
    <VStack alignment="leading" spacing={6} modifiers={[containerBackground(paper, 'widget'), widgetURL(url)]}>
      <Text modifiers={[font({ size: 12, weight: 'heavy' }), foregroundStyle(sub), lineLimit(1)]}>{g.name}</Text>
      <HStack spacing={6}>
        {g.people.slice(0, 5).map((x, i) => (
          <VStack key={i} spacing={3} modifiers={[frame({ maxWidth: 9999 })]}>
            <VStack modifiers={[frame({ maxWidth: 9999, minHeight: 54, maxHeight: 54 }), background(x.bg, shapes.roundedRectangle({ cornerRadius: 12 }))]}>
              {x.img ? (
                <Image uiImage={x.img} modifiers={[resizable(), aspectRatio({ contentMode: 'fit' }), frame({ width: 46, height: 46 })]} />
              ) : (
                <Text modifiers={[font({ size: 15, weight: 'heavy' }), foregroundStyle(ink), lineLimit(1), minimumScaleFactor(0.35), padding({ horizontal: 3 })]}>{x.k || '·'}</Text>
              )}
            </VStack>
            <Text modifiers={[font({ size: 11, weight: 'heavy' }), foregroundStyle(x.c), lineLimit(1)]}>{x.n}</Text>
            <Text modifiers={[font({ size: 9 }), foregroundStyle(sub), lineLimit(1)]}>{x.t}</Text>
          </VStack>
        ))}
      </HStack>
    </VStack>
  );
};

export default createWidget<GroupWidgetProps, { group: string }>('GroupMoods', GroupWidget, {
  groups: {},
  order: [],
  empty: 'Nowmoji',
  hint: '',
});
