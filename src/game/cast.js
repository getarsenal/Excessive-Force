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
};

/** Which defender holds each level. */
export const DEFENDER_OF = {
  westminster: 'uk', paris: 'fr', agra: 'in', giza: 'eg',
  chichen: 'mx', pisa: 'it', moscow: 'ru', sydney: 'au', rio: 'br',
  athens: 'gr', istanbul: 'tr', cologne: 'de', himeji: 'jp', dubai: 'ae',
  petronas: 'my', potala: 'cn',
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
};
