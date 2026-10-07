/**
 * Il titolo del referto di visita, ricavato dalla specializzazione del medico:
 * "VISITA CARDIOLOGICA" come su Corioli Cardiologia, "VISITA INTERNISTICA",
 * "VISITA GERIATRICA". Prima era "VISITA SPECIALISTICA" con sotto "Referto
 * Specialistico": due righe per non dire che visita fosse (Pablo, 8 ottobre
 * 2026).
 *
 * La specializzazione nel profilo e' testo libero ("Specialista in medicina
 * interna", "Cardiologia e geriatria"): vince la disciplina nominata per
 * prima. Se non se ne riconosce nessuna il titolo e' "Visita medica", che e'
 * vero per chiunque. Il medico puo' sempre scriverne uno suo nelle
 * impostazioni.
 */

const DISCIPLINE: [RegExp, string][] = [
  [/cardiolog/i, "Visita cardiologica"],
  [/medicina interna|internist/i, "Visita internistica"],
  [/geriatr/i, "Visita geriatrica"],
  [/endocrinolog/i, "Visita endocrinologica"],
  [/diabetolog/i, "Visita diabetologica"],
  [/pneumolog|malattie dell.apparato respiratorio/i, "Visita pneumologica"],
  [/neurolog/i, "Visita neurologica"],
  [/gastroenterolog/i, "Visita gastroenterologica"],
  [/nefrolog/i, "Visita nefrologica"],
  [/reumatolog/i, "Visita reumatologica"],
  [/dermatolog/i, "Visita dermatologica"],
  [/urolog/i, "Visita urologica"],
  [/ortoped/i, "Visita ortopedica"],
  [/angiolog|chirurgia vascolare/i, "Visita angiologica"],
  [/ematolog/i, "Visita ematologica"],
  [/oncolog/i, "Visita oncologica"],
  [/allergolog|immunolog/i, "Visita allergologica"],
  [/fisiatr|medicina fisica/i, "Visita fisiatrica"],
  [/otorino/i, "Visita otorinolaringoiatrica"],
  [/oculist|oftalmolog/i, "Visita oculistica"],
  [/psichiatr/i, "Visita psichiatrica"],
  [/pediatr/i, "Visita pediatrica"],
  [/infettiv/i, "Visita infettivologica"],
  [/medicina dello sport|medico dello sport/i, "Visita medico-sportiva"],
  [/nutrizion|dietolog|scienza dell.alimentazione/i, "Visita nutrizionale"],
  [/ginecolog/i, "Visita ginecologica"],
  [/chirurg/i, "Visita chirurgica"],
];

/** Quando la specializzazione non dice una disciplina riconoscibile. */
export const TITOLO_REFERTO_GENERICO = "Visita medica";

export function titoloDaSpecializzazione(specializzazione?: string | null): string {
  const testo = (specializzazione ?? "").trim();
  let migliore: { indice: number; titolo: string } | null = null;
  for (const [regola, titolo] of DISCIPLINE) {
    const indice = testo.search(regola);
    // La disciplina nominata per prima; a pari posizione, quella piu' in alto
    // nell'elenco ("chirurgia vascolare" e' angiologica, non chirurgica).
    if (indice >= 0 && (!migliore || indice < migliore.indice)) {
      migliore = { indice, titolo };
    }
  }
  return migliore?.titolo ?? TITOLO_REFERTO_GENERICO;
}

/** Il titolo scritto dal medico nelle impostazioni, altrimenti quello ricavato. */
export function titoloReferto(
  scelto: unknown,
  specializzazione?: string | null,
): string {
  return (typeof scelto === "string" && scelto.trim()) || titoloDaSpecializzazione(specializzazione);
}

/**
 * I titoli proposti nelle impostazioni, in ordine alfabetico dopo i due
 * generici: quelli che l'app sa ricavare dalla specializzazione. Il medico ne
 * puo' scrivere anche uno che qui non c'e'.
 */
export const TITOLI_REFERTO_PROPOSTI: string[] = [
  TITOLO_REFERTO_GENERICO,
  "Visita di controllo",
  ...Array.from(new Set(DISCIPLINE.map(([, titolo]) => titolo))).sort((a, b) =>
    a.localeCompare(b, "it"),
  ),
];
