// おすすめのしおり（無料で配るもの）。実在の場所で、曜日の休みを避けた順番にしてある。
// 料金は 2026年秋に公式サイトなどで確かめた大人1人の目安。変わることがあるので、メモに「公式で確認」と書いている。
import type { Booking, BookingType, Trip } from './data';

// [日目(0から), 種類, 名前, 時刻, 場所, 行き先, 料金, 通貨, メモ, その他]
type Row = [number, BookingType, string, string, string, string | null, number | null, string | null, string, Partial<Booking>?];

export type Template = { id: string; name: string; days: number; weekday?: number; note: string; rows: Row[]; checklist: string[] };

const addDays = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00');
  x.setDate(x.getDate() + n);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
};

export const TEMPLATES: Template[] = [
  {
    id: 'london',
    name: 'はじめてのロンドン 6日間',
    days: 6,
    weekday: 0, // 日曜に着いて、月曜から回る（寺院は日曜休み・衛兵交代は月水金）
    note: '日曜到着・金曜帰りの組み方。ウェストミンスター寺院は日曜の観光入場なし、衛兵交代は月・水・金・日。',
    checklist: ['パスポート', 'UK ETA（電子渡航認証）', 'タッチ決済できるクレジットカード（地下鉄もこれで乗れる）', '変換プラグ（BFタイプ）', '折りたたみ傘', '歩きやすい靴'],
    rows: [
      [0, 'train', 'エリザベス線 ヒースロー空港 → 中心部', '15:00', 'Heathrow Terminal 2 & 3 Station', 'Tottenham Court Road Station', null, null, '乗り換えなしで中心部まで約40分。ヒースロー・エクスプレスより安い。改札はタッチ決済でそのまま通れる。'],
      [0, 'hotel', 'Premier Inn London County Hall', '16:30', 'Belvedere Rd, London SE1 7PB', null, null, null, 'ロンドン・アイの隣。ウェストミンスターへ橋を渡って歩いて行ける。手ごろで清潔な定番チェーン。', { end: 'D5', endTime: '11:00' }],
      [0, 'plan', 'サウスバンク散歩とビッグ・ベンの夜景', '18:00', 'Queen\'s Walk, South Bank, London SE1 7PB', null, null, null, '到着日は無理をせず川沿いを散歩。対岸の国会議事堂とビッグ・ベンが一番きれいに見える場所。'],
      [0, 'food', 'Dishoom Covent Garden', '19:30', '12 Upper St Martin\'s Ln, London WC2H 9FB', null, null, null, 'ボンベイのカフェ風インド料理。夜は行列になりやすいので早めに。帰りは Leicester Square 駅からノーザン線で Waterloo へ（約10分）。'],
      [1, 'plan', 'バッキンガム宮殿（衛兵交代式）', '10:15', 'Buckingham Palace, London SW1A 1AA', null, null, null, '衛兵交代は月・水・金の11:00（日曜は10:00）。正面の柵の前は10時過ぎに埋まる。天候や行事で中止もあるので当日 Household Division の予定を確認。'],
      [1, 'plan', 'セント・ジェームズ・パーク', '11:45', 'St. James\'s Park, London SW1A 2BJ', null, null, null, '宮殿から公園を東へ抜けると、ウェストミンスターまで歩いて15分。池の橋の上から振り返る宮殿の眺めが人気。'],
      [1, 'ticket', 'ウェストミンスター寺院', '12:15', '20 Deans Yd, London SW1P 3PA', null, 31, 'GBP', '大人 約£31（時間指定のオンライン予約がおすすめ）。戴冠式の場所。日曜は礼拝のみで観光入場なし。所要1.5時間。'],
      [1, 'plan', 'ビッグ・ベンと国会議事堂', '14:00', 'Parliament Square, London SW1P 3JX', null, null, null, '寺院を出て目の前。ウェストミンスター橋の上から撮るのが定番。'],
      [1, 'plan', 'ホース・ガーズとホワイトホール', '14:30', 'Horse Guards Parade, London SW1A 2AX', null, null, null, '騎兵の立つ門は写真OK（馬には触らない）。ここからトラファルガー広場まで北へ徒歩5分。'],
      [1, 'food', 'Café in the Crypt（遅めのランチ）', '15:00', 'St Martin-in-the-Fields, Trafalgar Square, London WC2N 4JJ', null, null, null, '教会の地下にあるセルフ式のカフェ。手ごろで、歩き疲れたときの休憩にちょうどいい。'],
      [1, 'plan', 'ナショナル・ギャラリー', '15:45', 'Trafalgar Square, London WC2N 5DN', null, null, null, '入場無料（特別展は有料）。ゴッホ『ひまわり』、フェルメール、ターナー。閉館18:00（金曜は21:00）。'],
      [1, 'ticket', 'ミュージカル『レ・ミゼラブル』', '19:30', 'Sondheim Theatre, 51 Shaftesbury Ave, London W1D 6BA', null, null, null, 'ギャラリーから徒歩8分。チケットは公式や TodayTix で事前に。日と席で値段が大きく変わる。'],
      [2, 'plan', '大英博物館', '10:00', 'Great Russell St, London WC1B 3DG', null, null, null, '入場無料（無料の時間指定予約をすると入りやすい）。ロゼッタ・ストーンとエジプトのミイラは開館直後に先に回るのがコツ。'],
      [2, 'food', 'Kanada-Ya（ラーメン）', '13:00', '64 St Giles High St, London WC2H 8LE', null, null, null, '博物館から南へ徒歩8分。とんこつラーメンの人気店で、昼は少し並ぶことも。'],
      [2, 'plan', 'コヴェント・ガーデン', '14:30', 'The Market Building, Covent Garden, London WC2E 8RF', null, null, null, 'マーケットと大道芸。隣のセブン・ダイヤルズは小さなお店めぐりにいい。'],
      [2, 'train', '地下鉄 ピカデリー線 Leicester Square → South Kensington', '16:00', 'Leicester Square Station', 'South Kensington Station', null, null, '約10分。地下鉄・バスはタッチ決済で乗れて、1日の上限額に達するとそれ以上は引かれない。'],
      [2, 'plan', '自然史博物館', '16:15', 'Cromwell Rd, London SW7 5BD', null, null, null, '入場無料。建物そのものが見どころ。閉館17:50なので、時間がなければ隣のV&A（ヴィクトリア＆アルバート博物館）と選ぶ。'],
      [2, 'plan', 'ハロッズ（フード・ホール）', '18:00', '87-135 Brompton Rd, London SW1X 7XL', null, null, null, '博物館から徒歩10分。食品フロアの紅茶やビスケットはお土産にちょうどいい。'],
      [2, 'food', 'Flat Iron Soho（ステーキ）', '20:00', '17 Beak St, London W1F 9RW', null, null, null, '手ごろな値段で食べられるステーキ店。ハロッズからはピカデリー線で Piccadilly Circus へ（約10分）。'],
      [3, 'ticket', 'ロンドン塔（王冠の宝石）', '09:00', 'London EC3N 4AB', null, 37, 'GBP', '大人£37。開門したらまず「王冠の宝石」へ直行すると待たない。ビーフィーター（衛兵）の案内ツアーは入場料に含まれる。12/24〜26・1/1は休み。'],
      [3, 'plan', 'タワー・ブリッジ', '12:00', 'Tower Bridge Rd, London SE1 2UP', null, null, null, '橋は無料で歩いて渡れる。上の展示（ガラスの床の通路）は有料。'],
      [3, 'food', 'バラ・マーケット（食べ歩きランチ）', '12:45', '8 Southwark St, London SE1 1TL', null, null, null, '橋を渡って川沿いを西へ徒歩15分。パイ、チーズ、生ガキなど。日曜は休む店が多い。'],
      [3, 'plan', 'テート・モダン', '14:30', 'Bankside, London SE1 9TG', null, null, null, '入場無料。上の階の展望スペースから、川向こうのセント・ポール大聖堂が正面に見える。'],
      [3, 'plan', 'ミレニアム・ブリッジ → セント・ポール大聖堂', '16:00', 'St Paul\'s Churchyard, London EC4M 8AD', null, null, null, '歩行者専用の橋を渡ると大聖堂の正面へ。外から眺めるだけでも十分に迫力がある。'],
      [3, 'ticket', 'スカイ・ガーデン（無料の展望台）', '17:30', '1 Sky Garden Walk, London EC3M 8AF', null, null, null, '入場は無料だが事前予約制（数週間前から埋まる）。夕暮れの時間帯が一番人気。'],
      [3, 'food', 'Padella（手打ちパスタ）', '19:30', '6 Southwark St, London SE1 1TQ', null, null, null, 'バラ・マーケットの隣。予約は取らず、アプリでの順番待ち。'],
      [4, 'train', 'ユーストン → ワトフォード・ジャンクション', '09:00', 'London Euston Station', 'Watford Junction Station', null, null, '約20分。駅前からスタジオ行きのシャトルバスが出ている。'],
      [4, 'ticket', 'ハリー・ポッター スタジオツアー', '10:00', 'Studio Tour Dr, Leavesden, Watford WD25 7LR', null, 58.5, 'GBP', '大人 £56〜£58.50ほど（日によって変わる）。完全予約制で数週間前に売り切れることも。所要3〜4時間。バタービールはここで。'],
      [4, 'food', 'The Wolseley（夕食）', '19:00', '160 Piccadilly, London W1J 9EB', null, null, null, 'クラシックなグランド・カフェ。Green Park 駅のすぐそば。予約がおすすめ。'],
      [5, 'plan', 'ノッティング・ヒルとポートベロー・ロード', '09:00', 'Portobello Rd, London W11 1LJ', null, null, null, 'カラフルな家並みと雑貨店。アンティーク市が開くのは土曜。'],
      [5, 'plan', 'ケンジントン・ガーデンズ', '11:00', 'Kensington Gardens, London W2 2UH', null, null, null, 'ノッティング・ヒルから歩いて15分。ピーター・パン像とケンジントン宮殿（外観）。'],
      [5, 'train', 'エリザベス線 パディントン → ヒースロー空港', '13:00', 'London Paddington Station', 'Heathrow Terminal 2 & 3 Station', null, null, '約30分。国際線は出発の3時間前に空港に着くのが目安。'],
    ],
  },
  {
    id: 'paris',
    name: 'パリ 5日間（ルーヴルとヴェルサイユ）',
    days: 5,
    weekday: 3, // 水曜に着く：ルーヴルは火曜休み、オルセーとヴェルサイユは月曜休み
    note: '水曜到着・日曜帰りの組み方。ルーヴルは火曜休み、オルセーとヴェルサイユは月曜休み。',
    checklist: ['パスポート', 'ユーロの現金（少し）', '美術館の予約QRコード（スクショ）', '歩きやすい靴', 'スリ対策の斜めがけバッグ'],
    rows: [
      [0, 'train', 'ユーロスター ロンドン → パリ北駅', '09:00', 'London St Pancras International', 'Paris Gare du Nord', null, null, '所要約2時間20分。保安検査と出国審査があるので、出発の1時間前には駅へ（時刻は例）。'],
      [0, 'food', 'Marché des Enfants Rouges（屋内市場で遅めのランチ）', '13:30', '39 Rue de Bretagne, 75003 Paris', null, null, null, 'パリで一番古い屋根付き市場。モロッコ料理や日本のお弁当まで。月曜休み。'],
      [0, 'hotel', 'Le Pavillon de la Reine', '15:00', '28 Pl. des Vosges, 75003 Paris', null, null, null, 'ヴォージュ広場に面した静かなホテル。手ごろに泊まるなら、マレ地区〜レピュブリック周辺が移動に便利。', { end: 'D4', endTime: '11:00' }],
      [0, 'plan', 'ヴォージュ広場とマレ地区の散歩', '15:30', 'Place des Vosges, 75004 Paris', null, null, null, 'パリで一番古い広場。周りの通りにはギャラリーやパン屋が並ぶ。'],
      [0, 'plan', 'ノートルダム大聖堂', '16:30', '6 Parv. Notre-Dame - Pl. Jean-Paul II, 75004 Paris', null, null, null, '2024年12月に再開。入場無料（無料の時間指定予約をすると待ちが短い）。'],
      [0, 'food', 'Le Comptoir du Relais（夕食）', '20:00', '9 Carrefour de l\'Odéon, 75006 Paris', null, null, null, 'サン・ジェルマンの人気ビストロ。夜は予約が安心。'],
      [1, 'ticket', 'ルーヴル美術館', '09:00', 'Musée du Louvre, 75001 Paris', null, 32, 'EUR', 'EU以外の大人は€32（2026年1月から）。時間指定の予約が必要。火曜休み。まず『モナ・リザ』へ行き、そのあとゆっくり。'],
      [1, 'food', 'Angelina（ショコラ・ショー）', '12:30', '226 Rue de Rivoli, 75001 Paris', null, null, null, '濃厚なホットチョコレートとモンブラン。混むので開店直後か15時以降がおすすめ。'],
      [1, 'plan', 'チュイルリー公園', '13:30', 'Jardin des Tuileries, 75001 Paris', null, null, null, 'ルーヴルからコンコルド広場へつづく庭園。ベンチでひと休み。'],
      [1, 'ticket', 'オランジュリー美術館（モネ『睡蓮』）', '14:00', 'Jardin des Tuileries, 75001 Paris', null, null, null, '楕円の部屋をぐるりと囲む『睡蓮』。火曜休み。所要1時間ほど。オルセーとの共通券もある。'],
      [1, 'plan', 'シャンゼリゼ通り', '15:30', 'Av. des Champs-Élysées, 75008 Paris', null, null, null, 'コンコルド広場から凱旋門まで歩いて30分ほど。'],
      [1, 'ticket', '凱旋門（屋上）', '17:30', 'Pl. Charles de Gaulle, 75008 Paris', null, null, null, '屋上から12本の大通りが放射状に見える。入口へは地下道から（車道は渡らない）。'],
      [1, 'ticket', 'セーヌ川クルーズ（バトー・ムーシュ）', '21:00', 'Port de la Conférence, 75008 Paris', null, null, null, '暗くなってから乗ると、毎正時にきらめくエッフェル塔が見られる。所要約1時間10分。'],
      [2, 'train', 'RER C でヴェルサイユへ', '08:15', 'Gare du Champ de Mars – Tour Eiffel', 'Versailles Château Rive Gauche', null, null, '約40分。往復の切符を先に。RER C は工事で止まる日があるので前日に確認（止まるときはモンパルナス駅から SNCF で Versailles Chantiers へ）。'],
      [2, 'ticket', 'ヴェルサイユ宮殿（パスポート券）', '09:00', 'Place d\'Armes, 78000 Versailles', null, 35, 'EUR', '宮殿・トリアノン・庭園の共通券。EU以外の大人は4〜10月€35、11〜3月€25。月曜休み。鏡の間は開館直後が空いている。'],
      [2, 'food', 'La Flottille（大運河のほとりでランチ）', '12:30', 'Parc du Château de Versailles, 78000 Versailles', null, null, null, '庭園の中のレストラン。軽く済ませるならテイクアウトして芝生で。'],
      [2, 'plan', 'トリアノンとマリー・アントワネットの村里', '14:00', 'Domaine de Trianon, 78000 Versailles', null, null, null, '宮殿から歩くと25分以上。プチ・トラン（小さな列車）が便利。'],
      [2, 'food', 'Pierre Hermé（マカロン）', '18:30', '72 Rue Bonaparte, 75006 Paris', null, null, null, 'サン・シュルピス教会のそば。バラとライチの「イスパハン」が定番。'],
      [3, 'plan', 'モンマルトルとサクレ・クール寺院', '09:00', '35 Rue du Chevalier de la Barre, 75018 Paris', null, null, null, '朝のうちが静か。寺院は入場無料。丘の上はスリが多いので荷物に注意。'],
      [3, 'plan', 'テルトル広場', '10:30', 'Place du Tertre, 75018 Paris', null, null, null, '画家たちが似顔絵を描く広場。周りの坂道の写真もいい。'],
      [3, 'plan', 'オペラ・ガルニエ', '12:30', '8 Rue Scribe, 75009 Paris', null, null, null, '内部の見学は有料。大階段とシャガールの天井画。'],
      [3, 'plan', 'ギャラリー・ラファイエット（屋上テラス）', '13:30', '40 Bd Haussmann, 75009 Paris', null, null, null, 'ステンドグラスの丸天井と、無料の屋上からの眺め。お土産のまとめ買いにも。'],
      [3, 'ticket', 'オルセー美術館', '15:30', 'Esplanade Valéry Giscard d\'Estaing, 75007 Paris', null, 16, 'EUR', 'オンライン€16。時間指定の予約が必要。月曜休み。印象派は最上階から回る。'],
      [3, 'ticket', 'エッフェル塔（頂上・エレベーター）', '19:30', 'Champ de Mars, 5 Av. Anatole France, 75007 Paris', null, 36.7, 'EUR', '頂上までエレベーターで大人€36.70。夕方の枠は早く売り切れる。対岸のトロカデロ広場からの眺めも必見。'],
      [4, 'food', 'Café de Flore（朝ごはん）', '09:00', '172 Bd Saint-Germain, 75006 Paris', null, null, null, '老舗のカフェで最後の朝ごはん。日曜も営業。'],
      [4, 'train', 'ユーロスター パリ北駅 → ロンドン', '14:00', 'Paris Gare du Nord', 'London St Pancras International', null, null, '出国審査があるので、出発の1時間前には駅へ（時刻は例）。'],
    ],
  },
  {
    id: 'kansai',
    name: '京都・大阪 5日間',
    days: 5,
    note: '朝早く動くほど空いている。京都は初日と2日目、大阪は3日目から。',
    checklist: ['ICカード（Suica・ICOCA）', '歩きやすい靴', 'モバイルバッテリー', '御朱印帳'],
    rows: [
      [0, 'train', '新幹線 のぞみ 東京 → 京都', '08:00', '東京駅', '京都駅', 14170, 'JPY', '約2時間15分。指定席の目安。進行方向右側（E席）から富士山が見える。'],
      [0, 'hotel', 'ホテルグランヴィア京都', '10:30', '京都府京都市下京区烏丸通塩小路下ル東塩小路町901', null, null, null, '京都駅ビル直結。チェックイン前でも荷物を預けて身軽に出発できる。', { end: 'D2', endTime: '11:00' }],
      [0, 'plan', '伏見稲荷大社（千本鳥居）', '11:00', '京都府京都市伏見区深草藪之内町68', null, null, null, 'JR奈良線で稲荷駅まで5分。参拝無料・24時間。鳥居は奥へ行くほど人が少ない（山頂まで往復2時間）。'],
      [0, 'food', 'ランチ：参道でいなり寿司ときつねうどん', '13:00', '京都府京都市伏見区深草一坪町', null, null, null, '表参道の茶店で。稲荷名物の「いなり寿司」を。'],
      [0, 'plan', '清水寺', '14:30', '京都府京都市東山区清水1丁目294', null, 500, 'JPY', '拝観料 約500円。京阪「清水五条」から徒歩20分、または市バス「五条坂」。舞台は夕方の光がきれい。'],
      [0, 'plan', '二年坂・三年坂', '16:00', '京都府京都市東山区清水2丁目', null, null, null, '石畳の坂道。夕方は混むので、写真は脇の路地で。'],
      [0, 'plan', '八坂神社と祇園白川', '17:30', '京都府京都市東山区祇園町北側625', null, null, null, '坂を下って徒歩15分。白川沿いの石畳は夜の灯りが美しい。'],
      [0, 'food', '先斗町で夕食（京のおばんざい）', '19:00', '京都府京都市中京区先斗町通', null, null, null, '鴨川沿いの細い路地。人気の店は予約がないと入れないことが多い。'],
      [1, 'train', 'JR嵯峨野線 京都 → 嵯峨嵐山', '07:30', '京都駅', '嵯峨嵐山駅', null, null, '約15分。竹林は朝8時前が勝負。'],
      [1, 'plan', '竹林の小径', '08:00', '京都府京都市右京区嵯峨小倉山田淵山町', null, null, null, '無料。日中は大混雑、朝早いほど静か。'],
      [1, 'plan', '天龍寺（曹源池庭園）', '08:30', '京都府京都市右京区嵯峨天龍寺芒ノ馬場町68', null, 500, 'JPY', '庭園 約500円。竹林側の北門から入ると動線がいい。'],
      [1, 'plan', '渡月橋', '10:00', '京都府京都市右京区嵯峨中ノ島町', null, null, null, '嵐山の山並みと桂川。春の桜、秋の紅葉が特に有名。'],
      [1, 'food', '% Arabica 京都 嵐山', '10:30', '京都府京都市右京区嵯峨天龍寺芒ノ馬場町3-47', null, null, null, '川を眺めながらのコーヒー。テイクアウト中心。'],
      [1, 'plan', '金閣寺', '12:30', '京都府京都市北区金閣寺町1', null, 500, 'JPY', '嵐山からタクシーで約20分、またはバス。拝観料 約500円。池越しの正面が撮影ポイント。'],
      [1, 'food', '錦市場で食べ歩き', '14:30', '京都府京都市中京区錦小路通', null, null, null, '「京の台所」。多くの店は17〜18時に閉まる。歩きながら食べるのは禁止なので店先で。'],
      [1, 'plan', '河原町・三条でお土産', '16:30', '京都府京都市中京区河原町三条', null, null, null, '八ッ橋、抹茶のお菓子、和雑貨。'],
      [2, 'plan', '二条城（二の丸御殿）', '08:45', '京都府京都市中京区二条通堀川西入二条城町541', null, 1300, 'JPY', '入城＋二の丸御殿で約1,300円。歩くと鳴る「うぐいす張り」の廊下。地下鉄「二条城前」すぐ。'],
      [2, 'train', 'JR新快速 京都 → 大阪', '12:00', '京都駅', '大阪駅', null, null, '約30分。ホテルで荷物を受け取ってから。'],
      [2, 'hotel', 'クロス・ホテル大阪', '13:00', '大阪府大阪市中央区心斎橋筋2-5-15', null, null, null, '道頓堀まで歩いてすぐ。食べ歩きの拠点にちょうどいい。', { end: 'D4', endTime: '11:00' }],
      [2, 'plan', '大阪城', '14:30', '大阪府大阪市中央区大阪城1-1', null, null, null, '天守閣の中は有料の博物館。最上階からの眺めと、広い公園の散歩。'],
      [2, 'food', '黒門市場', '16:30', '大阪府大阪市中央区日本橋2丁目4-1', null, null, null, '海鮮の食べ歩き。夕方から閉まり始めるので早めに。'],
      [2, 'food', '道頓堀で たこ焼き・お好み焼き', '19:00', '大阪府大阪市中央区道頓堀1丁目', null, null, null, 'グリコの看板は戎橋から。夜のネオンが本番。'],
      [3, 'ticket', 'ユニバーサル・スタジオ・ジャパン', '08:00', '大阪府大阪市此花区桜島2丁目1-33', null, null, null, '日によって料金が変わる日付指定券。人気エリアは整理券やエクスプレス・パスが必要な日も。JRゆめ咲線「ユニバーサルシティ」。'],
      [3, 'food', '一蘭 道頓堀店本館', '21:00', '大阪府大阪市中央区宗右衛門町7-18', null, null, null, '夜遅くまで開いている。仕切りのある一人席でゆっくり。'],
      [4, 'plan', '海遊館', '10:00', '大阪府大阪市港区海岸通1-1-10', null, null, null, 'ジンベエザメの大水槽。日時指定のチケットを事前に。所要2時間ほど。'],
      [4, 'train', '新幹線 のぞみ 新大阪 → 東京', '15:00', '新大阪駅', '東京駅', 14720, 'JPY', '約2時間30分。指定席の目安。駅弁は新大阪駅の改札内で。'],
    ],
  },
  {
    id: 'edinburgh',
    name: 'エディンバラとハイランド 4日間',
    days: 4,
    weekday: 5, // 金曜着：ホリールード宮殿は夏以外の火・水が休み
    note: '金曜着・月曜帰り。ホリールード宮殿は夏（5月下旬〜9月上旬）以外は火・水休み。',
    checklist: ['レインコート', '重ね着できる上着', '歩きやすい靴', 'タッチ決済できるクレジットカード'],
    rows: [
      [0, 'train', 'LNER ロンドン → エディンバラ', '09:00', 'London King\'s Cross', 'Edinburgh Waverley', null, null, '約4時間20分。ニューカッスルを過ぎたら進行方向右側に海岸線が見える。早めの予約ほど安い。'],
      [0, 'hotel', 'The Balmoral', '14:30', '1 Princes St, Edinburgh EH2 2EQ', null, null, null, 'ウェイヴァリー駅の真上で、時計台が目印。城もロイヤル・マイルも歩いて行ける。', { end: 'D3', endTime: '11:00' }],
      [0, 'ticket', 'エディンバラ城', '15:00', 'Castlehill, Edinburgh EH1 2NG', null, 23.5, 'GBP', 'オンラインで大人£23.50（当日券は高い）。夏は売り切れるので時間指定で予約。最終入場は閉館の1時間前。'],
      [0, 'plan', 'ロイヤル・マイル', '17:00', 'Royal Mile, Edinburgh EH1 1RE', null, null, null, '城から宮殿までつづく約1.6kmの石畳。脇の細い路地（クロース）をのぞきながら。'],
      [0, 'food', 'The Witchery by the Castle', '19:30', '352 Castlehill, Edinburgh EH1 2NF', null, null, null, '城の入口のすぐそば。ゴシックな内装の人気店で、予約は必須。'],
      [1, 'plan', 'アーサーズ・シート（朝のハイキング）', '07:30', 'Holyrood Park, Edinburgh EH8 8AZ', null, null, null, '街の真ん中にある死火山。往復1.5〜2時間。頂上は風が強いので上着を。'],
      [1, 'ticket', 'ホリールード宮殿', '10:30', 'Canongate, Edinburgh EH8 8DX', null, 22, 'GBP', '事前予約で大人£22（当日£26）。夏以外は火・水休み。王室の行事で急に閉まることもある。'],
      [1, 'food', 'Mums Great Comfort Food', '12:30', '4A Forrest Rd, Edinburgh EH1 2QN', null, null, null, 'ソーセージ＆マッシュなどイギリスの家庭料理。'],
      [1, 'plan', 'ヴィクトリア・ストリートとグラスマーケット', '13:30', 'Victoria St, Edinburgh EH1 2HE', null, null, null, 'カラフルな店が並ぶ曲がった坂道。写真の人気スポット。'],
      [1, 'ticket', 'The Real Mary King\'s Close（地下の街のツアー）', '15:00', '2 Warriston\'s Close, Edinburgh EH1 1PG', null, null, null, '17世紀の路地が地下に残る。ガイドツアー制なので予約を。'],
      [1, 'plan', 'カールトン・ヒル（夕景）', '19:00', 'Calton Hill, Edinburgh EH7 5AA', null, null, null, 'ホテルから徒歩10分。街と城と海が一度に見える。夏の日没は21時過ぎ。'],
      [2, 'bus', 'Rabbie\'s ネス湖とハイランド日帰りツアー', '08:00', '6 Waterloo Pl, Edinburgh EH1 3EG', 'Loch Ness', null, null, '少人数のバスで約12時間。グレンコーの谷が圧巻。ネス湖のクルーズは別料金。'],
      [3, 'plan', 'ディーン・ヴィレッジ', '09:00', 'Dean Village, Edinburgh EH4 3AY', null, null, null, '中心部から歩いて15分。川沿いの小さな村。'],
      [3, 'plan', 'スコットランド国立美術館', '11:00', 'The Mound, Edinburgh EH2 2EL', null, null, null, '入場無料。駅のすぐそばで、帰る前に立ち寄りやすい。'],
      [3, 'food', 'Bertie\'s Proper Fish & Chips', '12:30', '9 Victoria St, Edinburgh EH1 2HE', null, null, null, '最後はフィッシュ＆チップスで。'],
      [3, 'train', 'LNER エディンバラ → ロンドン', '14:00', 'Edinburgh Waverley', 'London King\'s Cross', null, null, '約4時間20分。'],
    ],
  },
];

/** テンプレートから旅を作る（start＝1日目の日付）。日付と曜日を守るので、テンプレートに曜日の指定があれば start はその曜日に合わせる */
export function tripFromTemplate(tp: Template, start: string, me = '自分'): Trip {
  const at = Date.now();
  const bookings: Booking[] = tp.rows.map(([d, type, title, time, from, to, price, currency, memo, extra], i) => {
    const b: Booking = { id: `tpl_${tp.id}_${at.toString(36)}_${i}`, type, title, start: addDays(start, d), startTime: time, from, memo, createdAt: at + i };
    if (to) b.to = to;
    if (price != null && currency) Object.assign(b, { price, currency });
    // ヴェルサイユのパスポート券は季節で変わる（EU以外の大人：4〜10月€35、11〜3月€25）
    if (tp.id === 'paris' && type === 'ticket' && title.includes('ヴェルサイユ')) {
      const m = Number(b.start.slice(5, 7));
      b.price = m >= 4 && m <= 10 ? 35 : 25;
    }
    if (extra) {
      const { end, ...rest } = extra;
      Object.assign(b, rest);
      if (typeof end === 'string') b.end = end.startsWith('D') ? addDays(start, Number(end.slice(1))) : end;
    }
    return b;
  });
  return {
    id: `tpl_${tp.id}_${at.toString(36)}`,
    name: tp.name,
    emoji: '',
    start,
    end: addDays(start, tp.days - 1),
    members: [{ id: 'me', name: me }],
    myId: 'me',
    bookings,
    checklist: tp.checklist.map((text, i) => ({ id: `tpl_${tp.id}_${at.toString(36)}_c${i}`, text, done: false })),
    createdAt: at,
  };
}

/** 指定の曜日（0=日）になる、from 以降で最初の日付 */
export function nextWeekday(from: string, weekday?: number) {
  if (weekday == null) return from;
  let d = from;
  for (let i = 0; i < 7; i++) {
    if (new Date(d + 'T12:00:00').getDay() === weekday) return d;
    d = addDays(d, 1);
  }
  return from;
}

// 年末年始（12/20〜1/3）は休みや運休が多いので、そこにかからない最初の日付にずらす
export function goodStart(tp: Template, from: string) {
  let d = nextWeekday(from, tp.weekday);
  for (let i = 0; i < 10; i++) {
    const end = addDays(d, tp.days - 1);
    const hit = [d, end].some((x) => x.slice(5) >= '12-20' || x.slice(5) <= '01-03') || (d.slice(5) < '12-20' && end.slice(5) >= '12-20') || (d.slice(0, 4) !== end.slice(0, 4));
    if (!hit) return d;
    d = addDays(d, 7);
  }
  return d;
}

// Web確認版のテスト用：4つのしおり（合計100件）を、曜日に合わせた先の日付で作る
export function makeDemoTrips(today: string): Trip[] {
  const base = [30, 120, 150, 200];
  return TEMPLATES.map((tp, i) => tripFromTemplate(tp, goodStart(tp, addDays(today, base[i]))));
}
