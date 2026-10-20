/**
 * Ordinamenti degli elenchi lunghi (pazienti, visite), con gli stessi
 * risultati dei confronti scritti a mano ma senza rifare a ogni confronto il
 * lavoro che basta fare una volta. Con 3000 pazienti e 15000 visite erano
 * decine o centinaia di millisecondi a ogni apertura di pagina.
 */

const COLLATORE_NOMI = new Intl.Collator("it", { sensitivity: "base" });

/**
 * Confronto alfabetico italiano che non distingue maiuscole e accenti: lo
 * stesso risultato di `a.localeCompare(b, "it", { sensitivity: "base" })`.
 *
 * Con locale e opzioni `localeCompare` prepara un collatore nuovo a ogni
 * chiamata: ordinare 3000 pazienti per cognome costava ~300 ms, con un
 * collatore solo ~8.
 */
export function confrontaNomi(a: string, b: string): number {
  return COLLATORE_NOMI.compare(a, b);
}

/**
 * Ordinamento stabile dalla chiave più alta alla più bassa, con la chiave
 * calcolata una volta per elemento invece che a ogni confronto. Restituisce un
 * array nuovo, nello stesso ordine di
 * `[...elementi].sort((a, b) => chiave(b) - chiave(a))`.
 *
 * Serve soprattutto per le date: `new Date(...)` dentro il comparatore, su
 * 15000 visite, voleva dire mezzo milione di date lette e ~100 ms.
 */
export function ordinaPerChiaveDecrescente<T>(
  elementi: readonly T[],
  chiave: (elemento: T) => number,
): T[] {
  return elementi
    .map((elemento) => ({ elemento, valore: chiave(elemento) }))
    .sort((a, b) => b.valore - a.valore)
    .map(({ elemento }) => elemento);
}
