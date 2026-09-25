/**
 * The commanders.
 *
 * One for the player and one for each level's defender. The art lives under
 * `assets/characters/`; what is here is who they are, which side of the
 * screen they stand on, and the colours their speech takes — the defender's
 * bubble is trimmed in his own flag, so the stand-off reads as two nations
 * before a word is on screen.
 *
 * They are named, and the name is on a plate over the bubble while they
 * speak. Invented officers, all of them: the game knocks down real buildings
 * and that is quite enough reality — nobody who ever held these ranks is
 * being put in the game's mouth. The rank is the one the nation actually
 * uses, which is half the characterisation, and the Egyptian's is his own
 * word for it rather than the English translation.
 */
export const CAST = {
  us: {
    id: 'us', file: 'assets/characters/us-general.png',
    rank: 'Gen.', name: 'Buck Hollister', nation: 'United States', side: 'left',
    colours: ['#b22234', '#ffffff', '#3c3b6e'],
  },
  uk: {
    id: 'uk', file: 'assets/characters/uk-field-marshal.png',
    rank: 'F.M.', name: 'Sir Reginald Pomp', nation: 'United Kingdom', side: 'right',
    colours: ['#c8102e', '#ffffff', '#012169'],
  },
  fr: {
    id: 'fr', file: 'assets/characters/fr-marshal.png',
    rank: 'Maréchal', name: 'Gaspard DeRetreat', nation: 'France', side: 'right',
    colours: ['#0055a4', '#ffffff', '#ef4135'],
  },
  in: {
    id: 'in', file: 'assets/characters/in-maharaja-general.png',
    rank: 'Maharaja-Gen.', name: 'Arvind Rathore', nation: 'India', side: 'right',
    colours: ['#ff9933', '#ffffff', '#138808'],
  },
  eg: {
    id: 'eg', file: 'assets/characters/eg-field-marshal.png',
    rank: 'Mushir', name: 'Tarek El-Masry', nation: 'Egypt', side: 'right',
    colours: ['#ce1126', '#ffffff', '#000000'],
  },
  // The second half of the campaign. Drawn as a set in the first four's style
  // — cigar, arms folded, the flag worn — and described in
  // `characters/manifest.json`.
  mx: {
    id: 'mx', file: 'assets/characters/mx-general.png',
    rank: 'Gral. de División', name: 'Rodrigo Salazar-Quiroz', nation: 'Mexico',
    side: 'right', colours: ['#006847', '#ffffff', '#ce1126'],
  },
  it: {
    id: 'it', file: 'assets/characters/it-generale.png',
    rank: 'Generale', name: 'Ottavio Bambino', nation: 'Italy', side: 'right',
    colours: ['#008c45', '#ffffff', '#cd212a'],
  },
  ru: {
    id: 'ru', file: 'assets/characters/ru-marshal.png',
    rank: 'Marshal', name: 'Lev Zimyanin', nation: 'Russia', side: 'right',
    colours: ['#ffffff', '#0039a6', '#d52b1e'],
  },
  au: {
    id: 'au', file: 'assets/characters/au-general.png',
    rank: 'Gen.', name: 'Angus Kerrigan', nation: 'Australia', side: 'right',
    colours: ['#00247d', '#ffffff', '#c8202f'],
  },
  br: {
    id: 'br', file: 'assets/characters/br-marechal.png',
    rank: 'Marechal', name: 'Joaquim Duarte-Ribeiro', nation: 'Brazil',
    side: 'right', colours: ['#009739', '#fedd00', '#012169'],
  },
  // The third five. Art pending: the file names are the slots, and the
  // stand-off and the dossier both tolerate the picture being missing.
  gr: {
    id: 'gr', file: 'assets/characters/gr-strategos.png',
    rank: 'Strategos', name: 'Aris Vlachopoulos', nation: 'Greece', side: 'right',
    colours: ['#0d5eaf', '#ffffff', '#0d5eaf'],
  },
  tr: {
    id: 'tr', file: 'assets/characters/tr-orgeneral.png',
    rank: 'Orgeneral', name: 'Selim Karabulut', nation: 'Turkey', side: 'right',
    colours: ['#e30a17', '#ffffff', '#e30a17'],
  },
  de: {
    id: 'de', file: 'assets/characters/de-general.png',
    rank: 'General', name: 'Friedrich von Steinhauer', nation: 'Germany', side: 'right',
    colours: ['#000000', '#dd0000', '#ffce00'],
  },
  jp: {
    id: 'jp', file: 'assets/characters/jp-taisho.png',
    rank: 'Taishō', name: 'Kenji Takamura', nation: 'Japan', side: 'right',
    colours: ['#ffffff', '#bc002d', '#ffffff'],
  },
  ae: {
    id: 'ae', file: 'assets/characters/ae-fariq.png',
    rank: 'Fariq Awwal', name: 'Saif bin Hamdan', nation: 'United Arab Emirates', side: 'right',
    colours: ['#ff0000', '#00732f', '#000000'],
  },
  // The last two. Art pending, as above.
  my: {
    id: 'my', file: 'assets/characters/my-jeneral.png',
    rank: 'Jeneral', name: 'Hafiz bin Zulkifli', nation: 'Malaysia', side: 'right',
    colours: ['#cc0001', '#ffffff', '#010066'],
  },
  cn: {
    id: 'cn', file: 'assets/characters/cn-shangjiang.png',
    rank: 'Shàngjiàng', name: 'Wen Jiahao', nation: 'China', side: 'right',
    colours: ['#de2910', '#ffde00', '#de2910'],
  },
  es: {
    id: 'es', file: 'assets/characters/es-capitan-general.png',
    rank: 'Capitán General', name: 'Íñigo Valdés de la Serna', nation: 'Spain', side: 'right',
    colours: ['#aa151b', '#f1bf00', '#aa151b'],
  },
  be: {
    id: 'be', file: 'assets/characters/be-luitenant-generaal.png',
    rank: 'Luitenant-generaal', name: 'Maarten Vandenbroucke', nation: 'Belgium', side: 'right',
    colours: ['#111111', '#fdda24', '#ef3340'],
  },
  hu: {
    id: 'hu', file: 'assets/characters/hu-vezerezredes.png',
    rank: 'Vezérezredes', name: 'Bálint Szentgyörgyi', nation: 'Hungary', side: 'right',
    colours: ['#ce2939', '#f4f2ec', '#477050'],
  },
  pt: {
    id: 'pt', file: 'assets/characters/pt-general.png',
    rank: 'General', name: 'Duarte Albuquerque Sá', nation: 'Portugal', side: 'right',
    colours: ['#046a38', '#da291c', '#ffe900'],
  },
  ma: {
    id: 'ma', file: 'assets/characters/ma-general.png',
    rank: 'Général de Corps d’Armée', name: 'Youssef El Mansouri', nation: 'Morocco', side: 'right',
    colours: ['#c1272d', '#006233', '#c1272d'],
  },
  kw: {
    id: 'kw', file: 'assets/characters/kw-fariq-awwal.png',
    rank: 'Farīq Awwal', name: 'Fahad Al-Mutairi', nation: 'Kuwait', side: 'right',
    colours: ['#007a3d', '#f4f2ec', '#ce1126'],
  },
  kr: {
    id: 'kr', file: 'assets/characters/kr-daejang.png',
    rank: 'Daejang', name: 'Baek Seung-ho', nation: 'South Korea', side: 'right',
    colours: ['#f4f2ec', '#cd2e3a', '#0047a0'],
  },
  th: {
    id: 'th', file: 'assets/characters/th-phon-ek.png',
    rank: 'Phon Ek', name: 'Somchai Wattanakul', nation: 'Thailand', side: 'right',
    colours: ['#a51931', '#f4f5f8', '#2d2a4a'],
  },
  mm: {
    id: 'mm', file: 'assets/characters/mm-bogyoke.png',
    rank: 'Bogyoke', name: 'Thura Kyaw Zeya', nation: 'Myanmar', side: 'right',
    colours: ['#fecb00', '#34b233', '#ea2839'],
  },
  kh: {
    id: 'kh', file: 'assets/characters/kh-oudom-seney.png',
    rank: 'Oudom Seney', name: 'Sok Vannarith', nation: 'Cambodia', side: 'right',
    colours: ['#032ea1', '#e00025', '#032ea1'],
  },
  id: {
    id: 'id', file: 'assets/characters/id-jenderal.png',
    rank: 'Jenderal', name: 'Bagus Wiranto Hadi', nation: 'Indonesia', side: 'right',
    colours: ['#ce1126', '#f4f2ec', '#ce1126'],
  },
  gt: {
    id: 'gt', file: 'assets/characters/gt-general-de-division.png',
    rank: 'General de División', name: 'Rodrigo Ixcot Morales', nation: 'Guatemala', side: 'right',
    colours: ['#4997d0', '#f4f2ec', '#4997d0'],
  },
  pe: {
    id: 'pe', file: 'assets/characters/pe-general-de-ejercito.png',
    rank: 'General de Ejército', name: 'Ernesto Quispe Huamán', nation: 'Peru', side: 'right',
    colours: ['#d91023', '#f4f2ec', '#d91023'],
  },
};

/** Which defender holds each level. */
export const DEFENDER_OF = {
  westminster: 'uk', paris: 'fr', agra: 'in', giza: 'eg',
  chichen: 'mx', pisa: 'it', moscow: 'ru', sydney: 'au', rio: 'br',
  athens: 'gr', istanbul: 'tr', cologne: 'de', himeji: 'jp', dubai: 'ae',
  petronas: 'my', potala: 'cn',
  colosseum: 'it',
  towerbridge: 'uk',
  florence: 'it',
  segovia: 'es',
  atomium: 'be',
  tokyotower: 'jp',
  budapest: 'hu',
  sagrada: 'es',
  edinburgh: 'uk',
  neuschwanstein: 'de',
  montstmichel: 'fr',
  pena: 'pt',
  hassan: 'ma',
  kuwait: 'kw',
  karnak: 'eg',
  forbidden: 'cn',
  gyeongbok: 'kr',
  watarun: 'th',
  shwedagon: 'mm',
  angkor: 'kh',
  borobudur: 'id',
  tikal: 'gt',
  teotihuacan: 'mx',
  machupicchu: 'pe',
  greatwall: 'cn',
};

/**
 * The stand-off before each level: ultimatum, refusal, last word.
 *
 * The first nine are the writer's; the third five are drafts in his register.
 * The defender's line is in his own language
 * where the writer put it there; the General never understands a word of it,
 * which is the point.
 */
export const STANDOFF = {
  westminster: [
    { who: 'us', line: 'Give it up you limey bastard' },
    { who: 'uk', line: 'God save the queen, and your soul' },
    { who: 'us', line: "Thank god, I was worried we dragged all this damn ordnance across the Atlantic for nothing!" },
  ],
  paris: [
    { who: 'us', line: 'Surrender or die Frenchie' },
    { who: 'fr', line: "Va t'étouffer avec une baguette" },
    { who: 'us', line: "All I heard was baguette, and that's all I need, buckle up butter cup" },
  ],
  agra: [
    { who: 'us', line: 'Heck of an Urn ya got there, now scram before we turn one grave into 500' },
    { who: 'in', line: 'Twenty thousand men built this in twenty-two years. You will die outside these walls like so many others' },
    { who: 'us', line: 'Twenty-two years? Give me twenty-two minutes.' },
  ],
  giza: [
    { who: 'us', line: "God it's hot out here, give it up before we all melt would ya?" },
    { who: 'eg', line: 'اطلع الهرم ده وهاتك يا طفل يا تخين' },
    { who: 'us', line: "I don't speak Sanskrit habibi, but I get the gist. Someone get me some damn water and a lot of bombs" },
  ],
  chichen: [
    { who: 'us', line: "Step aside, chief. You might be on the wrong calendar, but it's reckoning day" },
    { who: 'mx', line: 'Llevas mil años tarde. Esto ya lo enterramos una vez y lo volvimos a construir encima.' },
    { who: 'us', line: "No dice bro-chacho, it's pain-30 and I'm on the clock" },
  ],
  pisa: [
    { who: 'us', line: "That's one un-impressive specimen of an engineering failure, let me finish what gravity started" },
    { who: 'it', line: 'Pende da ottocento anni, americano. Tu non duri otto minuti in questo sole.' },
    { who: 'us', line: 'Yeah yeah, cappuccino cappuccino pasta BOOM BABY' },
  ],
  moscow: [
    { who: 'us', line: 'The USSR is gone Comrade, no need for hostilities, just let me level this dump and we can all go home' },
    { who: 'ru', line: 'Иван ослепил зодчего, чтобы он не построил второго. Тебе глаза оставим — смотри.' },
    { who: 'us', line: "Let me stop ya right there Ivan, it ain't January and I'm not the mustache man, prepare to be boarded" },
  ],
  sydney: [
    { who: 'us', line: "Now this has to be the dumbest looking monument to mediocrity I've ever seen" },
    { who: 'au', line: 'Mate, you have got one road in and we have got the whole harbour. Take your shot.' },
    { who: 'us', line: 'Finally, one of em speaks American! Better hit the dunny mate before ya soil them fancy slacks' },
  ],
  rio: [
    { who: 'us', line: "No way I'm climbing up that, I'm an officer I don't do PT!" },
    { who: 'br', line: 'Ele está de braços abertos há um século. Nem por você ele abaixa.' },
    { who: 'us', line: "Did anyone catch that? Me neither. Catch this amigo" },
  ],
  // ── The third five. Drafted in the writer's register — sarcastic, rude,
  // and the General never understanding a word — and marked as drafts
  // until the writer has been over them.
  athens: [
    { who: 'us', line: "Two and a half thousand years and you still haven't put the roof back on. Step aside, I'll finish the job." },
    { who: 'gr', line: 'Πέρσες, Ρωμαίοι, Τούρκοι, Άγγλοι. Όλοι ήρθαν για τα μάρμαρα. Κανείς δεν έφυγε με ό,τι ήρθε.' },
    { who: 'us', line: "No idea what that was, but it had 'marbles' in it. Boys, he's about to lose his." },
  ],
  istanbul: [
    { who: 'us', line: "Church, mosque, museum, mosque. Make up your mind, 'cause in ten minutes it's a parking lot." },
    { who: 'tr', line: 'Bin beş yüz yıl depremlere dayandı, Amerikalı. Sen bir hafta sonu dayanamazsın.' },
    { who: 'us', line: "I caught 'earthquake' in there somewhere. Good. That's the plan, pal." },
  ],
  cologne: [
    { who: 'us', line: "Six hundred years to build one church? That's not devotion, that's a union job. Watch how fast I do it." },
    { who: 'de', line: 'Die Bomber haben es 1945 nicht geschafft, Amerikaner. Du mit deinen vier Kanonen schon gar nicht.' },
    { who: 'us', line: "He said 'Amerikaner' like it was an insult. Fellas, show the man what the family business does." },
  ],
  himeji: [
    { who: 'us', line: "A white castle. Adorable. I'm gonna want fries with that." },
    { who: 'jp', line: '四百年、誰もこの城を落とせなかった。お前は靴も脱いでいない。' },
    { who: 'us', line: "Did he just tell me to take my shoes off? Son, these boots stay on, and they're going through your front door." },
  ],
  dubai: [
    { who: 'us', line: 'Eight hundred metres of glass in the middle of a desert. Somebody was compensating.' },
    { who: 'ae', line: 'ثمانمئة متر يا أمريكي. مدافعك ما توصل نصّها.' },
    { who: 'us', line: "Eight hundred? Fine. I'll take it in two payments." },
  ],
  petronas: [
    { who: 'us', line: "Two of them. Somebody built it twice and still couldn't get it right." },
    { who: 'my', line: 'Dua menara, satu jambatan. Tembak jambatan itu — ia tidak menahan apa-apa.' },
    { who: 'us', line: "He's pointing at the bridge. Boys, shoot everything BUT the bridge." },
  ],
  potala: [
    { who: 'us', line: 'Thirteen storeys of whitewash on a red rock. Walk out and I leave the paint on it.' },
    { who: 'cn', line: '这堵墙比你的炮管还厚。你打的是山，不是房子。' },
    { who: 'us', line: "A mountain. Great. Bring the whole catalogue, we're going to be here a while." },
  ],
  colosseum: [
    { who: 'us', line: "Two thousand years of gladiators and not one of them had a howitzer. Clear out, Rome." },
    { who: 'it', line: "Il Colosseo ha visto cadere un impero. Vedrà cadere anche te, americano." },
    { who: 'us', line: "He says it's seen an empire fall. Good. Then it knows how this goes." },
  ],
  towerbridge: [
    { who: 'us', line: "A castle with a drawbridge, in a river. Raise it or lower it, I'm knocking it down either way." },
    { who: 'uk', line: "This bridge has opened for the Queen and closed on the Luftwaffe. It will not open for you." },
    { who: 'us', line: "Then I'll open it myself. Right down the middle." },
  ],
  florence: [
    { who: 'us', line: "Biggest brick dome on earth and nobody's ever found the trick to it. Let me show you." },
    { who: 'it', line: "Brunelleschi ha costruito quella cupola senza centine. Tu non sai nemmeno cosa siano." },
    { who: 'us', line: "Centine, schmentine. Load the guns." },
  ],
  segovia: [
    { who: 'us', line: "Twenty thousand stones and not a drop of mortar. I've got twenty thousand reasons it comes down." },
    { who: 'es', line: "Dos mil años en pie sin argamasa, americano. Tus balas no son más que viento." },
    { who: 'us', line: "Wind? Fellas, give the man a hurricane." },
  ],
  atomium: [
    { who: 'us', line: "Nine steel balls on a stick. Somebody built a molecule the size of a hotel and I'm the chemistry teacher." },
    { who: 'be', line: "Het Atomium overleefde de Expo, de roest en de jaren zestig. Jij bent gewoon de volgende." },
    { who: 'us', line: "He said the sixties. Boys, split the atom." },
  ],
  tokyotower: [
    { who: 'us', line: "An orange Eiffel Tower. I've already done the original. This one's a rerun." },
    { who: 'jp', line: "東京タワーは地震に耐えてきた。お前の大砲など、そよ風だ。" },
    { who: 'us', line: "A breeze, he says. Load the one-five-fives and let's see what a gale does." },
  ],
  budapest: [
    { who: 'us', line: "The biggest parliament in Europe on the biggest river. That's a lot of talking to stop." },
    { who: 'hu', line: "Ez a ház túlélt két világháborút és egy forradalmat, amerikai. Téged is túlél." },
    { who: 'us', line: "Two world wars and a revolution. Third time's the charm." },
  ],
  sagrada: [
    { who: 'us', line: "A hundred and forty years and it's still not finished. I'm here to help with that." },
    { who: 'es', line: "Gaudí dijo que su cliente no tenía prisa. Dios tampoco la tiene contigo, americano." },
    { who: 'us', line: "His client's in no hurry? Mine is. Fire." },
  ],
  edinburgh: [
    { who: 'us', line: "A castle on a volcano. Whoever built that never met an artillery officer." },
    { who: 'uk', line: "This rock has held twenty-six sieges, laddie. You'll be the twenty-seventh to walk away." },
    { who: 'us', line: "Twenty-six sieges and not one of them had air support. Wheels up." },
  ],
  neuschwanstein: [
    { who: 'us', line: "A fairytale castle. Somebody call the studio, I'm about to shorten the movie." },
    { who: 'de', line: "König Ludwig baute dies für die Ewigkeit, Amerikaner. Ihre Kanonen sind ein Wimpernschlag." },
    { who: 'us', line: "Eternity, huh? Let's see how long that takes at five rounds a minute." },
  ],
  montstmichel: [
    { who: 'us', line: "An abbey on an island on a beach. Whatever you're praying for, it's not going to be enough." },
    { who: 'fr', line: "La mer a gardé le Mont pendant mille ans, américain. Elle ne faillira pas aujourd'hui." },
    { who: 'us', line: "The tide's on his side. Fine. My shells don't swim, they fly." },
  ],
  pena: [
    { who: 'us', line: "A red and yellow palace on a mountain. Somebody's decorator needs to be stopped." },
    { who: 'pt', line: "A Pena resistiu a séculos de nevoeiro e de reis loucos. Um general americano não é novidade." },
    { who: 'us', line: "Mad kings and fog. I'm neither, and I brought bigger guns." },
  ],
  hassan: [
    { who: 'us', line: "A minaret two hundred metres tall on the edge of the Atlantic. I'm here to lower the volume." },
    { who: 'ma', line: "المئذنة قائمة على البحر يا أمريكي، والبحر لا يركع لأحد." },
    { who: 'us', line: "The sea kneels to nobody. Good thing I'm not asking the sea." },
  ],
  kuwait: [
    { who: 'us', line: "Three water towers with restaurants in them. I'm going to send them the bill." },
    { who: 'kw', line: "هذه الأبراج ما سقطت في التسعين يا أمريكي، وما راح تسقط اليوم." },
    { who: 'us', line: "They stood in ninety because we were on the other side. Different day." },
  ],
  karnak: [
    { who: 'us', line: "A hundred and thirty-four columns and no roof. Somebody already started the job for me." },
    { who: 'eg', line: "الفراعنة بنوا ده يا أمريكي. ثلاثة آلاف سنة، وأنت عندك ظهر واحد." },
    { who: 'us', line: "One afternoon. That's about what I budgeted." },
  ],
  forbidden: [
    { who: 'us', line: "Nine thousand rooms and I only need to knock on one. Open the gate, Beijing." },
    { who: 'cn', line: "紫禁城五百年没有外人踏进过大殿。你的炮弹也不会。" },
    { who: 'us', line: "Five hundred years without a visitor. Time somebody dropped in." },
  ],
  gyeongbok: [
    { who: 'us', line: "A palace with a throne and no king. Sounds like a vacancy I'm about to fill with rubble." },
    { who: 'kr', line: "이 궁궐은 두 번 불탔고 두 번 다시 세워졌소. 당신은 세 번째가 될 뿐이오." },
    { who: 'us', line: "Third time? Great. Somebody's got the blueprints, then." },
  ],
  watarun: [
    { who: 'us', line: "The Temple of Dawn. By the time the sun's up it's the Temple of the Pile." },
    { who: 'th', line: "พระปรางค์นี้ยืนอยู่ริมแม่น้ำมาสองร้อยปี ปืนของคุณเป็นแค่เสียงในสายฝน" },
    { who: 'us', line: "Noise in the rain. Fellas, let's make it a monsoon." },
  ],
  shwedagon: [
    { who: 'us', line: "Sixty tons of gold on a hill. Consider this a hostile takeover." },
    { who: 'mm', line: "ရွှေတိဂုံသည် ငလျင်နှင့် ဧကရာဇ်များကို ကျော်လွှားခဲ့သည်။ သင်သည် ဘာမှမဟုတ်။" },
    { who: 'us', line: "Earthquakes and emperors. I'm the one with the shells." },
  ],
  angkor: [
    { who: 'us', line: "The biggest temple on earth, in a jungle, with a moat. You people don't do anything small." },
    { who: 'kh', line: "អង្គរវត្តឈរជាង៨០០ឆ្នាំ។ អ្នកមិនអាចធ្វើឱ្យវាដួលបានទេ។" },
    { who: 'us', line: "Eight hundred years and one afternoon. Load the guns." },
  ],
  borobudur: [
    { who: 'us', line: "Two million stones stacked in a hill with no cement. That's not a temple, that's a game of Jenga." },
    { who: 'id', line: "Borobudur tertidur di bawah abu selama seribu tahun dan bangun kembali. Kau hanya debu lain." },
    { who: 'us', line: "Dust? Buddy, I'm the volcano." },
  ],
  tikal: [
    { who: 'us', line: "A pyramid so steep even the Maya needed a rope. I don't need a rope." },
    { who: 'gt', line: "Los mayas levantaron esto sin ruedas ni metal, americano. Tú no eres más que otra tormenta." },
    { who: 'us', line: "Another storm. Finally, somebody with the right forecast." },
  ],
  teotihuacan: [
    { who: 'us', line: "The Pyramid of the Sun. I brought the eclipse." },
    { who: 'mx', line: "Los aztecas hallaron esta ciudad ya abandonada y no se atrevieron a tocarla. Tú tampoco deberías." },
    { who: 'us', line: "The Aztecs didn't dare. The Aztecs didn't have a one-five-five." },
  ],
  machupicchu: [
    { who: 'us', line: "A city on a mountaintop nobody found for four hundred years. Congratulations, you're found." },
    { who: 'pe', line: "Los incas cortaron estas piedras para que ni un cuchillo entre. Tus obuses tampoco entrarán." },
    { who: 'us', line: "Not even a knife, he says. Good thing I brought a bigger knife." },
  ],
  greatwall: [
    { who: 'us', line: "Twenty thousand kilometres of wall and I only need a hundred metres of it. Do the math." },
    { who: 'cn', line: "长城两千年没被攻破过。你不过是又一个北方来的蛮子。" },
    { who: 'us', line: "From the north? Son, I'm from Ohio. Fire." },
  ],
};
