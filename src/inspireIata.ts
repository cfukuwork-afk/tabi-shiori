// おすすめの行き先（places.ts の全520都市）→ いちばん近い空港（または都市コード）。航空券ボタンの行き先に使う
// 空港のない町・島・自然地域は、ふつう旅行者が降りる空港にしている
const RAW = `
Tokyo TYO|Kyoto OSA|Osaka OSA|Sapporo SPK|Okinawa OKA|Seoul SEL|Busan PUS|Jeju CJU|Gyeongju PUS|Incheon SEL|
Taipei TPE|Tainan KHH|Kaohsiung KHH|Taichung RMQ|Hualien HUN|Shanghai SHA|Beijing BJS|Xi’an XIY|Chengdu CTU|Guilin KWL|
Hong Kong HKG|Kowloon HKG|Lantau Island HKG|Stanley HKG|Sai Kung HKG|Macau MFM|Taipa MFM|Coloane MFM|Cotai MFM|Senado Square MFM|
Ulaanbaatar UBN|Terelj UBN|Kharkhorin UBN|Khuvsgul MXV|Gobi Desert UBN|Bangkok BKK|Chiang Mai CNX|Phuket HKT|Krabi KBV|Ayutthaya BKK|
Hanoi HAN|Ho Chi Minh City SGN|Da Nang DAD|Hoi An DAD|Ha Long HAN|Singapore SIN|Sentosa SIN|Marina Bay SIN|Chinatown Singapore SIN|Little India SIN|
Kuala Lumpur KUL|Penang PEN|Malacca KUL|Langkawi LGK|Kota Kinabalu BKI|Bali DPS|Jakarta JKT|Yogyakarta YIA|Lombok LOP|Komodo LBJ|
Manila MNL|Cebu CEB|Boracay MPH|Palawan PPS|Bohol TAG|Siem Reap SAI|Phnom Penh PNH|Battambang PNH|Kampot PNH|Sihanoukville KOS|
Luang Prabang LPQ|Vientiane VTE|Vang Vieng VTE|Pakse PKZ|Nong Khiaw LPQ|Yangon RGN|Bagan NYU|Mandalay MDL|Inle Lake HEH|Ngapali SNW|
Bandar Seri Begawan BWN|Kampong Ayer BWN|Temburong BWN|Jerudong BWN|Tutong BWN|Delhi DEL|Agra DEL|Jaipur JAI|Mumbai BOM|Goa GOI|
Colombo CMB|Kandy CMB|Galle CMB|Sigiriya CMB|Ella CMB|Kathmandu KTM|Pokhara PKR|Chitwan KTM|Bhaktapur KTM|Lumbini BWA|
Malé MLE|Maafushi MLE|Ari Atoll MLE|Baa Atoll MLE|Addu GAN|Thimphu PBH|Paro PBH|Punakha PBH|Bumthang PBH|Phobjikha PBH|
Dhaka DAC|Chittagong CGP|Cox’s Bazar CXB|Sylhet ZYL|Sundarbans DAC|Dubai DXB|Abu Dhabi AUH|Sharjah SHJ|Ras Al Khaimah RKT|Al Ain AUH|
Istanbul IST|Cappadocia NAV|Antalya AYT|Izmir ADB|Pamukkale DNZ|Amman AMM|Petra AMM|Wadi Rum AQJ|Aqaba AQJ|Dead Sea AMM|
Doha DOH|Lusail DOH|Al Wakrah DOH|Al Khor DOH|Zubarah DOH|Muscat MCT|Nizwa MCT|Salalah SLL|Sur MCT|Wahiba Sands MCT|
Jerusalem TLV|Tel Aviv TLV|Haifa TLV|Eilat ETM|Nazareth TLV|Samarkand SKD|Bukhara BHK|Tashkent TAS|Khiva UGC|Fergana FEG|
Tbilisi TBS|Batumi BUS|Kazbegi TBS|Mtskheta TBS|Sighnaghi TBS|Riyadh RUH|Jeddah JED|AlUla ULH|Abha AHB|Dammam DMM|
Almaty ALA|Astana NQZ|Shymkent CIT|Turkistan HSA|Charyn Canyon ALA|Paris PAR|Nice NCE|Lyon LYS|Bordeaux BOD|Mont-Saint-Michel RNS|
London LON|Edinburgh EDI|Oxford LON|Bath BRS|Cotswolds LON|Dublin DUB|Galway SNN|Cork ORK|Killarney KIR|Cliffs of Moher SNN|
Amsterdam AMS|Rotterdam AMS|Utrecht AMS|The Hague AMS|Kinderdijk AMS|Brussels BRU|Bruges BRU|Ghent BRU|Antwerp BRU|Leuven BRU|
Berlin BER|Munich MUC|Hamburg HAM|Heidelberg FRA|Rothenburg NUE|Zurich ZRH|Lucerne ZRH|Interlaken ZRH|Zermatt GVA|Geneva GVA|
Vienna VIE|Salzburg SZG|Hallstatt SZG|Innsbruck INN|Graz GRZ|Luxembourg City LUX|Vianden LUX|Echternach LUX|Clervaux LUX|Mullerthal LUX|
Monaco NCE|Monte Carlo NCE|La Condamine NCE|Fontvieille NCE|Larvotto NCE|Rome ROM|Florence FLR|Venice VCE|Milan MIL|Naples NAP|
Barcelona BCN|Madrid MAD|Seville SVQ|Granada GRX|Valencia VLC|Lisbon LIS|Porto OPO|Sintra LIS|Madeira FNC|Algarve FAO|
Athens ATH|Santorini JTR|Mykonos JMK|Crete HER|Meteora ATH|Dubrovnik DBV|Split SPU|Zagreb ZAG|Plitvice ZAG|Hvar SPU|
Valletta MLA|Mdina MLA|Gozo MLA|Sliema MLA|Comino MLA|Nicosia LCA|Limassol LCA|Paphos PFO|Larnaca LCA|Ayia Napa LCA|
Ljubljana LJU|Bled LJU|Piran LJU|Postojna LJU|Bohinj LJU|Kotor TIV|Budva TIV|Podgorica TGD|Perast TIV|Durmitor TGD|
Tirana TIA|Berat TIA|Gjirokastër TIA|Sarandë TIA|Shkodër TIA|Copenhagen CPH|Aarhus AAR|Odense CPH|Billund BLL|Skagen AAL|
Stockholm STO|Gothenburg GOT|Malmö MMX|Kiruna KRN|Visby VBY|Oslo OSL|Bergen BGO|Tromsø TOS|Lofoten BOO|Geiranger AES|
Helsinki HEL|Rovaniemi RVN|Turku TKU|Tampere TMP|Saariselkä IVL|Reykjavik REK|Vík REK|Akureyri AEY|Húsavík AEY|Jökulsárlón REK|
Tallinn TLL|Tartu TLL|Pärnu TLL|Saaremaa TLL|Haapsalu TLL|Riga RIX|Jūrmala RIX|Sigulda RIX|Cēsis RIX|Liepāja RIX|
Vilnius VNO|Kaunas KUN|Trakai VNO|Klaipėda PLQ|Curonian Spit PLQ|Prague PRG|Český Krumlov PRG|Brno BRQ|Karlovy Vary PRG|Kutná Hora PRG|
Budapest BUD|Eger BUD|Szentendre BUD|Pécs BUD|Lake Balaton BUD|Kraków KRK|Warsaw WAW|Gdańsk GDN|Wrocław WRO|Zakopane KRK|
Bratislava BTS|Košice KSC|Banská Štiavnica BTS|High Tatras TAT|Bojnice BTS|Bucharest BUH|Brașov BUH|Sibiu SBZ|Cluj-Napoca CLJ|Sighișoara CLJ|
Sofia SOF|Plovdiv SOF|Veliko Tarnovo SOF|Varna VAR|Rila SOF|Belgrade BEG|Novi Sad BEG|Niš INI|Subotica BEG|Zlatibor BEG|
Sarajevo SJJ|Mostar DBV|Banja Luka BNX|Blagaj DBV|Jajce SJJ|Skopje SKP|Ohrid OHD|Bitola SKP|Matka Canyon SKP|Kratovo SKP|
Marrakech RAK|Fes FEZ|Chefchaouen TNG|Casablanca CMN|Merzouga ERH|Cairo CAI|Luxor LXR|Aswan ASW|Alexandria CAI|Hurghada HRG|
Cape Town CPT|Johannesburg JNB|Durban DUR|Stellenbosch CPT|Kruger MQP|Nairobi NBO|Maasai Mara NBO|Mombasa MBA|Amboseli NBO|Lamu LAU|
Zanzibar ZNZ|Arusha JRO|Serengeti JRO|Dar es Salaam DAR|Kilimanjaro JRO|Tunis TUN|Sidi Bou Said TUN|Djerba DJE|Sousse MIR|Tozeur TOE|
Port Louis MRU|Grand Baie MRU|Le Morne MRU|Flic en Flac MRU|Chamarel MRU|Windhoek WDH|Sossusvlei WDH|Swakopmund WVB|Etosha WDH|Walvis Bay WVB|
Dakar DSS|Saint-Louis DSS|Gorée DSS|Saly DSS|Lake Retba DSS|Addis Ababa ADD|Lalibela LLI|Gondar GDQ|Axum AXU|Bahir Dar BJR|
Antananarivo TNR|Morondava TNR|Nosy Be NOS|Andasibe TNR|Isalo TNR|Kigali KGL|Musanze KGL|Lake Kivu KGL|Nyungwe KGL|Akagera KGL|
New York NYC|Los Angeles LAX|San Francisco SFO|Honolulu HNL|Las Vegas LAS|Vancouver YVR|Toronto YTO|Montreal YMQ|Banff YYC|Quebec City YQB|
Mexico City MEX|Cancún CUN|Oaxaca OAX|Guadalajara GDL|Tulum CUN|Tumon GUM|Hagåtña GUM|Two Lovers Point GUM|Ritidian GUM|Talofofo GUM|
Cusco CUZ|Machu Picchu CUZ|Lima LIM|Arequipa AQP|Lake Titicaca JUL|Rio de Janeiro RIO|São Paulo SAO|Salvador SSA|Foz do Iguaçu IGU|Florianópolis FLN|
Buenos Aires BUE|Mendoza MDZ|Bariloche BRC|El Calafate FTE|Iguazú IGR|Santiago SCL|Valparaíso SCL|San Pedro de Atacama CJC|Torres del Paine PNT|Easter Island IPC|
Cartagena CTG|Bogotá BOG|Medellín MDE|Santa Marta SMR|Salento AXM|Havana HAV|Trinidad HAV|Viñales HAV|Varadero VRA|Santiago de Cuba SCU|
San José SJO|Monteverde SJO|La Fortuna SJO|Manuel Antonio SJO|Tamarindo LIR|La Paz LPB|Uyuni UYU|Sucre SRE|Potosí SRE|Copacabana LPB|
Quito UIO|Galápagos GPS|Cuenca CUE|Baños UIO|Guayaquil GYE|Antigua Guatemala GUA|Tikal FRS|Lake Atitlán GUA|Flores FRS|Guatemala City GUA|
Kingston KIN|Montego Bay MBJ|Negril MBJ|Ocho Rios MBJ|Port Antonio KIN|Montevideo MVD|Colonia del Sacramento MVD|Punta del Este PDP|Cabo Polonio MVD|Piriápolis MVD|
Sydney SYD|Melbourne MEL|Cairns CNS|Gold Coast OOL|Uluru AYQ|Auckland AKL|Queenstown ZQN|Christchurch CHC|Rotorua ROT|Wellington WLG|
Nadi NAN|Suva SUV|Denarau NAN|Mamanuca Islands NAN|Yasawa Islands NAN|Tahiti PPT|Bora Bora BOB|Moorea PPT|Rangiroa RGI|Papeete PPT|
Nouméa NOU|Isle of Pines NOU|Lifou NOU|Ouvéa NOU|Bourail NOU|Koror ROR|Rock Islands ROR|Peleliu ROR|Babeldaob ROR|Jellyfish Lake ROR
`;
export const INSPIRE_IATA: Record<string, string> = Object.fromEntries(
  RAW.split('|')
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => [x.slice(0, -4).trim(), x.slice(-3)]),
);
