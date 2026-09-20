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
    rank: 'F.M.', name: 'Sir Aubrey Pell', nation: 'United Kingdom', side: 'right',
    colours: ['#c8102e', '#ffffff', '#012169'],
  },
  fr: {
    id: 'fr', file: 'assets/characters/fr-marshal.png',
    rank: 'Maréchal', name: 'Gaspard Thibault', nation: 'France', side: 'right',
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
    rank: 'Generale', name: 'Ottavio Brambilla', nation: 'Italy', side: 'right',
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
};

/** Which defender holds each level. */
export const DEFENDER_OF = {
  westminster: 'uk', paris: 'fr', agra: 'in', giza: 'eg',
  chichen: 'mx', pisa: 'it', moscow: 'ru', sydney: 'au', rio: 'br',
};

/**
 * The stand-off before each level: ultimatum, refusal, last word.
 *
 * The defender's line is in his own language where the writer put it there;
 * the General never understands a word of it, which is the point.
 */
export const STANDOFF = {
  westminster: [
    { who: 'us', line: 'Give it up you limey bastard' },
    { who: 'uk', line: 'God save the queen, and your soul' },
    { who: 'us', line: "Thank god, I was worried we dragged this ordnance across the Atlantic for nothing!" },
  ],
  paris: [
    { who: 'us', line: 'Surrender or die Frenchie' },
    { who: 'fr', line: "Va t'étouffer avec une baguette" },
    { who: 'us', line: "All I heard was baguette, and that's all I need" },
  ],
  agra: [
    { who: 'us', line: 'Nice tomb. Vacate the premises before I add to the occupancy.' },
    { who: 'in', line: 'Twenty thousand men built this in twenty-two years. You have four guns and a hangover.' },
    { who: 'us', line: 'Twenty-two years? Give me twenty-two minutes.' },
  ],
  giza: [
    { who: 'us', line: "God it's hot out here, give it up before we all melt would ya?" },
    { who: 'eg', line: 'اطلع الهرم ده وهاتك يا طفل يا تخين' },
    { who: 'us', line: "I don't speak Sanskrit habibi, but I get the gist. Someone get me some damn water and a lot of bombs" },
  ],
  // ── Drafts. The five below are written here rather than handed over by the
  // writer, and are marked as such in `characters/manifest.json`. Same shape
  // as the rest: ultimatum, refusal in his own language, and a last word from
  // a man who did not understand a syllable of it.
  chichen: [
    { who: 'us', line: 'Step aside, chief. We do not negotiate with calendars.' },
    { who: 'mx', line: 'Llevas mil años tarde. Esto ya lo enterramos una vez y lo volvimos a construir encima.' },
    { who: 'us', line: 'Built it twice, huh? Well hell, that is half my work done for me.' },
  ],
  pisa: [
    { who: 'us', line: 'That thing is already falling over. Save us both the ammunition.' },
    { who: 'it', line: "Pende da ottocento anni, americano. Tu non duri otto minuti in questo sole." },
    { who: 'us', line: 'Eight hundred years of leaning. Let us call it a running start.' },
  ],
  moscow: [
    { who: 'us', line: 'Nine churches. I brought enough for ten.' },
    { who: 'ru', line: 'Иван ослепил зодчего, чтобы он не построил второго. Тебе глаза оставим — смотри.' },
    { who: 'us', line: 'I did not catch a word of that, but he sounded real confident about it.' },
  ],
  sydney: [
    { who: 'us', line: 'You are on a point with water on three sides. Where exactly are you going?' },
    { who: 'au', line: 'Mate, you have got one road in and we have got the whole harbour. Take your shot.' },
    { who: 'us', line: 'Finally, one of them speaks English. Does not make him right.' },
  ],
  rio: [
    { who: 'us', line: 'Seven hundred metres up with no road out. Walk down or be carried.' },
    { who: 'br', line: 'Ele está de braços abertos há um século. Nem por você ele abaixa.' },
    { who: 'us', line: 'Arms out like that? Son, that is not a welcome, that is a target.' },
  ],
};
