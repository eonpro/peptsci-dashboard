/**
 * Marketing Services Agreement (MSA) — the document partners e-sign before
 * using the portal. The text is versioned and hashed; the executed record
 * (PartnerAgreement) freezes the full text, hash, signer identity, signature
 * image, IP, and user agent, so the system of record survives later edits.
 */

import { createHash } from 'crypto'

export const MSA_VERSION = 'v1.0-2026-07'
export const MSA_TITLE = 'PeptSci Partner Marketing Services Agreement'

export const MSA_TEXT = `PEPTSCI PARTNER MARKETING SERVICES AGREEMENT (${MSA_VERSION})

This Marketing Services Agreement (the "Agreement") is entered into between PeptSci ("Company") and the undersigned partner organization or sales representative ("Partner") as of the date of electronic signature below.

1. ENGAGEMENT. Company engages Partner, on a non-exclusive basis, to refer licensed medical practices and clinics ("Clinics") to Company's products and services. Partner is an independent contractor; nothing in this Agreement creates an employment, agency, joint-venture, or franchise relationship.

2. REFERRALS AND ATTRIBUTION. Clinics are attributed to Partner when they sign up through Partner's referral links within the attribution window, or when Company records the attribution manually. Company's records of attribution, revenue, and commission are authoritative absent manifest error.

3. COMPENSATION. Company will pay Partner commission on attributed Clinic purchases as configured in Partner's portal — either (a) a percentage of attributed net revenue, or (b) for margin-model partners, the spread between the Clinic's price and Partner's wholesale floor. Commissions accrue when payment is captured, are reduced proportionally by refunds and chargebacks, and are paid on Company's regular payout schedule after approval. Sales-representative carve-outs are paid out of, and never in addition to, the organization's commission.

4. COMPLIANT MARKETING. Partner will market Company products truthfully and lawfully. Partner will not (a) make medical claims not authorized in Company's published materials; (b) market to consumers or patients where products are restricted to licensed practices; (c) send unsolicited communications in violation of law (including TCPA and CAN-SPAM); or (d) purchase search advertising against Company trademarks without written consent.

5. NO HEALTHCARE REFERRALS. Partner's compensation is for marketing services to independent commercial buyers. Partner will not offer or accept remuneration intended to induce referrals of items or services reimbursable under any federal or state healthcare program, and will immediately notify Company if any attributed Clinic's purchases may implicate such programs.

6. CONFIDENTIALITY. Pricing, commission rates, Clinic lists, and portal data are Company confidential information. Partner will use them solely to perform under this Agreement and will protect them with reasonable care.

7. TRADEMARKS. Company grants Partner a limited, revocable license to use Company's name and approved marks solely for marketing under this Agreement. All goodwill inures to Company.

8. TERM AND TERMINATION. Either party may terminate at any time with written notice. On termination, Company pays approved, unpaid commissions accrued through the termination date; attribution of Clinics for future periods ends unless otherwise agreed in writing.

9. COMPLIANCE WITH LAW; TAXES. Partner is responsible for its own taxes and for compliance with all laws applicable to its activities. Company may withhold amounts required by law and will issue tax documentation (e.g., IRS Form 1099) where required.

10. LIMITATION OF LIABILITY. NEITHER PARTY IS LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES. COMPANY'S AGGREGATE LIABILITY UNDER THIS AGREEMENT IS LIMITED TO COMMISSIONS PAID OR PAYABLE TO PARTNER IN THE SIX (6) MONTHS PRECEDING THE CLAIM.

11. GENERAL. This Agreement is the entire agreement on its subject, supersedes prior discussions, and may be amended only in a writing (including an updated electronically-signed version). It is governed by the laws of the state of Company's principal place of business, without regard to conflicts rules. Electronic signature has the same effect as ink.

By signing below, the signer represents they are authorized to bind the Partner identified in the portal account.`

/** SHA-256 of the canonical document text (hex). */
export function msaHash(text: string = MSA_TEXT): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export interface MsaDocument {
  version: string
  title: string
  text: string
  hash: string
}

export function msaDocument(): MsaDocument {
  return { version: MSA_VERSION, title: MSA_TITLE, text: MSA_TEXT, hash: msaHash() }
}
