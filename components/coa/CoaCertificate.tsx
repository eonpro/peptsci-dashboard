/**
 * Storefront-quality Certificate of Analysis renderer.
 *
 * Presentational only (no hooks / no server imports) so it renders identically
 * on the server (shop page) and in the admin live preview (client dialog). All
 * chart coordinates are derived from the structured COA data via
 * lib/coa-geometry — nothing here reads the DB.
 *
 * Visual language mirrors the reference supplier-certificate layout: an 8.5×11
 * "page" on a dark backdrop, dark navy header, and three SVG result panels.
 */

import type { CoaData } from '@/lib/coa'
import {
  computeAssayGeometry,
  computePurityGeometry,
  computeCustodyGeometry,
} from '@/lib/coa-geometry'

const COA_CSS = `
.coa-doc{--bg:#eceef5;--panel:#060822;--panel2:#111431;--ink:#060822;--mute:#6a6f88;--grid:#dcdfea;--track:#e0e3ee;--signal:#233dee;--signal-ink:#1b2fc4;--on-dark-accent:#7d90ff;--limit:#e0913a;--reject:#f2dcdc;--on-dark:#e9eaf3;--dim:#7c81a0;
  --sans:'Inter',system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;
  color:var(--ink);width:100%;display:flex;justify-content:center;}
.coa-doc *{box-sizing:border-box;margin:0;padding:0;}
.coa-doc .page{width:8.5in;max-width:100%;background:var(--bg);display:flex;flex-direction:column;overflow:hidden;font-family:var(--sans);-webkit-font-smoothing:antialiased;border-radius:6px;box-shadow:0 24px 60px rgba(0,0,0,.35);}
.coa-doc .head{background:var(--panel);color:var(--on-dark);padding:0.36in 0.55in 0.3in;}
.coa-doc .hrow{display:flex;justify-content:space-between;align-items:flex-start;}
.coa-doc .brand{display:flex;align-items:center;gap:16px;}
.coa-doc .brand img{height:40px;width:auto;display:block;}
.coa-doc .brand .wordmark{font-family:var(--sans);font-weight:700;font-size:22px;letter-spacing:.14em;color:#fff;}
.coa-doc .brand .kb{font-family:var(--mono);font-size:7.5px;letter-spacing:.16em;color:var(--dim);line-height:1.7;border-left:1px solid rgba(255,255,255,.14);padding-left:16px;}
.coa-doc .docid{text-align:right;font-family:var(--mono);}
.coa-doc .docid .a{font-size:8px;letter-spacing:.22em;color:var(--limit);}
.coa-doc .docid .b{font-size:11px;color:var(--on-dark);margin-top:4px;}
.coa-doc .docid .c{font-size:8px;color:var(--dim);margin-top:3px;}
.coa-doc .title{margin-top:20px;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;}
.coa-doc .title h1{font-family:var(--sans);font-weight:700;font-size:42px;line-height:.92;letter-spacing:-.02em;}
.coa-doc .title h1 span{color:var(--on-dark-accent);}
.coa-doc .title .desc{font-family:var(--mono);font-size:9px;letter-spacing:.05em;color:var(--dim);text-align:right;line-height:1.7;padding-bottom:4px;}
.coa-doc .stats{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.08);margin-top:18px;border-radius:4px;overflow:hidden;}
.coa-doc .stat{background:var(--panel2);padding:11px 14px;}
.coa-doc .stat .v{font-family:var(--sans);font-weight:600;font-size:21px;color:var(--on-dark);line-height:1;}
.coa-doc .stat .v em{font-style:normal;color:var(--on-dark-accent);}
.coa-doc .stat .l{font-family:var(--mono);font-size:7.5px;letter-spacing:.16em;color:var(--dim);margin-top:6px;text-transform:uppercase;}
.coa-doc .body{padding:0.2in 0.55in 0;flex:1;display:flex;flex-direction:column;}
.coa-doc .meta{display:flex;flex-wrap:wrap;border:1px solid var(--grid);border-radius:4px;overflow:hidden;margin-bottom:0.16in;}
.coa-doc .meta div{flex:1;min-width:33%;padding:8px 11px;border-right:1px solid var(--grid);border-bottom:1px solid var(--grid);}
.coa-doc .meta .k{font-family:var(--mono);font-size:7px;letter-spacing:.13em;color:var(--mute);text-transform:uppercase;}
.coa-doc .meta .v{font-family:var(--mono);font-size:10px;color:var(--ink);margin-top:3px;font-weight:500;}
.coa-doc .block{margin-bottom:0.14in;}
.coa-doc .bhead{display:flex;align-items:center;gap:10px;margin-bottom:8px;}
.coa-doc .bhead .idx{font-family:var(--mono);font-size:9.5px;color:var(--signal-ink);font-weight:700;}
.coa-doc .bhead .nm{font-family:var(--sans);font-weight:600;font-size:14px;}
.coa-doc .bhead .line{flex:1;height:1px;background:var(--grid);}
.coa-doc .bhead .val{font-family:var(--mono);font-size:11px;font-weight:500;}
.coa-doc .bhead .pass{font-family:var(--mono);font-size:8.5px;font-weight:700;letter-spacing:.14em;color:#fff;background:var(--signal-ink);padding:3px 8px;border-radius:3px;}
.coa-doc .bhead .info{background:var(--mute);}
.coa-doc .gfx{width:100%;height:auto;display:block;}
.coa-doc .gfx .ax{font-family:var(--mono);font-size:8.5px;fill:var(--mute);}
.coa-doc .gfx .axr{font-family:var(--mono);font-size:8.5px;fill:var(--signal-ink);font-weight:700;}
.coa-doc .gfx .axl{font-family:var(--mono);font-size:8.5px;fill:var(--limit);font-weight:700;}
.coa-doc .gfx .axcap{font-family:var(--mono);font-size:7.5px;fill:var(--mute);letter-spacing:.1em;}
.coa-doc .gfx .brk{font-family:var(--mono);font-size:7.5px;fill:var(--mute);letter-spacing:.1em;}
.coa-doc .gfx .stripmain{font-family:var(--mono);font-size:11px;fill:#fff;font-weight:700;letter-spacing:.06em;}
.coa-doc .gfx .inband{font-family:var(--mono);font-size:8px;fill:var(--mute);font-weight:700;letter-spacing:.12em;}
.coa-doc .gfx .inrej{font-family:var(--mono);font-size:8px;fill:#b4756a;font-weight:700;letter-spacing:.12em;}
.coa-doc .gfx .lane{font-family:var(--mono);font-size:8px;fill:var(--ink);font-weight:500;letter-spacing:.04em;}
.coa-doc .gfx .barlab{font-family:var(--mono);font-size:7.5px;fill:#eafff5;font-weight:500;letter-spacing:.05em;}
.coa-doc .subnote{font-family:var(--mono);font-size:8.5px;color:var(--mute);margin-top:3px;line-height:1.5;}
.coa-doc .subnote b{color:var(--signal-ink);font-weight:700;}
.coa-doc .idrow{display:flex;flex-wrap:wrap;gap:8px;}
.coa-doc .idrow .cell{flex:1;min-width:120px;border:1px solid var(--grid);border-radius:4px;padding:9px 11px;background:#fff;}
.coa-doc .idrow .cell .k{font-family:var(--mono);font-size:7px;letter-spacing:.13em;color:var(--mute);text-transform:uppercase;}
.coa-doc .idrow .cell .v{font-family:var(--sans);font-weight:600;font-size:13px;margin-top:4px;}
.coa-doc .idrow .cell .v em{font-style:normal;color:var(--signal-ink);}
.coa-doc .warn{border:1px solid var(--limit);border-left:3px solid var(--limit);background:#fdf6ec;border-radius:4px;padding:10px 13px;margin-top:0.1in;}
.coa-doc .warn .t{font-family:var(--mono);font-size:8px;font-weight:700;letter-spacing:.16em;color:var(--limit);text-transform:uppercase;}
.coa-doc .warn .x{font-family:var(--mono);font-size:8.2px;line-height:1.6;color:#6b5836;margin-top:5px;}
.coa-doc .srcbtn{display:inline-flex;align-items:center;gap:6px;margin-top:10px;font-family:var(--mono);font-size:9px;letter-spacing:.08em;color:#fff;background:var(--signal-ink);padding:7px 12px;border-radius:4px;text-decoration:none;text-transform:uppercase;}
.coa-doc .foot{margin-top:auto;border-top:1px solid var(--grid);padding:0.16in 0.55in 0.26in;}
.coa-doc .foot .fine{font-family:var(--mono);font-size:7.4px;line-height:1.6;color:#8b938a;}
.coa-doc .foot .fine b{color:var(--ink);}
`

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const day = String(d.getUTCDate()).padStart(2, '0')
  const mon = d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase()
  const yr = String(d.getUTCFullYear()).slice(-2)
  return `${day}${mon}${yr}`
}

function num(n: number | null | undefined, dp = 3): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return n.toLocaleString('en-US', { maximumFractionDigits: dp, minimumFractionDigits: 0 })
}

/** Split "GHK-Cu" + "50 mg" into a headline + accent line. */
function splitTitle(name: string, dose: string | null): { top: string; accent: string } {
  return { top: name, accent: dose ? dose : '' }
}

export function CoaCertificate({ data, logoSrc }: { data: CoaData; logoSrc?: string }) {
  const hasPurity = data.purityPercent != null
  const hasAssay = data.assayMeasuredMg != null && data.assayLabelClaimMg != null
  const hasIdentity = !!(data.identityResult || data.identitySpec)

  const purity = hasPurity
    ? computePurityGeometry(data.purityPercent as number, data.puritySpecMin ?? 98)
    : null
  const assay = hasAssay
    ? computeAssayGeometry(data.assayMeasuredMg as number, data.assayLabelClaimMg as number)
    : null
  const custody = computeCustodyGeometry(
    data.receivedOn ? new Date(data.receivedOn) : null,
    data.analyzedOn ? new Date(data.analyzedOn) : null,
    data.orderedOn ? new Date(data.orderedOn) : null
  )

  // Purity uses the caller-provided reject max (impurity allowance) when set,
  // otherwise falls back to the (100 - specMin) derived by the geometry helper.
  const rejectAllowance =
    data.purityRejectMax ?? (purity ? purity.impurityAllowance : null)

  const purityPass = purity ? purity.purityPercent >= purity.specMin : false
  const identityConfirmed = hasIdentity
    ? !data.identitySpec ||
      !data.identityResult ||
      data.identityResult.trim().toLowerCase() === data.identitySpec.trim().toLowerCase()
    : false

  const metrics = [hasPurity, hasAssay, hasIdentity]
  const totalSpecs = metrics.filter(Boolean).length
  const metSpecs =
    (hasPurity && purityPass ? 1 : 0) +
    (hasAssay ? 1 : 0) +
    (hasIdentity && identityConfirmed ? 1 : 0)

  const title = splitTitle(data.compoundName, data.doseLabel)

  const descLines = [
    data.casNumber ? `CAS ${data.casNumber}` : null,
    data.appearance ? data.appearance.toUpperCase() : null,
    data.batchNumber ? `BATCH ${data.batchNumber}` : null,
  ].filter(Boolean) as string[]

  const metaCells = [
    ['Manufacturer', data.manufacturer],
    ['Testing lab', data.testingLab || data.issuingLab],
    ['Client of record', data.clientOfRecord],
    ['Distributor', data.distributor],
    ['Received', data.receivedOn ? fmtDate(data.receivedOn) : null],
    ['Analyzed', data.analyzedOn ? fmtDate(data.analyzedOn) : null],
  ].filter(([, v]) => !!v) as [string, string][]

  let blockIdx = 0
  const idx = () => String(++blockIdx).padStart(2, '0')

  return (
    <div className="coa-doc">
      <style dangerouslySetInnerHTML={{ __html: COA_CSS }} />
      <div className="page">
        {/* Header */}
        <div className="head">
          <div className="hrow">
            <div className="brand">
              {logoSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoSrc} alt="Peptsci Research" />
              ) : (
                <div className="wordmark">PEPTSCI</div>
              )}
              <div className="kb">
                INCOMING MATERIAL REVIEW
                <br />
                401 JACKSON ST STE 2340-K23, TAMPA FL 33602
                <br />
                PEPTSCI.COM
              </div>
            </div>
            <div className="docid">
              <div className="a">▲ SUPPLIER CERTIFICATE — NOT PEPTSCI TESTING</div>
              <div className="b">
                {data.taskNumber ? `TASK #${data.taskNumber}` : 'SUPPLIER COA'}
                {data.reportCode ? ` / ${data.reportCode}` : ''}
              </div>
              <div className="c">{data.issuingLab ? `ISSUED BY ${data.issuingLab.toUpperCase()}` : ''}</div>
            </div>
          </div>

          <div className="title">
            <h1>
              {title.top}
              {title.accent ? (
                <>
                  <br />
                  <span>{title.accent}</span>
                </>
              ) : null}
            </h1>
            {descLines.length > 0 && (
              <div className="desc">
                {descLines.map((l, i) => (
                  <span key={i}>
                    {l}
                    {i < descLines.length - 1 ? <br /> : null}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="stats">
            <div className="stat">
              <div className="v">
                <em>{hasPurity ? num(data.purityPercent, 3) : '—'}</em>
                {hasPurity ? '%' : ''}
              </div>
              <div className="l">
                Purity{purity ? ` · spec >${num(purity.specMin, 2)}%` : ''}
              </div>
            </div>
            <div className="stat">
              <div className="v">
                <em>{assay ? num(assay.percentOfClaim, 1) : '—'}</em>
                {assay ? '%' : ''}
              </div>
              <div className="l">
                {assay
                  ? `Of label claim · ${num(assay.measuredMg, 2)}mg`
                  : 'Assay content'}
              </div>
            </div>
            <div className="stat">
              <div className="v">
                <em>
                  {metSpecs}/{totalSpecs || 0}
                </em>
              </div>
              <div className="l">Specifications met</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="body">
          {metaCells.length > 0 && (
            <div className="meta">
              {metaCells.map(([k, v]) => (
                <div key={k}>
                  <div className="k">{k}</div>
                  <div className="v">{v}</div>
                </div>
              ))}
            </div>
          )}

          {/* 01 — Purity */}
          {purity && (
            <div className="block">
              <div className="bhead">
                <span className="idx">{idx()}</span>
                <span className="nm">Purity</span>
                <span className="line" />
                <span className="val">{num(purity.purityPercent, 3)}%</span>
                <span className={`pass${purityPass ? '' : ' info'}`}>
                  {purityPass ? 'PASS' : 'REVIEW'}
                </span>
              </div>
              <svg viewBox="0 0 648 172" xmlns="http://www.w3.org/2000/svg" className="gfx">
                <text x="16" y="8" className="axcap" textAnchor="start">
                  COMPOSITION — LINEAR 0–100%
                </text>
                <text x="624" y="8" className="axcap" textAnchor="end">
                  {num(purity.impurities, 3)}% IMPURITIES ▾ MAGNIFIED BELOW
                </text>

                <rect x="16" y="14" width="608" height="28" rx="3" fill="var(--track)" />
                <rect
                  x="16"
                  y="14"
                  width={purity.strip.fillWidth}
                  height="28"
                  rx="3"
                  fill="var(--signal)"
                />
                <rect
                  x={purity.strip.sliverX}
                  y="14"
                  width={Math.max(1.5, purity.strip.sliverWidth)}
                  height="28"
                  fill="var(--limit)"
                />
                <text x="28" y="32" className="stripmain">
                  {num(purity.purityPercent, 3)}% {data.compoundName}
                </text>

                <path
                  d={`M ${purity.strip.sliverX},42 L ${purity.strip.sliverX},56 L ${purity.measuredX},88 L ${purity.measuredX},101`}
                  fill="none"
                  stroke="var(--mute)"
                  strokeWidth="0.8"
                  strokeDasharray="2,2"
                />

                <text x="16" y="94" className="axcap" textAnchor="start">
                  IMPURITY DETAIL — LOG SCALE % w/w
                </text>

                <rect x="16" y="106" width="608" height="28" rx="3" fill="var(--track)" />
                {purity.gridlines.map((gx, i) => (
                  <line
                    key={i}
                    x1={gx}
                    y1="106"
                    x2={gx}
                    y2="134"
                    stroke="var(--grid)"
                    strokeWidth="0.6"
                  />
                ))}
                {rejectAllowance != null && (
                  <rect
                    x={purity.rejectX}
                    y="106"
                    width={purity.rejectBarWidth}
                    height="28"
                    fill="var(--reject)"
                  />
                )}
                <rect
                  x="16"
                  y="106"
                  width={purity.measuredBarWidth}
                  height="28"
                  rx="3"
                  fill="var(--signal)"
                />
                {purity.ticks.map((t, i) => (
                  <g key={i}>
                    <line x1={t.x} y1="101" x2={t.x} y2="139" stroke="var(--grid)" strokeWidth="1" />
                    <text x={t.x} y="152" className="ax" textAnchor="middle">
                      {t.label}
                    </text>
                  </g>
                ))}

                {Number.isFinite(purity.marginFactor) && (
                  <text
                    x={(purity.rejectX + purity.measuredX) / 2}
                    y="123"
                    className="inband"
                    textAnchor="middle"
                  >
                    {num(purity.marginFactor, 2)}× MARGIN
                  </text>
                )}
                {rejectAllowance != null && (
                  <text
                    x={(purity.rejectX + 624) / 2}
                    y="123"
                    className="inrej"
                    textAnchor="middle"
                  >
                    REJECT ZONE
                  </text>
                )}

                <line
                  x1={purity.measuredX}
                  y1="101"
                  x2={purity.measuredX}
                  y2="139"
                  stroke="var(--signal-ink)"
                  strokeWidth="2"
                />
                <circle
                  cx={purity.measuredX}
                  cy="120"
                  r="4.5"
                  fill="#fff"
                  stroke="var(--signal-ink)"
                  strokeWidth="2"
                />
                {rejectAllowance != null && (
                  <line
                    x1={purity.rejectX}
                    y1="101"
                    x2={purity.rejectX}
                    y2="139"
                    stroke="var(--limit)"
                    strokeWidth="2"
                  />
                )}

                <text x={purity.measuredX} y="168" className="axr" textAnchor="middle">
                  {num(purity.impurities, 3)} MEASURED
                </text>
                {rejectAllowance != null && (
                  <text x={purity.rejectX} y="168" className="axl" textAnchor="middle">
                    {num(purity.impurityAllowance, 2)} MAX
                  </text>
                )}
              </svg>
              <div className="subnote">
                Reported purity of {num(purity.purityPercent, 3)}% implies{' '}
                <b>{num(purity.impurities, 3)}% total impurities</b>
                {rejectAllowance != null ? (
                  <>
                    {' '}
                    against a {num(purity.impurityAllowance, 2)}% allowance (the &gt;
                    {num(purity.specMin, 2)}% floor) — a{' '}
                    <b>{num(purity.marginFactor, 2)}× margin</b>, consuming only{' '}
                    {num(purity.budgetConsumedPct, 1)}% of the impurity budget.
                  </>
                ) : (
                  '.'
                )}{' '}
                Log axis resolves trace quantities a linear purity scale cannot.
              </div>
            </div>
          )}

          {/* 02 — Assay content */}
          {assay && (
            <div className="block">
              <div className="bhead">
                <span className="idx">{idx()}</span>
                <span className="nm">Assay content</span>
                <span className="line" />
                <span className="val">{num(assay.measuredMg, 2)} mg</span>
                <span className="pass info">MEASURED</span>
              </div>
              <svg viewBox="0 0 648 78" xmlns="http://www.w3.org/2000/svg" className="gfx">
                <rect x="4" y="22" width="640" height="30" rx="3" fill="var(--track)" />
                {assay.ticks.map((t, i) => (
                  <g key={i}>
                    <line x1={t.x} y1="22" x2={t.x} y2="52" stroke="var(--grid)" strokeWidth="1" />
                    <text x={t.x} y="68" className="ax" textAnchor="middle">
                      {t.label}
                    </text>
                  </g>
                ))}
                <rect x={assay.barX} y="22" width={assay.barWidth} height="30" fill="var(--signal)" />
                <line
                  x1={assay.targetX}
                  y1="16"
                  x2={assay.targetX}
                  y2="58"
                  stroke="var(--ink)"
                  strokeWidth="2"
                />
                <text x={assay.targetX} y="12" className="brk" textAnchor="middle">
                  TARGET {num(assay.labelClaimMg, 2)} mg
                </text>
                <circle cx={assay.resultX} cy="37" r="4.5" fill="var(--signal-ink)" />
                <text
                  x={assay.resultX > 500 ? assay.resultX - 9 : assay.resultX + 9}
                  y="40"
                  className="axr"
                  textAnchor={assay.resultX > 500 ? 'end' : 'start'}
                >
                  {num(assay.measuredMg, 2)} mg · {num(assay.percentOfClaim, 1)}%
                </text>
                <text x="4" y="68" className="ax" textAnchor="start">
                  % OF LABEL CLAIM
                </text>
              </svg>
              <div className="subnote">
                Measured content is{' '}
                <b>
                  {assay.deltaMg >= 0 ? '+' : ''}
                  {num(assay.deltaMg, 2)} mg ({assay.deltaPct >= 0 ? '+' : ''}
                  {num(assay.deltaPct, 1)}%)
                </b>{' '}
                {assay.deltaMg >= 0 ? 'above' : 'below'} the {num(assay.labelClaimMg, 2)} mg label
                claim. No acceptance range is stated on the source certificate.
              </div>
            </div>
          )}

          {/* 03 — Identity */}
          {hasIdentity && (
            <div className="block">
              <div className="bhead">
                <span className="idx">{idx()}</span>
                <span className="nm">Identity</span>
                <span className="line" />
                <span className="val">
                  {data.identityResult || data.identitySpec} {identityConfirmed ? 'confirmed' : ''}
                </span>
                <span className={`pass${identityConfirmed ? '' : ' info'}`}>
                  {identityConfirmed ? 'PASS' : 'REVIEW'}
                </span>
              </div>
              <div className="idrow">
                <div className="cell">
                  <div className="k">Specification</div>
                  <div className="v">{data.identitySpec || data.compoundName}</div>
                </div>
                <div className="cell">
                  <div className="k">Result</div>
                  <div className="v">
                    <em>{data.identityResult || data.identitySpec}</em>
                  </div>
                </div>
                {data.casNumber && (
                  <div className="cell">
                    <div className="k">CAS</div>
                    <div className="v">{data.casNumber}</div>
                  </div>
                )}
                {data.appearance && (
                  <div className="cell">
                    <div className="k">Appearance</div>
                    <div className="v">{data.appearance}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Chain of custody */}
          {custody && (
            <div className="block">
              <div className="bhead">
                <span className="idx">⏱</span>
                <span className="nm">Chain of custody</span>
                <span className="line" />
                <span className="val" style={{ color: 'var(--mute)' }}>
                  {custody.totalDays}-DAY SPAN
                </span>
              </div>
              <svg viewBox="0 0 648 96" xmlns="http://www.w3.org/2000/svg" className="gfx">
                {custody.ticks.map((t, i) => (
                  <g key={i}>
                    <line x1={t.x} y1="14" x2={t.x} y2="72" stroke="var(--grid)" strokeWidth="1" />
                    <text x={t.x} y="88" className="ax" textAnchor="middle">
                      {t.label}
                    </text>
                  </g>
                ))}
                <text x="66" y="11" className="axcap" textAnchor="end">
                  {custody.monthLabel}
                </text>
                <text x="66" y="40" className="lane" textAnchor="end">
                  IN TRANSIT
                </text>
                <rect
                  x={custody.transit.x}
                  y="26"
                  width={Math.max(2, custody.transit.width)}
                  height="20"
                  rx="3"
                  fill="var(--signal)"
                />
                <text x={custody.transit.x + 7} y="40" className="barlab">
                  ORDER → RECEIPT ({custody.transitDays}d)
                </text>
                <text x="66" y="66" className="lane" textAnchor="end">
                  ANALYSIS
                </text>
                <rect
                  x={custody.testing.x}
                  y="52"
                  width={Math.max(2, custody.testing.width)}
                  height="20"
                  rx="3"
                  fill="var(--signal)"
                />
                <text x={custody.testing.x + 7} y="66" className="barlab">
                  TESTING ({custody.testingDays}d)
                </text>
                {custody.markers.map((m, i) => (
                  <circle
                    key={i}
                    cx={m.x}
                    cy="80"
                    r="3.5"
                    fill={m.kind === 'end' ? 'var(--limit)' : 'var(--ink)'}
                  />
                ))}
              </svg>
            </div>
          )}

          {/* Qualification / warning */}
          <div className="warn">
            <div className="t">▲ Qualification status — internal use</div>
            <div className="x">
              This is a <b>third-party supplier certificate</b>
              {data.issuingLab && data.clientOfRecord
                ? ` issued to ${data.clientOfRecord} by ${data.issuingLab}`
                : data.issuingLab
                  ? ` issued by ${data.issuingLab}`
                  : ''}
              ; <b>Peptsci Research has not independently verified these results</b>.
              {data.notes ? ` ${data.notes}` : ''} Material is{' '}
              <b>research use only — not for human or veterinary use</b>.
            </div>
            {data.hasFile && data.fileUrl && (
              <a className="srcbtn" href={data.fileUrl} target="_blank" rel="noreferrer">
                ⇩ View source certificate{data.fileName ? ` (${data.fileName})` : ''}
              </a>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="foot">
          <div className="fine">
            Summary prepared by <b>Peptsci Research</b>, 401 Jackson St, Suite 2340-K23, Tampa, FL
            33602
            {data.issuingLab ? `, from ${data.issuingLab} Certificate of Analysis` : ''}
            {data.taskNumber ? ` Task #${data.taskNumber}` : ''}
            {data.reportCode ? ` (report code ${data.reportCode})` : ''}
            {data.analyzedOn ? `, analysis conducted ${fmtDate(data.analyzedOn)}` : ''}
            {data.signedBy ? `, signed "${data.signedBy}"` : ''}. All results are as reported by the
            issuing laboratory
            {data.clientOfRecord ? ` to its client of record, ${data.clientOfRecord},` : ''} and
            apply only to {data.batchNumber ? `batch ${data.batchNumber}` : 'the batch'} as
            received. This summary is a reformatting of the supplier document for review and is not a
            substitute for the original certificate, which is retained on file. Research use only —
            not for human or veterinary use.
          </div>
        </div>
      </div>
    </div>
  )
}

export default CoaCertificate
