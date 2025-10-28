/**
 * @fileoverview Manages grapheme analysis for Greek and calculates
 * intelligent timing for syllables in lyrics highlighting.
 */

// Vowels are sorted by length to find multi-character ones first.
const GREEK_VOWELS  = [
    // Diphthongs
    'αι', 'ει', 'οι', 'υι', 'αυ', 'ευ', 'ηυ', 'ου',
    // Accented Diphthongs
    'αί', 'εί', 'οί', 'υί', 'αύ', 'εύ', 'ηύ', 'ού',
    // Single Vowels
    'α', 'ε', 'η', 'ι', 'ο', 'υ', 'ω',
    // Accented Single Vowels
    'ά', 'έ', 'ή', 'ί', 'ό', 'ύ', 'ώ',
].sort((a, b) => b.length - a.length);

// Consonants are now only single characters.
const GREEK_CONSONANTS = [
    'β', 'γ', 'δ', 'ζ', 'θ', 'κ', 'λ', 'μ', 'ν', 'ξ', 'π', 'ρ', 'σ', 'ς', 'τ', 'φ', 'χ', 'ψ'
];
// Create a Set for fast single-character consonant lookups.
const GREEK_CONSONANT_SET = new Set(GREEK_CONSONANTS);

const PUNCTUATION_MAP = {
    "'": 'apostrophe',
    '?': 'question_mark',
    ';': 'question_mark', // Greek question mark
    '.': 'period',
    ',': 'comma',
    '!': 'exclamation_mark',
    ':': 'colon',
    '"': 'double_quote',
    '«': 'guillemet_left',
    '»': 'guillemet_right',
    '-': 'hyphen',
};
const PUNCTUATION = Object.keys(PUNCTUATION_MAP);

/**
 * Analyzes a single character and returns its type and name.
 * Kept for compatibility with other modules.
 * @param {string} char The character to analyze.
 * @returns {{type: string, name?: string}} An object describing the character.
 */
export function getCharInfo(char) {
    const lowerChar = char.toLowerCase();
    if (GREEK_VOWELS.includes(lowerChar)) return { type: 'vowel' };
    if (GREEK_CONSONANT_SET.has(lowerChar)) return { type: 'consonant' };
    if (PUNCTUATION_MAP[char]) return { type: 'punctuation', name: PUNCTUATION_MAP[char] };
    return { type: 'other' };
}

/**
 * Internal helper to get the basic type of a single character.
 * @param {string} char The character to analyze.
 * @returns {string} The type ('vowel', 'consonant', 'punctuation', 'other').
 */
function getCharType(char) {
    const lowerChar = char.toLowerCase();
    if (GREEK_VOWELS.includes(lowerChar)) return 'vowel';
    if (GREEK_CONSONANT_SET.has(lowerChar)) return 'consonant';
    if (PUNCTUATION_MAP[char]) return 'punctuation';
    return 'other';
}

/**
 * Analyzes a token (which can be a multi-character consonant cluster) and returns its type.
 * @param {string} token The token to analyze (e.g., "αι", "σκρ", "'").
 * @returns {{type: string, name?: string}} An object describing the token.
 */
function getTokenInfo(token) {
    const lowerToken = token.toLowerCase();
    if (GREEK_VOWELS.includes(lowerToken)) return { type: 'vowel' };
    if (PUNCTUATION_MAP[token]) return { type: 'punctuation', name: PUNCTUATION_MAP[token] };
    if (GREEK_CONSONANT_SET.has(lowerToken[0])) return { type: 'consonant' };
    return { type: 'other' };
}

/**
 * Tokenizes a syllable string into an array of recognized graphemes,
 * grouping consecutive consonants into a single token.
 * Implements a greedy, backward-matching algorithm.
 * @param {string} syllable The syllable string (e.g., "σκρ'αι").
 * @returns {string[]} An array of tokens (e.g., ["σκρ", "'", "αι"]).
 */
function tokenizeSyllable(syllable) {
    const tokens = [];
    let remaining = syllable;

    while (remaining.length > 0) {
        let foundToken = null;

        // 1. Check for multi-character vowels first, as they have the highest priority.
        for (const vowel of GREEK_VOWELS) {
            if (remaining.endsWith(vowel)) {
                foundToken = vowel;
                break;
            }
        }

        if (foundToken) {
            tokens.unshift(foundToken);
            remaining = remaining.slice(0, -foundToken.length);
            continue;
        }

        // 2. If no multi-char vowel, check the last character's type.
        const lastChar = remaining.slice(-1);
        const lastCharType = getCharType(lastChar);

        if (lastCharType === 'consonant') {
            // It's a consonant, so find the start of the cluster.
            let clusterEnd = remaining.length;
            let clusterStart = clusterEnd - 1;
            while (clusterStart > 0 && getCharType(remaining[clusterStart - 1]) === 'consonant') {
                clusterStart--;
            }
            foundToken = remaining.substring(clusterStart, clusterEnd);
        } else {
            // It's a punctuation mark, single vowel, or other character.
            foundToken = lastChar;
        }

        tokens.unshift(foundToken);
        remaining = remaining.slice(0, -foundToken.length);
    }
    return tokens;
}

/**
 * Calculates the duration for each character within a syllable based on linguistic rules.
 * This function is now token-aware and groups consonant clusters.
 * @param {string} syllable The syllable string (e.g., "τράς").
 * @param {number} duration The total duration for the syllable in milliseconds.
 * @returns {Array<{char: string, duration: number}>} An array of objects, each with a character and its calculated duration.
 */
export function calculateSyllableTimings(syllable, duration) {
    if (!syllable || duration <= 0) {
        return [];
    }

    // Step 1: Tokenize the syllable into graphemes and consonant clusters.
    const tokens = tokenizeSyllable(syllable);
    const tokenInfos = tokens.map(t => ({ token: t, info: getTokenInfo(t) }));

    const symbolCount = tokenInfos.filter(ti => ti.info.type === 'punctuation').length;
    // A consonant cluster counts as one "letter token".
    const letterTokenCount = tokenInfos.length - symbolCount;

    const SYMBOL_PERCENTAGE = 10;
    const totalSymbolPercentage = symbolCount * SYMBOL_PERCENTAGE;

    // --- Overflow Rule ---
    // If symbols take up 100% or more, divide duration equally among all TOKENS.
    if (totalSymbolPercentage >= 100) {
        const equalDurationPerToken = duration / tokens.length;
        const result = [];
        tokenInfos.forEach(({ token }) => {
            // Distribute the token's duration equally among its characters.
            const durationPerChar = equalDurationPerToken / token.length;
            for (const char of token) {
                result.push({ char, duration: durationPerChar });
            }
        });
        return result;
    }

    // --- Standard Rule ---
    const remainingDuration = duration * (1 - (totalSymbolPercentage / 100));
    const durationPerSymbolToken = duration * (SYMBOL_PERCENTAGE / 100);
    const durationPerLetterToken = letterTokenCount > 0 ? remainingDuration / letterTokenCount : 0;

    const result = [];
    tokenInfos.forEach(({ token, info }) => {
        let tokenDuration = 0;
        if (info.type === 'punctuation') {
            tokenDuration = durationPerSymbolToken;
        } else { // Vowels, consonant clusters, and any 'other' tokens
            tokenDuration = durationPerLetterToken;
        }

        // Distribute the token's duration equally among its constituent characters.
        const durationPerChar = tokenDuration / token.length;
        for (const char of token) {
            result.push({ char, duration: durationPerChar });
        }
    });

    return result;
}