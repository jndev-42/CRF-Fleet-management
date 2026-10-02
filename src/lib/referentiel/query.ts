/**
 * Question en langage naturel → requête FTS5.
 *
 * Pas d'IA : on retire les mots vides, on garde les termes utiles, on y ajoute
 * quelques équivalents du métier (RCP, DAE…), et on les combine en `OR` — le
 * classement `bm25` remonte les pages qui en contiennent le plus.
 *
 * Chaque terme est mis entre guillemets : la saisie de l'utilisateur ne peut
 * jamais produire d'opérateur FTS ni d'erreur de syntaxe.
 */

const STOP_WORDS = new Set([
    'a', 'au', 'aux', 'avec', 'ce', 'ces', 'cet', 'cette', 'dans', 'de', 'des', 'du', 'elle', 'en', 'est',
    'et', 'etre', 'il', 'ils', 'je', 'la', 'le', 'les', 'leur', 'lui', 'ma', 'mais', 'me', 'mes', 'moi',
    'mon', 'ne', 'nos', 'notre', 'nous', 'on', 'or', 'ou', 'par', 'pas', 'pour', 'qu', 'que', 'quel',
    'quelle', 'quelles', 'quels', 'qui', 'sa', 'se', 'ses', 'si', 'son', 'sur', 'ta', 'te', 'tes', 'toi',
    'ton', 'tu', 'un', 'une', 'vos', 'votre', 'vous',
    'devant', 'faire', 'fait', 'faut', 'comment', 'quoi', 'quand', 'peut', 'doit', 'dois', 'dit',
    'y', 'ca', 'cela', 'ceci', 'avoir', 'ai', 'ont', 'suis', 'sont', 'sera', 'alors', 'donc', 'tout',
    'tous', 'plus', 'moins', 'tres', 'comme', 'entre', 'vers', 'chez', 'sans', 'sous', 'ya', 'cest',
]);

/** Groupes d'équivalents : un terme d'un groupe fait chercher aussi tous les autres. */
const SYNONYM_GROUPS: string[][] = [
    ['rcp', 'reanimation cardiopulmonaire', 'massage cardiaque'],
    ['dae', 'defibrillateur', 'defibrillation'],
    ['avc', 'accident vasculaire cerebral'],
    ['pls', 'position laterale de securite'],
    ['malaise', 'detresse'],
];

const MAX_TERMS = 12;

/** Minuscules sans accents : sert à comparer aux mots vides et aux synonymes. */
function fold(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

function quote(term: string): string {
    const safe = term.replace(/"/g, '');
    // Un mot seul est cherché en préfixe (« hemorragie » → « hémorragies ») ; une expression, en phrase exacte.
    return safe.includes(' ') ? `"${safe}"` : `"${safe}"*`;
}

/**
 * Renvoie la requête FTS5 pour `question`, ou `null` s'il ne reste aucun terme
 * utile (question vide, mots vides seuls, ponctuation).
 */
export function buildFtsQuery(question: string): string | null {
    const words = (fold(question).match(/[\p{L}\p{N}]+/gu) ?? [])
        .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
    if (words.length === 0) return null;

    const terms: string[] = [];
    const add = (term: string) => {
        if (!terms.includes(term)) terms.push(term);
    };
    for (const word of words) add(word);
    for (const word of words) {
        for (const group of SYNONYM_GROUPS) {
            if (group.includes(word)) group.forEach(add);
        }
    }

    return terms.slice(0, MAX_TERMS).map(quote).join(' OR ');
}
