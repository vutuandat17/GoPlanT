-- Add extended agronomic & care metadata columns to plant_catalog
-- so all PlantDetailScreen fields can be populated from the catalog API.

ALTER TABLE plant_catalog
    ADD COLUMN IF NOT EXISTS lifespan varchar(120),
    ADD COLUMN IF NOT EXISTS flowering_season varchar(160),
    ADD COLUMN IF NOT EXISTS humidity varchar(80),
    ADD COLUMN IF NOT EXISTS medium text,
    ADD COLUMN IF NOT EXISTS drainage varchar(160),
    ADD COLUMN IF NOT EXISTS mature_size varchar(160),
    ADD COLUMN IF NOT EXISTS growth_rate varchar(120),
    ADD COLUMN IF NOT EXISTS soil_ph varchar(64),
    ADD COLUMN IF NOT EXISTS nutrition text;
