/**
 * Shared OL4891LP sheet cursor — continue printing where the last job left off.
 *
 * Positions are stored 0-based (slot index). Operators think in 1–36; convert at
 * the API boundary with `toOperatorPosition` / `fromOperatorPosition`.
 */

import { prisma } from '@/lib/prisma'
import { OL4891LP, labelsPerSheet } from './sheet-layout'

export const VIAL_LABEL_SHEET_CURSOR_KEY = 'vial_label_sheet_next_slot'

const PER_SHEET = labelsPerSheet(OL4891LP)

export function clampStartSlot(slot: number): number {
  if (!Number.isFinite(slot)) return 0
  const n = Math.trunc(slot)
  return ((n % PER_SHEET) + PER_SHEET) % PER_SHEET
}

/** 0-based slot → operator space 1–36. */
export function toOperatorPosition(slot: number): number {
  return clampStartSlot(slot) + 1
}

/** Operator space 1–36 → 0-based slot. */
export function fromOperatorPosition(position: number): number {
  if (!Number.isFinite(position)) return 0
  const p = Math.trunc(position)
  if (p < 1) return 0
  if (p > PER_SHEET) return 0
  return p - 1
}

export async function getVialLabelSheetStartSlot(): Promise<number> {
  if (!prisma) return 0
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: VIAL_LABEL_SHEET_CURSOR_KEY },
    })
    if (!row) return 0
    return clampStartSlot(Number.parseInt(row.value, 10))
  } catch {
    // Table may not exist yet before migrate deploy — start at slot 0.
    return 0
  }
}

export async function setVialLabelSheetStartSlot(slot: number): Promise<number> {
  const next = clampStartSlot(slot)
  if (!prisma) return next
  try {
    await prisma.appSetting.upsert({
      where: { key: VIAL_LABEL_SHEET_CURSOR_KEY },
      create: { key: VIAL_LABEL_SHEET_CURSOR_KEY, value: String(next) },
      update: { value: String(next) },
    })
  } catch {
    /* migrate not applied yet */
  }
  return next
}

/** After printing `count` labels from `startSlot`, persist the next empty slot. */
export async function advanceVialLabelSheetCursor(
  startSlot: number,
  labelsPrinted: number
): Promise<number> {
  if (labelsPrinted <= 0) return clampStartSlot(startSlot)
  return setVialLabelSheetStartSlot(startSlot + labelsPrinted)
}
