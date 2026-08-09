-- Named blends (GLOW / KLOW) should store the trade name as Product.name.
-- Older rows saved from the blend form without a blend-name field kept the
-- compound chain as the name (e.g. "GHK-Cu and BPC-157 and TB-500" for SKU GLOW,
-- or the four-compound KLOW 80 chain including KPV).
-- Promote those to the trade name and preserve the compounds in aka.
--
-- Canonical stock doses (slash-separated, same order as aka):
--   GLOW 70: 50mg / 10mg / 10mg          (GHK-Cu / BPC-157 / TB-500)
--   KLOW 80: 50mg / 10mg / 10mg / 10mg   (GHK-Cu / BPC-157 / TB-500 / KPV)

UPDATE "Product" p
SET
  name = 'GLOW',
  aka = COALESCE(
    NULLIF(btrim(p.aka), ''),
    CASE
      WHEN p.name ~* '\sand\s|/' THEN
        regexp_replace(regexp_replace(p.name, '\s+blend$', '', 'i'), '\s+and\s+', ' / ', 'gi')
      ELSE 'GHK-Cu / BPC-157 / TB-500'
    END
  )
FROM "ProductVariant" v
WHERE v."productId" = p.id
  AND (
    upper(v.sku) = 'GLOW'
    OR upper(v.sku) LIKE 'GLOW-%'
    OR (
      p.name ~* 'GHK'
      AND p.name ~* 'BPC'
      AND p.name ~* 'TB'
      AND p.name !~* 'KPV'
      AND p.name ~* '\sand\s|/'
    )
  )
  AND (
    p.name ~* '\sand\s|/'
    OR p.name ~* '^glow'
  )
  AND p.name !~* '^GLOW$';

UPDATE "Product" p
SET
  name = 'KLOW',
  aka = COALESCE(
    NULLIF(btrim(p.aka), ''),
    CASE
      WHEN p.name ~* '\sand\s|/' THEN
        regexp_replace(regexp_replace(p.name, '\s+blend$', '', 'i'), '\s+and\s+', ' / ', 'gi')
      ELSE 'GHK-Cu / BPC-157 / TB-500 / KPV'
    END
  )
FROM "ProductVariant" v
WHERE v."productId" = p.id
  AND (
    upper(v.sku) = 'KLOW'
    OR upper(v.sku) LIKE 'KLOW-%'
    OR (
      p.name ~* 'GHK'
      AND p.name ~* 'BPC'
      AND p.name ~* 'TB'
      AND p.name ~* 'KPV'
      AND p.name ~* '\sand\s|/'
    )
  )
  AND (
    p.name ~* '\sand\s|/'
    OR p.name ~* '^klow'
  )
  AND p.name !~* '^KLOW$';

-- Align variant dose strings to the GHK-first stock order when they still use
-- the older BPC/TB/GHK[/KPV] ordering.
UPDATE "ProductVariant"
SET dose = '50mg/10mg/10mg'
WHERE upper(sku) IN ('GLOW', 'GLOW-70')
  AND dose IN ('10mg/10mg/50mg', '10mg / 10mg / 50mg');

UPDATE "ProductVariant"
SET dose = '50mg/10mg/10mg/10mg'
WHERE upper(sku) IN ('KLOW', 'KLOW-80')
  AND dose IN ('10mg/10mg/50mg/10mg', '10mg / 10mg / 50mg / 10mg');
