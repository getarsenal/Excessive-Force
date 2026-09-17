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
};

/** Which defender holds each level. */
export const DEFENDER_OF = { westminster: 'uk', paris: 'fr', agra: 'in', giza: 'eg' };

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
};
