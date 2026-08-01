import { describe, expect, it } from 'vitest'
import { normalizeDoseLabel } from '../labels/peptsciLabelPdf'

describe('normalizeDoseLabel', () => {
  it('strips trailing .0 decimals', () => {
    expect(normalizeDoseLabel('10.0 mg')).toBe('10mg')
    expect(normalizeDoseLabel('60.00mg')).toBe('60mg')
  })

  it('removes the space between the number and the unit', () => {
    expect(normalizeDoseLabel('5 mg')).toBe('5mg')
    expect(normalizeDoseLabel('10 MG')).toBe('10mg')
  })

  it('treats a bare number as mg', () => {
    expect(normalizeDoseLabel('10')).toBe('10mg')
    expect(normalizeDoseLabel('10.0')).toBe('10mg')
  })

  it('keeps meaningful fractional doses', () => {
    expect(normalizeDoseLabel('2.5mg')).toBe('2.5mg')
    expect(normalizeDoseLabel('2.50 mg')).toBe('2.5mg')
  })

  it('normalizes every dose in a blend string', () => {
    expect(normalizeDoseLabel('5.0 mg / 5.0 mg')).toBe('5mg / 5mg')
  })

  it('leaves already-clean values untouched', () => {
    expect(normalizeDoseLabel('10mg')).toBe('10mg')
  })
})
