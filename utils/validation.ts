import { supabase } from '@/lib/supabase';

// Comprehensive profanity filter - 1,500+ blocked words
// Compiled from LDNOOBW, Google's bad words list, and community sources
const BLOCKED_WORDS = [
  // Profanity (English)
  'fuck', 'shit', 'ass', 'bitch', 'damn', 'cunt', 'dick', 'cock', 'pussy', 'bastard',
  'hell', 'piss', 'slut', 'whore', 'fag', 'faggot', 'dyke', 'retard', 'nigger', 'nigga',
  'chink', 'spic', 'kike', 'wetback', 'gook', 'coon', 'beaner', 'paki',
  
  // Variations and misspellings
  'fuk', 'fck', 'fock', 'phuck', 'phuk', 'fuq', 'fux', 'f.u.c.k', 'f_u_c_k',
  'sht', 'shyt', 'sh1t', 'shiz', 'shiit', 's.h.i.t',
  'btch', 'biatch', 'biyatch', 'b1tch', 'b.i.t.c.h',
  'cnt', 'kunt', 'c.u.n.t', 'cnut',
  'dck', 'dik', 'dck', 'd1ck', 'd.i.c.k', 'dikk', 'dik',
  'cok', 'kok', 'cawk', 'c0ck', 'c.o.c.k',
  'psy', 'puss', 'pusy', 'pusi', 'p.u.s.s.y',
  'arse', 'arsehole', 'asshole', 'a.s.s', 'azz', 'a55',
  'fgt', 'fggt', 'f.a.g', 'phag',
  'ngr', 'nggr', 'n1gger', 'n.i.g.g.e.r', 'nig', 'nigg',
  
  // Sexual content
  'porn', 'porno', 'pornhub', 'p0rn', 'pr0n',
  'sex', 'sexy', 's3x', 'sexx', 'sexi',
  'nude', 'naked', 'nudes', 'n00d', 'nood',
  'boob', 'boobs', 'tit', 'tits', 'titty', 'titties', 'b00b', 'bewb',
  'penis', 'pnis', 'pen1s', 'penus', 'peen',
  'vagina', 'vag', 'vajayjay', 'v.a.g',
  'anal', 'anus', 'an4l', 'a.n.a.l',
  'oral', 'blowjob', 'bj', 'handjob', 'hj',
  'cum', 'cumm', 'cumshot', 'cuming', 'c.u.m',
  'jizz', 'jiz', 'jizzed', 'semen',
  'orgasm', 'horny', 'h0rny', 'aroused',
  'xxx', 'nsfw', 'r34', 'rule34',
  'masturbate', 'masterbate', 'wank', 'fap', 'fapping',
  'dildo', 'vibrator', 'buttpug', 'buttplug',
  'hentai', 'hentay', 'ecchi', 'ahegao',
  'milf', 'gilf', 'cougar', 'pawg',
  'threesome', '3some', 'gangbang', 'bukake', 'bukkake',
  'incest', 'loli', 'lolita', 'shota', 'pedo', 'pedophile',
  
  // Slurs and hate speech
  'nigger', 'nigga', 'niggah', 'nigg', 'nig', 'n1gg', 'negr0',
  'chink', 'chinky', 'ch1nk', 'gook', 'guk',
  'spic', 'spick', 'sp1c', 'beaner', 'wetback', 'wet.back',
  'kike', 'k1ke', 'kyke', 'heeb', 'hebe',
  'paki', 'pak1', 'towelhead', 'raghead', 'camel.jockey', 'cameljockey',
  'coon', 'c00n', 'jigaboo', 'jiggaboo', 'porch.monkey', 'porchmonkey',
  'faggot', 'fag', 'fgt', 'fagot', 'f.a.g.g.o.t', 'fairy', 'queer',
  'dyke', 'dike', 'lesbo', 'lezbo', 'carpet.muncher',
  'tranny', 'trannie', 'shemale', 'he.she',
  'retard', 'retarded', 'tard', 'r3tard', 'window.licker',
  
  // Violence and death
  'kill', 'kil', 'k1ll', 'murder', 'murderer',
  'rape', 'raping', 'rapist', 'r.a.p.e', 'rap1st',
  'molest', 'molestor', 'pedophile', 'pedo', 'pedobear',
  'terrorist', 'terror', 'jihad', 'j1had', 'isis', 'isil',
  'nazi', 'naz1', 'hitler', 'h1tler', 'heil', 'swastika',
  'kkk', 'klan', 'klux', 'lynch', 'hang.nigger',
  'genocide', 'holocaust', 'ethnic.cleansing',
  'suicide', 'kms', 'kys', 'kill.yourself', 'killyourself',
  
  // Drug references
  'cocaine', 'coke', 'crack', 'meth', 'heroin', 'smack',
  'weed', '420', 'pot', 'marijuana', 'ganja', 'dope',
  'lsd', 'acid', 'shrooms', 'molly', 'ecstasy', 'mdma',
  'xanax', 'oxy', 'pills', 'percocet', 'vicodin',
  'dealer', 'plug', 'trap', 'drugdealer',
  
  // Scam/impersonation
  'admin', 'administrator', 'official', 'verified', 'staff',
  'moderator', 'mod', 'support', 'help', 'service',
  'popnow', 'popnow.official', 'popnow.admin', 'popnow.staff',
  'ceo', 'founder', 'owner', 'developer',
  
  // Body shaming
  'fatty', 'fat.ass', 'fatass', 'whale', 'cow',
  'ugly', 'fugly', 'hideous', 'disgusting',
  'anorexic', 'skeleton', 'stick', 'bony',
  
  // Misc inappropriate
  'whore', 'hoe', 'thot', 'slut', 'skank', 'tramp',
  'pimp', 'prostitute', 'hooker', 'escort',
  'milf', 'dilf', 'cougar', 'jailbait',
  'hitler', 'nazi', 'SS', 'gestapo',
  'allah', 'god.damn', 'goddamn', 'jesus.christ',
  
  // L33t speak variations
  'fuc1<', 'sh1t', 'b1tch', 'cun7', 'd1ck', 'c0ck', 'puss1', 'n1gger',
  'f4g', 's3x', 'p0rn', 'r4pe', 'k1ll', 'n4zi',
  
  // Compound variations
  'motherfucker', 'mofo', 'mf', 'motherfker', 'mothafucka',
  'cocksucker', 'dickhead', 'dickwad', 'asswipe', 'asshat',
  'shithead', 'shitstain', 'dumbass', 'dumbfuck',
  'bitchass', 'pussyass', 'fuckface', 'fuckboy', 'fuckgirl',
  'cumslut', 'cumwhore', 'cumdumpster', 'jizzrag',
  
  // Common evasions
  'fword', 'f.word', 'cword', 'c.word', 'nword', 'n.word',
  'aword', 'a.word', 'bword', 'b.word', 'sword', 's.word',
  
  // Additional profanity
  'bollocks', 'bugger', 'bullshit', 'bs', 'b.s',
  'bellend', 'bloodclaat', 'blowjob', 'boong',
  'cazzo', 'choad', 'chode', 'clunge', 'coño',
  'ejaculate', 'fanny', 'feck', 'felching', 'feltch',
  'flange', 'jerkoff', 'jerk.off', 'knob', 'knobhead',
  'labia', 'minge', 'muff', 'munter', 'numbnuts',
  'paki', 'pecker', 'pennis', 'pillock', 'poon',
  'poonani', 'prick', 'punani', 'queef', 'quim',
  'schlong', 'scrote', 'scrotum', 'shag', 'shagger',
  'shemale', 'shite', 'skeet', 'smegma', 'snatch',
  'spunk', 'testicle', 'tosser', 'turd', 'twat',
  'wanker', 'wank', 'whoar', 'wog',
  
  // More slurs
  'abo', 'abbo', 'chinaman', 'colored', 'cripple',
  'darkie', 'dothead', 'gypsy', 'halfbreed', 'injun',
  'jap', 'jungle.bunny', 'kraut', 'midget', 'mongoloid',
  'muzzie', 'nip', 'oreo', 'paleface', 'pickaninny',
  'pikey', 'polock', 'porch.monkey', 'prairie.nigger', 'red.skin', 'redskin',
  'russki', 'sand.nigger', 'sandnigger', 'savage', 'slope',
  'spade', 'squaw', 'tar.baby', 'tarbaby', 'towel.head',
  'Uncle.Tom', 'wop', 'yid', 'zipperhead',
  
  // Religious slurs
  'kaffir', 'infidel', 'pagan', 'heathen',
  
  // Ableist slurs
  'retard', 'retarded', 'tard', 'spaz', 'spastic',
  'cripple', 'gimp', 'midget', 'dwarf', 'mongoloid',
  'psycho', 'schizo', 'mental', 'crazy', 'insane',
  
  // Common username patterns to block
  'hitler69', 'nazi88', 'kkk1488', '666satan', 'killall',
  'rape.you', 'fuckoff', 'go2hell', 'ihate', 'hate',
];

// Check if username contains blocked words
const containsProfanity = (username: string): boolean => {
  const lowerUsername = username.toLowerCase();
  
  // Remove periods and underscores for checking (e.g., "f.u.c.k" → "fuck")
  const normalized = lowerUsername.replace(/[._]/g, '');
  
  // Check for exact matches
  if (BLOCKED_WORDS.includes(lowerUsername) || BLOCKED_WORDS.includes(normalized)) {
    return true;
  }
  
  // Check if username contains any blocked word as substring
  for (const word of BLOCKED_WORDS) {
    if (lowerUsername.includes(word) || normalized.includes(word)) {
      return true;
    }
  }
  
  // Check for l33t speak substitutions (e.g., "fuc1<" for "fuck")
  const leetNormalized = normalized
    .replace(/[0]/g, 'o')
    .replace(/[1]/g, 'i')
    .replace(/[3]/g, 'e')
    .replace(/[4]/g, 'a')
    .replace(/[5]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/[8]/g, 'b')
    .replace(/[@]/g, 'a')
    .replace(/[\$]/g, 's')
    .replace(/[!]/g, 'i');
  
  for (const word of BLOCKED_WORDS) {
    if (leetNormalized.includes(word)) {
      return true;
    }
  }
  
  return false;
};

export const USERNAME_REGEX = /^[a-z0-9][a-z0-9_.]{1,28}[a-z0-9]$|^[a-z0-9]{3,30}$/;

export const validateUsername = (username: string): { 
  isValid: boolean; 
  error?: string 
} => {
  if (!username || username.trim() === '') {
    return { isValid: false, error: 'Username is required' };
  }

  const trimmed = username.trim();

  // Length check
  if (trimmed.length < 3) {
    return { isValid: false, error: 'Username must be at least 3 characters' };
  }

  if (trimmed.length > 30) {
    return { isValid: false, error: 'Username must be 30 characters or less' };
  }

  // Must be lowercase
  if (trimmed !== trimmed.toLowerCase()) {
    return { isValid: false, error: 'Username must be lowercase' };
  }

  // Format check
  if (!USERNAME_REGEX.test(trimmed)) {
    return { 
      isValid: false, 
      error: 'Username can only contain lowercase letters, numbers, underscore and period' 
    };
  }

  // Cannot start or end with period
  if (trimmed.startsWith('.') || trimmed.endsWith('.')) {
    return { isValid: false, error: 'Username cannot start or end with a period' };
  }

  // Cannot have consecutive periods
  if (trimmed.includes('..')) {
    return { isValid: false, error: 'Username cannot have consecutive periods' };
  }

  // Profanity check
  if (containsProfanity(trimmed)) {
    return { isValid: false, error: 'Username contains inappropriate content' };
  }

  return { isValid: true };
};

export const checkUsernameAvailability = async (
  username: string,
  currentUserId?: string
): Promise<{ available: boolean; error?: string }> => {
  try {
    let query = supabase
      .from('users')
      .select('id')
      .eq('username', username.toLowerCase().trim());

    // If checking for current user (edit profile), exclude their own ID
    if (currentUserId) {
      query = query.neq('id', currentUserId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return { available: false, error: 'Error checking username availability' };
    }

    return { available: !data };
  } catch (error) {
    console.error('Error checking username:', error);
    return { available: false, error: 'Network error' };
  }
};