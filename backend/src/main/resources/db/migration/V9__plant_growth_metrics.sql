-- Growth metrics recorded over time for a user's owned plant (height, leaf count, bloom stage).

CREATE TABLE plant_growth_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_plant_id uuid NOT NULL,
    owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recorded_date date NOT NULL DEFAULT CURRENT_DATE,
    height_cm numeric(5,1) CHECK (height_cm IS NULL OR height_cm BETWEEN 0 AND 9999.9),
    leaf_count integer CHECK (leaf_count IS NULL OR leaf_count BETWEEN 0 AND 100000),
    bloom_stage varchar(24) CHECK (bloom_stage IS NULL OR bloom_stage IN ('seedling', 'budding', 'flowering', 'fruiting')),
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (user_plant_id, owner_user_id) REFERENCES user_plants(id, owner_user_id) ON DELETE CASCADE
);

CREATE INDEX ix_plant_growth_records_plant
    ON plant_growth_records(user_plant_id, recorded_date ASC, created_at ASC);
