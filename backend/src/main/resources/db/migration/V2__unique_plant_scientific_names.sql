CREATE UNIQUE INDEX uq_plant_catalog_scientific_name
    ON plant_catalog (lower(scientific_name));
