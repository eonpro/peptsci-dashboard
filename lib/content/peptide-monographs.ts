/**
 * Authored peptide monographs shown on the product detail page.
 *
 * Editorial rules (mirrors the reference site and RUO posture):
 *  - Neutral, educational summaries of publicly reported research only.
 *  - NO therapeutic-efficacy claims, NO sourcing/purchasing guidance.
 *  - Everything is framed as "studied / reported in research" — not approved
 *    indications, not medical advice, not dosing recommendations.
 *  - Content is authored in-house; source material was adapted (not copied)
 *    from public references.
 *
 * Keyed by a normalized product name (see `normalizeKey`). The backfill script
 * and the demo seed use `getMonographForName` to attach these to Product rows.
 */
import type { PeptideMonograph, MonographReference } from '../types/monograph'

function pubmed(term: string): MonographReference {
  return {
    label: `PubMed - ${term}`,
    url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(term)}`,
  }
}

function dailymed(term: string): MonographReference {
  return {
    label: `DailyMed - ${term}`,
    url: `https://dailymed.nlm.nih.gov/dailymed/search.cfm?query=${encodeURIComponent(term)}`,
  }
}

const RUO_DISCLAIMER =
  'For research use only. Not for human or veterinary use. Statements describe publicly reported research and are not FDA-approved indications or therapeutic claims.'

const RX_DISCLAIMER =
  'Prescription reference only. Any use must follow approved product labeling and a licensed prescriber. This summary is educational and is not medical advice.'

/**
 * Master content collection. Add a peptide by appending an entry; keys are
 * normalized at lookup time so casing/spacing/hyphens do not matter.
 */
export const PEPTIDE_MONOGRAPHS: Record<string, PeptideMonograph> = {
  'bpc-157': {
    overview: [
      'BPC-157 is a synthetic 15-amino-acid peptide derived from a sequence identified in human gastric juice. It has been studied extensively in preclinical models examining connective, muscular, and soft-tissue repair.',
      'The bulk of the published literature is animal or in vitro work; high-quality human clinical trial data remains limited. It is not an approved medicine in the United States.',
    ],
    mechanismOfAction: [
      'Angiogenic signaling: research reports upregulation of vascular growth factor pathways (including VEGFR2) that support new blood-vessel formation in injured tissue models.',
      'Tissue repair: studied for effects on fibroblast migration and tendon/ligament cell outgrowth in vitro.',
      'Cytoprotection: animal models describe protective effects on gastrointestinal and vascular tissue under stress conditions.',
    ],
    observations: [
      { title: 'Tendon & Ligament Research', detail: 'Preclinical studies report support for tendon-to-bone healing and fibroblast activity in injury models.' },
      { title: 'Gastrointestinal Models', detail: 'Animal research describes protective effects on gastric and intestinal mucosa under experimental injury.' },
      { title: 'Vascular Support', detail: 'In vitro and animal data suggest a role in angiogenesis at sites of tissue damage.' },
    ],
    references: [pubmed('BPC-157'), pubmed('BPC 157 tendon healing')],
    disclaimer: RUO_DISCLAIMER,
  },

  'tb-500': {
    overview: [
      'TB-500 corresponds to an active region of thymosin beta-4 (Tβ4), a naturally occurring peptide involved in actin regulation and cell migration.',
      'Most available evidence is preclinical, focusing on tissue repair and cellular motility. It is not an approved human medicine.',
    ],
    mechanismOfAction: [
      'Actin regulation: Tβ4-related sequences bind G-actin and influence cytoskeletal dynamics implicated in cell migration.',
      'Cell migration & angiogenesis: research describes support for endothelial and other cell movement toward injured tissue.',
      'Inflammatory modulation: animal studies report effects on inflammatory signaling during repair.',
    ],
    observations: [
      { title: 'Tissue Repair Research', detail: 'Animal models report support for muscle and connective-tissue recovery after injury.' },
      { title: 'Cardiac Models', detail: 'Preclinical work has examined thymosin beta-4 in cardiac tissue repair.' },
      { title: 'Cell Motility', detail: 'In vitro studies describe enhanced cell migration relevant to wound closure.' },
    ],
    references: [pubmed('thymosin beta 4'), pubmed('TB-500')],
    disclaimer: RUO_DISCLAIMER,
  },

  'ghk-cu': {
    overview: [
      'GHK-Cu is a naturally occurring copper complex of the tripeptide glycyl-L-histidyl-L-lysine (GHK), found in human plasma and studied widely in skin, wound, and tissue-remodeling research.',
      'Topical cosmetic uses of GHK-Cu are established; injectable research use is not an approved medical indication in the U.S.',
    ],
    mechanismOfAction: [
      'Copper delivery: acts as a carrier for copper ions used by enzymes involved in tissue remodeling.',
      'Extracellular matrix signaling: research reports modulation of collagen, elastin, and glycosaminoglycan synthesis in dermal models.',
      'Antioxidant & repair pathways: studied for influence on wound-repair gene expression in vitro.',
    ],
    observations: [
      { title: 'Skin & Dermatology Research', detail: 'Studies report support for collagen production and skin appearance in topical models.' },
      { title: 'Wound Healing', detail: 'Preclinical work describes support for granulation tissue and repair signaling.' },
      { title: 'Hair Follicle Models', detail: 'Some research has examined GHK-Cu in follicular and scalp tissue contexts.' },
    ],
    references: [pubmed('GHK-Cu'), pubmed('copper tripeptide-1')],
    disclaimer: RUO_DISCLAIMER,
  },

  'll-37': {
    overview: [
      'LL-37 is the C-terminal peptide of human cathelicidin (hCAP18), an endogenous antimicrobial peptide studied for dual antimicrobial and immunomodulatory properties.',
      'Research spans antimicrobial activity, wound biology, and innate-immune signaling. It is not an approved injectable antimicrobial therapy for general use.',
    ],
    mechanismOfAction: [
      'Membrane interaction (in vitro): shown in laboratory models to disrupt microbial membranes and biofilms.',
      'Immunomodulation: research suggests LL-37 may influence innate immune signaling, including cytokine activity and inflammatory pathways.',
      'Tissue remodeling: studies describe roles in angiogenesis, leukocyte recruitment, and keratinocyte proliferation.',
    ],
    observations: [
      { title: 'Wound-Healing Research', detail: 'Early-phase studies report LL-37 may support granulation tissue formation and wound-closure processes in chronic or slow-healing models.' },
      { title: 'Antimicrobial Activity (Laboratory Data Only)', detail: 'In vitro testing shows broad activity against Gram-positive and Gram-negative organisms and may limit biofilm persistence.' },
      { title: 'Anti-Inflammatory Signaling (Preclinical)', detail: 'Research indicates LL-37 may modulate excessive inflammatory signaling at wound sites through innate immune pathways.' },
      { title: 'Angiogenesis & Tissue Support', detail: 'Studies show LL-37 may stimulate new blood-vessel formation and keratinocyte migration in model systems.' },
    ],
    references: [
      { label: 'Grönberg A, et al. (2014). Treatment with LL-37 in hard-to-heal venous leg ulcers. Wound Repair Regen.', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=LL-37+venous+leg+ulcer' },
      pubmed('LL-37 cathelicidin'),
      pubmed('LL-37 wound healing'),
    ],
    disclaimer: RUO_DISCLAIMER,
  },

  'aod-9604': {
    overview: [
      'AOD-9604 is a synthetic peptide based on a C-terminal fragment (residues 176-191) of human growth hormone, investigated in metabolic and lipolysis-related research.',
      'It is not an FDA-approved medicine for weight loss. This profile is educational reference only.',
    ],
    mechanismOfAction: [
      'Lipid metabolism: preclinical research examines effects on fat metabolism distinct from the full growth-hormone molecule.',
      'Limited GH-axis activity: designed to retain a fat-related fragment without the full metabolic profile of growth hormone.',
    ],
    observations: [
      { title: 'Metabolic Research', detail: 'Animal studies report interest in lipolysis and fat-metabolism endpoints.' },
      { title: 'Cartilage Models', detail: 'Some research has explored AOD-9604 in joint and cartilage contexts.' },
    ],
    references: [pubmed('AOD-9604'), pubmed('hGH fragment 176-191')],
    disclaimer: RUO_DISCLAIMER,
  },

  'cjc-1295': {
    overview: [
      'CJC-1295 is a synthetic growth hormone-releasing hormone (GHRH) analog studied for stimulating endogenous growth-hormone release. Research references both the Mod GRF 1-29 form (without DAC) and a longer-acting Drug Affinity Complex (DAC) form.',
      'Neither form is an approved human medicine for performance or anti-aging use.',
    ],
    mechanismOfAction: [
      'GHRH receptor agonism: binds pituitary GHRH receptors to promote pulsatile growth-hormone secretion in study models.',
      'Extended half-life (DAC): the DAC modification is designed to prolong circulating activity in research settings.',
      'Synergy studies: frequently examined alongside ghrelin mimetics such as Ipamorelin.',
    ],
    observations: [
      { title: 'Growth Hormone Research', detail: 'Studies examine increased GH and downstream IGF-1 activity in model systems.' },
      { title: 'Combination Protocols', detail: 'Research literature often pairs GHRH analogs with GHRPs to study additive GH release.' },
    ],
    references: [pubmed('CJC-1295'), pubmed('Mod GRF 1-29')],
    disclaimer: RUO_DISCLAIMER,
  },

  ipamorelin: {
    overview: [
      'Ipamorelin is a selective pentapeptide ghrelin-receptor agonist (a growth hormone-releasing peptide) studied for stimulating endogenous growth-hormone release.',
      'Research comparisons describe a relatively focused receptor profile with less reported effect on cortisol and prolactin than some earlier GHRPs. It is not an approved medicine.',
    ],
    mechanismOfAction: [
      'Ghrelin receptor agonism: activates the GH secretagogue receptor to promote GH release in study models.',
      'Selective profile: research reports limited impact on cortisol/prolactin relative to older GHRPs.',
      'Combination studies: often examined alongside GHRH analogs such as CJC-1295.',
    ],
    observations: [
      { title: 'Growth Hormone Research', detail: 'Studies examine pulsatile GH release and downstream IGF-1 activity.' },
      { title: 'Tolerability Models', detail: 'Research notes a comparatively selective secretagogue profile.' },
    ],
    references: [pubmed('ipamorelin')],
    disclaimer: RUO_DISCLAIMER,
  },

  'ghrp-2': {
    overview: [
      'GHRP-2 (pralmorelin) is a synthetic ghrelin-receptor agonist used in research and diagnostic contexts related to growth-hormone release.',
      'It is not approved as a general wellness or performance medicine in the U.S.',
    ],
    mechanismOfAction: [
      'Ghrelin receptor agonism: stimulates pituitary GH secretion in study and diagnostic settings.',
      'Appetite pathways: research describes ghrelin-related effects on feeding signaling.',
    ],
    observations: [
      { title: 'Growth Hormone Research', detail: 'Studied as a GH secretagogue, including in diagnostic evaluation of GH reserve.' },
    ],
    references: [pubmed('GHRP-2'), pubmed('pralmorelin')],
    disclaimer: RUO_DISCLAIMER,
  },

  'ghrp-6': {
    overview: [
      'GHRP-6 is a synthetic hexapeptide ghrelin mimetic studied for stimulating growth-hormone release and appetite-related pathways.',
      'It is not an approved medicine for body-composition use.',
    ],
    mechanismOfAction: [
      'Ghrelin receptor agonism: promotes GH secretion via the GH secretagogue receptor in study models.',
      'Feeding behavior: research describes appetite-stimulating effects consistent with ghrelin signaling.',
    ],
    observations: [
      { title: 'Growth Hormone Research', detail: 'Examined as a GH secretagogue in preclinical and research contexts.' },
      { title: 'Appetite Models', detail: 'Studies report ghrelin-associated appetite effects.' },
    ],
    references: [pubmed('GHRP-6')],
    disclaimer: RUO_DISCLAIMER,
  },

  hexarelin: {
    overview: [
      'Hexarelin (examorelin) is a potent synthetic hexapeptide that stimulates growth-hormone secretion via the ghrelin receptor, evaluated in clinical and preclinical research.',
      'It is not approved for general therapeutic or athletic use in the U.S.',
    ],
    mechanismOfAction: [
      'Ghrelin receptor agonism: strong GH secretagogue activity reported in research models.',
      'Cardiac research: some studies have examined GH-independent effects on cardiac tissue.',
    ],
    observations: [
      { title: 'Growth Hormone Research', detail: 'Investigated as a potent GH-releasing peptide in various protocols.' },
      { title: 'Cardiovascular Models', detail: 'Preclinical work has explored effects on cardiac tissue.' },
    ],
    references: [pubmed('hexarelin')],
    disclaimer: RUO_DISCLAIMER,
  },

  sermorelin: {
    overview: [
      'Sermorelin is a synthetic fragment (GHRH 1-29) of growth hormone-releasing hormone, historically used to evaluate and stimulate endogenous GH secretion under medical supervision in some jurisdictions.',
      'Availability and approved uses vary. This profile is educational and for reconstitution/math literacy only.',
    ],
    mechanismOfAction: [
      'GHRH receptor agonism: stimulates pituitary GH release using the shortest active GHRH sequence.',
      'Diagnostic use: historically applied to assess pituitary GH reserve.',
    ],
    observations: [
      { title: 'Growth Hormone Research', detail: 'Used in diagnostic and treatment contexts to promote endogenous GH secretion.' },
    ],
    references: [pubmed('sermorelin')],
    disclaimer: RUO_DISCLAIMER,
  },

  tesamorelin: {
    overview: [
      'Tesamorelin is a synthetic growth hormone-releasing hormone (GHRH) analog. An FDA-approved product (Egrifta) exists for a specific indication related to HIV-associated lipodystrophy under clinician care.',
      'Use outside labeled indications requires a prescribing provider\u2019s judgment. This profile is for educational reference only.',
    ],
    mechanismOfAction: [
      'GHRH receptor agonism: stimulates pituitary release of endogenous growth hormone.',
      'Visceral fat research: clinical studies examined effects on visceral adipose tissue in the approved population.',
    ],
    observations: [
      { title: 'Metabolic Research', detail: 'Clinical research examined reductions in visceral adipose tissue in the labeled indication.' },
      { title: 'GH / IGF-1 Axis', detail: 'Studies describe increases in IGF-1 consistent with GHRH activity.' },
    ],
    references: [dailymed('tesamorelin'), pubmed('tesamorelin')],
    disclaimer: RX_DISCLAIMER,
  },

  dihexa: {
    overview: [
      'Dihexa is a small synthetic angiotensin IV-related peptide investigated in animal research for effects on synaptic plasticity and cognition.',
      'Human clinical evidence is limited. It is not an approved medicine.',
    ],
    mechanismOfAction: [
      'Hepatocyte growth factor (HGF)/c-Met signaling: research proposes involvement in synaptogenesis pathways.',
      'Synaptic plasticity: preclinical studies examine effects on dendritic and synaptic endpoints.',
    ],
    observations: [
      { title: 'Cognitive Research', detail: 'Animal studies report interest in learning and memory endpoints.' },
      { title: 'Synaptogenesis Models', detail: 'Preclinical work explores new synapse formation.' },
    ],
    references: [pubmed('Dihexa peptide')],
    disclaimer: RUO_DISCLAIMER,
  },

  dsip: {
    overview: [
      'Delta sleep-inducing peptide (DSIP) is a nonapeptide first described in sleep research and subsequently studied for various physiological endpoints in animals and limited human studies.',
      'It is not an FDA-approved sleep medicine. Educational reference only.',
    ],
    mechanismOfAction: [
      'Neuromodulation: research explores effects on sleep-related and stress-related signaling.',
      'Endocrine interactions: some studies examine interactions with hormonal pathways.',
    ],
    observations: [
      { title: 'Sleep Research', detail: 'Historically studied in the context of sleep regulation.' },
      { title: 'Stress Models', detail: 'Some literature examines stress-related endpoints.' },
    ],
    references: [pubmed('delta sleep-inducing peptide')],
    disclaimer: RUO_DISCLAIMER,
  },

  epitalon: {
    overview: [
      'Epitalon (Epithalon) is a synthetic tetrapeptide associated with research on pineal peptides and cellular-aging markers.',
      'Most data is from animal or cell studies. It is not an approved anti-aging medicine.',
    ],
    mechanismOfAction: [
      'Telomerase-related research: some studies examine effects on telomerase activity in cell models.',
      'Pineal/circadian signaling: investigated for interactions with melatonin-related pathways.',
    ],
    observations: [
      { title: 'Longevity Research', detail: 'Animal and cell studies explore aging-related biomarkers.' },
      { title: 'Circadian Models', detail: 'Research has examined pineal and circadian endpoints.' },
    ],
    references: [pubmed('Epitalon'), pubmed('Epithalon')],
    disclaimer: RUO_DISCLAIMER,
  },

  'foxo4-dri': {
    overview: [
      'FOXO4-DRI is a synthetic D-retro-inverso peptide used in laboratory research on cellular senescence, designed to interfere with the FOXO4-p53 interaction.',
      'Evidence is preclinical. It is not approved for human therapeutic use.',
    ],
    mechanismOfAction: [
      'FOXO4-p53 disruption: research reports interference with a protein interaction implicated in senescent-cell survival.',
      'Senolytic models: studied for selective effects on senescent cells in vitro and in animals.',
    ],
    observations: [
      { title: 'Senescence Research', detail: 'Preclinical studies examine clearance of senescent cells.' },
    ],
    references: [pubmed('FOXO4-DRI')],
    disclaimer: RUO_DISCLAIMER,
  },

  'fragment-176-191': {
    overview: [
      'hGH fragment 176-191 is a synthetic peptide corresponding to a C-terminal portion of the growth-hormone molecule, studied for metabolic endpoints separate from full-length GH activity.',
      'It is not an approved medicine. Educational reference only.',
    ],
    mechanismOfAction: [
      'Lipid metabolism: research examines fat-metabolism effects associated with this GH fragment.',
      'Limited GH-axis activity: designed to isolate a fat-related region of growth hormone.',
    ],
    observations: [
      { title: 'Metabolic Research', detail: 'Animal studies report interest in lipolysis endpoints.' },
    ],
    references: [pubmed('hGH fragment 176-191')],
    disclaimer: RUO_DISCLAIMER,
  },

  kisspeptin: {
    overview: [
      'Kisspeptins regulate GnRH release and reproductive endocrine axes. Synthetic kisspeptin-10 and related forms appear in research and some clinical investigative contexts.',
      'Approved therapeutic status varies by formulation and indication; treat this profile as educational reference only.',
    ],
    mechanismOfAction: [
      'GnRH regulation: activates kisspeptin receptors to influence gonadotropin-releasing hormone signaling.',
      'Reproductive axis: research examines downstream LH/FSH and sex-hormone effects.',
    ],
    observations: [
      { title: 'Reproductive Research', detail: 'Studied in the context of the hypothalamic-pituitary-gonadal axis.' },
      { title: 'Endocrine Models', detail: 'Research examines gonadotropin responses.' },
    ],
    references: [pubmed('kisspeptin-10')],
    disclaimer: RUO_DISCLAIMER,
  },

  'melanotan-ii': {
    overview: [
      'Melanotan II is a synthetic cyclic heptapeptide that activates melanocortin receptors, studied for pigmentation and related pathways.',
      'It is not FDA-approved, and safety concerns have been discussed in the literature. This profile is educational reference only.',
    ],
    mechanismOfAction: [
      'Melanocortin receptor agonism: non-selectively activates melanocortin receptors, including MC1R (pigmentation) and MC4R.',
      'Pigmentation pathways: research examines melanogenesis via MC1R activation.',
    ],
    observations: [
      { title: 'Pigmentation Research', detail: 'Studied for melanocortin-mediated pigmentation endpoints.' },
      { title: 'Melanocortin Signaling', detail: 'Research explores broader melanocortin-receptor effects.' },
    ],
    references: [pubmed('Melanotan II')],
    disclaimer: RUO_DISCLAIMER,
  },

  'mots-c': {
    overview: [
      'MOTS-c is a mitochondria-derived peptide encoded in mitochondrial DNA, investigated for roles in metabolic regulation in preclinical models.',
      'Human clinical evidence remains limited. It is not an approved medicine.',
    ],
    mechanismOfAction: [
      'Metabolic signaling: research reports effects on AMPK-related pathways and metabolic homeostasis.',
      'Exercise physiology: preclinical studies examine interactions with metabolic stress and activity.',
    ],
    observations: [
      { title: 'Metabolic Research', detail: 'Animal studies explore insulin sensitivity and metabolic endpoints.' },
      { title: 'Exercise Models', detail: 'Research examines effects relevant to exercise physiology.' },
    ],
    references: [pubmed('MOTS-c')],
    disclaimer: RUO_DISCLAIMER,
  },

  'pt-141': {
    overview: [
      'PT-141 refers to bremelanotide, a melanocortin-receptor agonist. An FDA-approved branded product exists for a specific sexual-dysfunction indication under clinician care.',
      'Dosing for approved products must follow the prescription label and prescribing provider. This profile is educational reference only.',
    ],
    mechanismOfAction: [
      'Melanocortin receptor agonism: activates central melanocortin pathways (notably MC4R) implicated in sexual response.',
      'Central mechanism: acts on nervous-system signaling rather than the vascular mechanism of PDE5 inhibitors.',
    ],
    observations: [
      { title: 'Sexual Health Research', detail: 'Clinical research supported the approved indication under prescriber care.' },
    ],
    references: [dailymed('bremelanotide'), pubmed('bremelanotide')],
    disclaimer: RX_DISCLAIMER,
  },

  selank: {
    overview: [
      'Selank is a synthetic heptapeptide developed from tuftsin, studied in anxiety and cognitive research, primarily outside the U.S.',
      'It is not FDA-approved. Educational reference only.',
    ],
    mechanismOfAction: [
      'Neuromodulation: research examines effects on GABAergic and monoamine signaling.',
      'Immune-related signaling: tuftsin-derived structure has been studied for immunomodulatory endpoints.',
    ],
    observations: [
      { title: 'Anxiolytic Research', detail: 'Animal and limited human studies examine stress and anxiety endpoints.' },
      { title: 'Cognitive Models', detail: 'Research explores attention and memory endpoints.' },
    ],
    references: [pubmed('Selank')],
    disclaimer: RUO_DISCLAIMER,
  },

  semax: {
    overview: [
      'Semax is a synthetic heptapeptide analog of ACTH(4-10) investigated in neurological and cognitive research, primarily outside the U.S.',
      'It is not FDA-approved. Educational reference only.',
    ],
    mechanismOfAction: [
      'Neurotrophic signaling: research reports effects on BDNF and related neurotrophic factors.',
      'Neuroprotection: preclinical studies examine effects in models of ischemic and cognitive stress.',
    ],
    observations: [
      { title: 'Neuroprotective Research', detail: 'Studied in preclinical models of neurological stress.' },
      { title: 'Cognitive Models', detail: 'Research examines attention and memory endpoints.' },
    ],
    references: [pubmed('Semax peptide')],
    disclaimer: RUO_DISCLAIMER,
  },

  'thymosin-alpha-1': {
    overview: [
      'Thymosin alpha-1 (thymalfasin) is a 28-amino-acid thymic peptide associated with T-cell-related immune research. It has regulatory status in some regions for specific indications.',
      'U.S. availability and indications differ. Educational reference only unless under a licensed provider.',
    ],
    mechanismOfAction: [
      'Immune modulation: research describes effects on T-cell maturation and innate/adaptive immune signaling.',
      'Cytokine signaling: studies examine influence on inflammatory and antiviral responses.',
    ],
    observations: [
      { title: 'Immune Research', detail: 'Studied as an immunomodulatory agent (thymalfasin) in various regional indications.' },
      { title: 'Antiviral Models', detail: 'Research has explored adjunctive antiviral and vaccine-response contexts.' },
    ],
    references: [pubmed('thymosin alpha 1'), pubmed('thymalfasin')],
    disclaimer: RUO_DISCLAIMER,
  },

  semaglutide: {
    overview: [
      'Semaglutide is a GLP-1 receptor agonist and an FDA-approved prescription medicine for specific indications, including type 2 diabetes and chronic weight management.',
      'Dosing must follow the prescription and product labeling. This profile does not replace medical advice.',
    ],
    mechanismOfAction: [
      'GLP-1 receptor agonism: enhances glucose-dependent insulin secretion and suppresses glucagon.',
      'Gastric emptying: slows gastric emptying, contributing to satiety.',
      'Appetite signaling: acts on central pathways associated with reduced appetite.',
    ],
    observations: [
      { title: 'Glycemic Research', detail: 'Clinical trials support improved glycemic control in the approved population.' },
      { title: 'Weight Management', detail: 'Clinical research supports weight-related outcomes under labeled use.' },
    ],
    references: [dailymed('semaglutide'), pubmed('semaglutide')],
    disclaimer: RX_DISCLAIMER,
  },

  tirzepatide: {
    overview: [
      'Tirzepatide is an FDA-approved dual GIP and GLP-1 receptor agonist for specific indications, including type 2 diabetes and chronic weight management.',
      'Dosing must follow the prescription and product labeling. This profile does not replace medical advice.',
    ],
    mechanismOfAction: [
      'Dual incretin agonism: activates both GIP and GLP-1 receptors.',
      'Glycemic control: enhances glucose-dependent insulin secretion and suppresses glucagon.',
      'Appetite & gastric emptying: contributes to satiety and delayed gastric emptying.',
    ],
    observations: [
      { title: 'Glycemic Research', detail: 'Clinical trials support glycemic outcomes in the approved population.' },
      { title: 'Weight Management', detail: 'Clinical research supports weight-related outcomes under labeled use.' },
    ],
    references: [dailymed('tirzepatide'), pubmed('tirzepatide')],
    disclaimer: RX_DISCLAIMER,
  },

  retatrutide: {
    overview: [
      'Retatrutide is an investigational triple agonist (GLP-1 / GIP / glucagon receptors) studied in obesity and metabolic clinical trials.',
      'It is investigational and not an approved medicine. Any use outside controlled trials would be inappropriate. Educational reference only.',
    ],
    mechanismOfAction: [
      'Triple incretin agonism: activates GLP-1, GIP, and glucagon receptors in clinical investigation.',
      'Metabolic effects: studied for combined effects on glycemic control and energy expenditure.',
    ],
    observations: [
      { title: 'Clinical Trial Research', detail: 'Investigational trials examine weight and metabolic endpoints.' },
    ],
    references: [pubmed('retatrutide')],
    disclaimer: RUO_DISCLAIMER,
  },

  'nad-plus': {
    overview: [
      'NAD+ (nicotinamide adenine dinucleotide) is a coenzyme central to cellular energy metabolism and redox reactions, studied in aging, metabolism, and cellular-repair research.',
      'NAD+ and its precursors are investigated in research and wellness contexts; injectable/nasal NAD+ is not an FDA-approved therapy for disease. Educational reference only.',
    ],
    mechanismOfAction: [
      'Redox metabolism: serves as an essential cofactor in mitochondrial energy production (NAD+/NADH cycling).',
      'Sirtuin & PARP activity: research describes NAD+ as a substrate for sirtuins and DNA-repair enzymes implicated in cellular aging.',
    ],
    observations: [
      { title: 'Cellular Energy Research', detail: 'Studied for roles in mitochondrial function and metabolism.' },
      { title: 'Longevity Models', detail: 'Research examines NAD+ pathways in aging biology.' },
    ],
    references: [pubmed('NAD+ metabolism aging'), pubmed('nicotinamide adenine dinucleotide')],
    disclaimer: RUO_DISCLAIMER,
  },

  glutathione: {
    overview: [
      'Glutathione is an endogenous tripeptide (glutamate-cysteine-glycine) and a major intracellular antioxidant studied in oxidative-stress, detoxification, and cellular-defense research.',
      'It is used in various research and wellness contexts; formulations and approved uses vary. Educational reference only.',
    ],
    mechanismOfAction: [
      'Antioxidant defense: neutralizes reactive oxygen species and maintains cellular redox balance.',
      'Detoxification: participates in phase II conjugation reactions supporting xenobiotic clearance.',
    ],
    observations: [
      { title: 'Oxidative Stress Research', detail: 'Studied as a central cellular antioxidant.' },
      { title: 'Detoxification Pathways', detail: 'Research examines conjugation and clearance processes.' },
    ],
    references: [pubmed('glutathione antioxidant'), pubmed('glutathione detoxification')],
    disclaimer: RUO_DISCLAIMER,
  },

  hcg: {
    overview: [
      'Human chorionic gonadotropin (hCG) is a glycoprotein hormone. Approved prescription products exist for specific endocrine and fertility indications under clinician care.',
      'Use must follow approved product labeling and a prescribing provider. This profile is educational reference only.',
    ],
    mechanismOfAction: [
      'LH-like activity: acts on the LH receptor to stimulate gonadal steroidogenesis.',
      'Reproductive axis: research and clinical use relate to testosterone/ovulation support in labeled indications.',
    ],
    observations: [
      { title: 'Endocrine Research', detail: 'Clinical use addresses specific gonadal and fertility indications under prescriber care.' },
    ],
    references: [dailymed('chorionic gonadotropin'), pubmed('human chorionic gonadotropin')],
    disclaimer: RX_DISCLAIMER,
  },

  'bpc-157-tb-500-blend': {
    overview: [
      'This research blend combines BPC-157 with TB-500 (a thymosin beta-4 fragment), two peptides studied individually in preclinical tissue-repair research.',
      'Combination data is largely anecdotal; controlled human evidence for the blend is limited. It is not an approved medicine.',
    ],
    mechanismOfAction: [
      'BPC-157: research reports angiogenic and cytoprotective effects supporting tissue repair.',
      'TB-500: influences actin regulation and cell migration relevant to wound repair in study models.',
      'Combined rationale: paired in research on the premise of complementary repair pathways.',
    ],
    observations: [
      { title: 'Tissue Repair Research', detail: 'Component peptides are studied in connective and soft-tissue repair models.' },
      { title: 'Cell Migration & Angiogenesis', detail: 'Preclinical data describe support for cell motility and new blood-vessel formation.' },
    ],
    references: [pubmed('BPC-157'), pubmed('thymosin beta 4')],
    disclaimer: RUO_DISCLAIMER,
  },

  aicar: {
    overview: [
      'AICAR (5-aminoimidazole-4-carboxamide ribonucleotide) is a small molecule studied in metabolic and exercise-physiology research as an activator of AMP-activated protein kinase (AMPK).',
      'Most evidence is preclinical. It is not an approved medicine and is prohibited in competitive sport.',
    ],
    mechanismOfAction: [
      'AMPK activation: mimics a rise in cellular AMP, activating a key energy-sensing pathway in research models.',
      'Metabolic signaling: studied for downstream effects on glucose uptake and fatty-acid oxidation.',
    ],
    observations: [
      { title: 'Metabolic Research', detail: 'Animal studies examine effects on endurance and substrate metabolism.' },
      { title: 'Cellular Energy', detail: 'Research explores AMPK-mediated adaptations to energy stress.' },
    ],
    references: [pubmed('AICAR AMPK')],
    disclaimer: RUO_DISCLAIMER,
  },

  alprostadil: {
    overview: [
      'Alprostadil is a synthetic form of prostaglandin E1. FDA-approved products exist for specific indications (including erectile dysfunction and certain neonatal cardiac conditions) under clinician care.',
      'Use must follow approved product labeling and a prescribing provider. This profile is educational reference only.',
    ],
    mechanismOfAction: [
      'Vasodilation: prostaglandin E1 activity relaxes vascular smooth muscle and increases local blood flow.',
      'Smooth-muscle signaling: acts via prostaglandin receptor pathways.',
    ],
    observations: [
      { title: 'Vascular Research', detail: 'Clinical use relates to localized vasodilation in labeled indications.' },
    ],
    references: [dailymed('alprostadil'), pubmed('alprostadil')],
    disclaimer: RX_DISCLAIMER,
  },

  cagrilintide: {
    overview: [
      'Cagrilintide is an investigational long-acting amylin analog studied in obesity and metabolic clinical trials, often in combination with GLP-1 receptor agonists.',
      'It is investigational and not an approved medicine. Educational reference only.',
    ],
    mechanismOfAction: [
      'Amylin receptor agonism: activates amylin/calcitonin receptor pathways implicated in satiety.',
      'Appetite & gastric emptying: studied for effects that complement incretin-based mechanisms.',
    ],
    observations: [
      { title: 'Clinical Trial Research', detail: 'Investigational trials examine weight and metabolic endpoints, including combination regimens.' },
    ],
    references: [pubmed('cagrilintide')],
    disclaimer: RUO_DISCLAIMER,
  },

  cerebrolysin: {
    overview: [
      'Cerebrolysin is a peptide preparation derived from porcine brain tissue, studied in neurological research and used clinically in some countries for specific indications.',
      'U.S. approval status differs; treat this profile as educational reference only unless under a licensed provider.',
    ],
    mechanismOfAction: [
      'Neurotrophic-like activity: research describes effects resembling endogenous neurotrophic factors.',
      'Neuroprotection: preclinical studies examine neuronal survival and plasticity endpoints.',
    ],
    observations: [
      { title: 'Neurological Research', detail: 'Studied in cognitive and neurorecovery contexts in regional clinical use.' },
    ],
    references: [pubmed('cerebrolysin')],
    disclaimer: RUO_DISCLAIMER,
  },

  hgh: {
    overview: [
      'hGH (recombinant human growth hormone, somatropin) is an FDA-approved prescription hormone for specific endocrine indications under clinician care.',
      'Dosing must follow the prescription and product labeling. This profile does not replace medical advice.',
    ],
    mechanismOfAction: [
      'GH receptor agonism: binds growth-hormone receptors, driving IGF-1 production.',
      'Metabolic & growth signaling: influences protein, lipid, and glucose metabolism.',
    ],
    observations: [
      { title: 'Endocrine Research', detail: 'Clinical use addresses growth-hormone deficiency and other labeled indications.' },
    ],
    references: [dailymed('somatropin'), pubmed('recombinant human growth hormone')],
    disclaimer: RX_DISCLAIMER,
  },

  'igf-1lr3': {
    overview: [
      'IGF-1 LR3 (Long R3 insulin-like growth factor-1) is a modified analog of IGF-1 with an extended half-life, used in laboratory research on growth and metabolic signaling.',
      'It is not an approved human medicine. Educational reference only.',
    ],
    mechanismOfAction: [
      'IGF-1 receptor agonism: activates IGF-1 signaling with reduced binding-protein affinity, prolonging activity in study models.',
      'Anabolic signaling: research examines effects on cell growth and protein synthesis.',
    ],
    observations: [
      { title: 'Growth Research', detail: 'Preclinical studies examine IGF-1-mediated growth and metabolic endpoints.' },
    ],
    references: [pubmed('IGF-1 LR3')],
    disclaimer: RUO_DISCLAIMER,
  },

  kpv: {
    overview: [
      'KPV is a tripeptide (lysine-proline-valine) corresponding to the C-terminal fragment of alpha-melanocyte-stimulating hormone (alpha-MSH), studied for anti-inflammatory properties.',
      'Evidence is largely preclinical. It is not an approved medicine. Educational reference only.',
    ],
    mechanismOfAction: [
      'Anti-inflammatory signaling: research describes modulation of pro-inflammatory pathways (e.g., NF-kB) in cell models.',
      'Melanocortin-related activity: derived from alpha-MSH, studied in mucosal and gut inflammation research.',
    ],
    observations: [
      { title: 'Inflammation Research', detail: 'Preclinical studies examine anti-inflammatory effects, including in gut models.' },
    ],
    references: [pubmed('KPV peptide anti-inflammatory')],
    disclaimer: RUO_DISCLAIMER,
  },

  mazdutide: {
    overview: [
      'Mazdutide is an investigational dual GLP-1 and glucagon receptor agonist studied in obesity and metabolic clinical trials.',
      'It is investigational and not an approved medicine. Educational reference only.',
    ],
    mechanismOfAction: [
      'Dual receptor agonism: activates GLP-1 and glucagon receptors in clinical investigation.',
      'Metabolic effects: studied for combined effects on glycemic control and energy expenditure.',
    ],
    observations: [
      { title: 'Clinical Trial Research', detail: 'Investigational trials examine weight and metabolic endpoints.' },
    ],
    references: [pubmed('mazdutide')],
    disclaimer: RUO_DISCLAIMER,
  },

  oxytocin: {
    overview: [
      'Oxytocin is an endogenous nonapeptide hormone. FDA-approved injectable products exist for specific obstetric indications under clinician care.',
      'Use must follow approved product labeling and a prescribing provider. This profile is educational reference only.',
    ],
    mechanismOfAction: [
      'Oxytocin receptor agonism: activates receptors in smooth muscle and the central nervous system.',
      'Neuroendocrine signaling: research examines roles in social and stress-related pathways.',
    ],
    observations: [
      { title: 'Neuroendocrine Research', detail: 'Studied for central roles in social behavior and bonding in research settings.' },
    ],
    references: [dailymed('oxytocin'), pubmed('oxytocin')],
    disclaimer: RX_DISCLAIMER,
  },

  'slu-pp-332': {
    overview: [
      'SLU-PP-332 is a synthetic estrogen-related receptor (ERR) agonist studied preclinically as an "exercise mimetic" affecting metabolic pathways.',
      'Evidence is early preclinical. It is not an approved medicine. Educational reference only.',
    ],
    mechanismOfAction: [
      'ERR agonism: activates estrogen-related receptors implicated in mitochondrial and metabolic gene programs.',
      'Metabolic adaptation: research examines effects resembling aspects of exercise in animal models.',
    ],
    observations: [
      { title: 'Metabolic Research', detail: 'Preclinical studies examine endurance and energy-metabolism endpoints.' },
    ],
    references: [pubmed('SLU-PP-332')],
    disclaimer: RUO_DISCLAIMER,
  },

  'snap-8': {
    overview: [
      'SNAP-8 (acetyl octapeptide-3) is a synthetic peptide used primarily in topical cosmetic research related to expression-line appearance.',
      'It is a cosmetic-ingredient peptide, not an approved medicine. Educational reference only.',
    ],
    mechanismOfAction: [
      'Neurotransmission modulation: research proposes interference with SNARE-complex signaling at the neuromuscular junction in topical models.',
    ],
    observations: [
      { title: 'Cosmetic Research', detail: 'Studied topically for effects on the appearance of expression lines.' },
    ],
    references: [pubmed('acetyl octapeptide-3')],
    disclaimer: RUO_DISCLAIMER,
  },

  'ss-31': {
    overview: [
      'SS-31 (elamipretide) is a mitochondria-targeting tetrapeptide investigated in research on mitochondrial function and related conditions.',
      'It is investigational in the U.S. and not broadly approved. Educational reference only.',
    ],
    mechanismOfAction: [
      'Cardiolipin binding: associates with the inner mitochondrial membrane lipid cardiolipin in research models.',
      'Mitochondrial support: studied for effects on bioenergetics and reactive oxygen species.',
    ],
    observations: [
      { title: 'Mitochondrial Research', detail: 'Investigated in models of mitochondrial dysfunction and related endpoints.' },
    ],
    references: [pubmed('elamipretide'), pubmed('SS-31 peptide')],
    disclaimer: RUO_DISCLAIMER,
  },

  thymalin: {
    overview: [
      'Thymalin is a thymic peptide preparation studied for immunomodulatory effects, used clinically in some regions for specific indications.',
      'U.S. approval status differs; treat this profile as educational reference only unless under a licensed provider.',
    ],
    mechanismOfAction: [
      'Immune modulation: research describes effects on T-cell-related immune regulation.',
      'Thymic signaling: associated with thymus-derived peptide activity in study models.',
    ],
    observations: [
      { title: 'Immune Research', detail: 'Studied as an immunomodulatory thymic preparation in regional clinical use.' },
    ],
    references: [pubmed('thymalin')],
    disclaimer: RUO_DISCLAIMER,
  },

  glow: {
    overview: [
      '"Glow" refers to a research blend that commonly combines GHK-Cu with the repair-oriented peptides BPC-157 and TB-500, studied individually in skin and tissue-repair contexts.',
      'Combination data is largely anecdotal; controlled human evidence for the blend is limited. It is not an approved medicine.',
    ],
    mechanismOfAction: [
      'GHK-Cu: research reports support for collagen and extracellular-matrix remodeling in skin models.',
      'BPC-157: studied for angiogenic and cytoprotective effects supporting tissue repair.',
      'TB-500: influences actin regulation and cell migration relevant to repair in study models.',
    ],
    observations: [
      { title: 'Skin & Recovery Research', detail: 'Component peptides are studied in dermal and soft-tissue repair models.' },
    ],
    references: [pubmed('GHK-Cu'), pubmed('BPC-157'), pubmed('thymosin beta 4')],
    disclaimer: RUO_DISCLAIMER,
  },

  klow: {
    overview: [
      '"KLOW" refers to a research blend that commonly combines GHK-Cu, BPC-157, TB-500, and the tripeptide KPV, all studied individually in repair and anti-inflammatory contexts.',
      'Combination data is largely anecdotal; controlled human evidence for the blend is limited. It is not an approved medicine.',
    ],
    mechanismOfAction: [
      'GHK-Cu: studied for support of collagen and tissue remodeling.',
      'BPC-157 / TB-500: studied for angiogenesis, cytoprotection, and cell migration in repair models.',
      'KPV: alpha-MSH-derived tripeptide studied for anti-inflammatory signaling.',
    ],
    observations: [
      { title: 'Repair & Inflammation Research', detail: 'Component peptides are studied in tissue-repair and inflammation models.' },
    ],
    references: [pubmed('GHK-Cu'), pubmed('BPC-157'), pubmed('KPV peptide')],
    disclaimer: RUO_DISCLAIMER,
  },

  'cjc-1295-ipamorelin-blend': {
    overview: [
      'This research blend pairs the GHRH analog CJC-1295 with the selective ghrelin-receptor agonist Ipamorelin, two peptides frequently studied together on the premise of complementary growth-hormone-release pathways.',
      'Neither component is an approved medicine for performance or anti-aging use. Educational reference only.',
    ],
    mechanismOfAction: [
      'CJC-1295 (GHRH analog): binds pituitary GHRH receptors to promote growth-hormone secretion.',
      'Ipamorelin (GHRP): activates the ghrelin receptor to promote GH release with a relatively selective profile.',
      'Combined rationale: paired in research to study additive stimulation of endogenous GH.',
    ],
    observations: [
      { title: 'Growth Hormone Research', detail: 'The pairing is studied for additive effects on pulsatile GH release in research literature.' },
    ],
    references: [pubmed('CJC-1295'), pubmed('ipamorelin')],
    disclaimer: RUO_DISCLAIMER,
  },
}

/** Normalize a product/peptide name into a lookup key. */
export function normalizeKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bnad\s*\+/g, 'nad-plus') // NAD+ -> nad-plus before stripping symbols
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Alias map: normalized variant -> canonical key in PEPTIDE_MONOGRAPHS. Lets
 * catalog names like "hGH Frag 176-191" or "Pregnyl" resolve to a monograph.
 */
const ALIASES: Record<string, string> = {
  bpc157: 'bpc-157',
  'body-protection-compound-157': 'bpc-157',
  tb500: 'tb-500',
  'thymosin-beta-4': 'tb-500',
  'thymosin-beta-4-fragment': 'tb-500',
  'copper-tripeptide-1': 'ghk-cu',
  ghkcu: 'ghk-cu',
  'cathelicidin-ll-37': 'll-37',
  ll37: 'll-37',
  aod9604: 'aod-9604',
  cjc1295: 'cjc-1295',
  'cjc-1295-without-dac': 'cjc-1295',
  'cjc-1295-dac': 'cjc-1295',
  'mod-grf-1-29': 'cjc-1295',
  ghrp2: 'ghrp-2',
  pralmorelin: 'ghrp-2',
  ghrp6: 'ghrp-6',
  examorelin: 'hexarelin',
  egrifta: 'tesamorelin',
  'hgh-fragment-176-191': 'fragment-176-191',
  'hgh-frag-176-191': 'fragment-176-191',
  'fragment-176-191-hgh': 'fragment-176-191',
  'kisspeptin-10': 'kisspeptin',
  metastin: 'kisspeptin',
  'melanotan-2': 'melanotan-ii',
  melanotan2: 'melanotan-ii',
  'mt-ii': 'melanotan-ii',
  mt2: 'melanotan-ii',
  motsc: 'mots-c',
  pt141: 'pt-141',
  bremelanotide: 'pt-141',
  'thymosin-alpha1': 'thymosin-alpha-1',
  thymalfasin: 'thymosin-alpha-1',
  'ta1': 'thymosin-alpha-1',
  'ly3437943': 'retatrutide',
  nad: 'nad-plus',
  'nad-nasal-spray': 'nad-plus',
  'nad-plus-nasal-spray': 'nad-plus',
  'nicotinamide-adenine-dinucleotide': 'nad-plus',
  'l-glutathione': 'glutathione',
  'human-chorionic-gonadotropin': 'hcg',
  'chorionic-gonadotropin': 'hcg',
  pregnyl: 'hcg',
  'bpc-157-tb-500': 'bpc-157-tb-500-blend',
  'bpc-tb-blend': 'bpc-157-tb-500-blend',
  // Salt/acetate forms and spelling variants seen in the live catalog.
  'cjc-1295-with-dac': 'cjc-1295',
  'cjc-1295-dac-form': 'cjc-1295',
  'cjc-1295-no-dac-ipamorelin': 'cjc-1295-ipamorelin-blend',
  'cjc-1295-ipamorelin': 'cjc-1295-ipamorelin-blend',
  epithalon: 'epitalon',
  foxo4: 'foxo4-dri',
  'ghrp-2-acetate': 'ghrp-2',
  'ghrp-6-acetate': 'ghrp-6',
  'hexarelin-acetate': 'hexarelin',
  igf1lr3: 'igf-1lr3',
  'igf-1-lr3': 'igf-1lr3',
  'lysine-proline-valine': 'kpv',
  'mt-2': 'melanotan-ii',
  'mt-2-melanotan-ii-acetate': 'melanotan-ii',
  'melanotan-ii-acetate': 'melanotan-ii',
  'oxytocin-acetate': 'oxytocin',
  'sermorelin-acetate': 'sermorelin',
  somatropin: 'hgh',
  'human-growth-hormone': 'hgh',
}

/**
 * Resolve a monograph for a product name. Tries the normalized key, then the
 * alias map, then a loose contains-match against known keys. Returns null when
 * no confident match exists.
 */
export function getMonographForName(name: string): PeptideMonograph | null {
  if (!name) return null
  const key = normalizeKey(name)
  if (PEPTIDE_MONOGRAPHS[key]) return PEPTIDE_MONOGRAPHS[key]

  const aliasKey = ALIASES[key] || ALIASES[key.replace(/-/g, '')]
  if (aliasKey && PEPTIDE_MONOGRAPHS[aliasKey]) return PEPTIDE_MONOGRAPHS[aliasKey]

  // Blend names like "BPC-157 / TB-500 Blend" — match if both parts are present.
  if (key.includes('bpc-157') && key.includes('tb-500')) {
    return PEPTIDE_MONOGRAPHS['bpc-157-tb-500-blend']
  }

  return null
}
