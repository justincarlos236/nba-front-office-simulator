// A soft cap, not a hard product limit - guards against unbounded DB
// growth (each league bootstraps ~500+ rows) rather than reflecting any
// real reason a user couldn't run more franchises. Raise it if it turns
// out to matter.
export const MAX_LEAGUES_PER_USER = 5;
