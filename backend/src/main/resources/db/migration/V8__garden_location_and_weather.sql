-- Garden location (province or device GPS) and cached outdoor weather from OpenWeatherMap.
-- Coordinates are what the weather lookup uses; province_code is a label from the 34 provinces/cities
-- of Vietnam (administrative units effective 2025-07-01). GPS coordinates are rounded by the API
-- before storage (about 110 m precision), which is enough for weather and limits location exposure.

ALTER TABLE gardens
    ADD COLUMN province_code varchar(40),
    ADD COLUMN latitude double precision,
    ADD COLUMN longitude double precision,
    ADD COLUMN location_source varchar(16);

ALTER TABLE gardens
    ADD CONSTRAINT ck_gardens_latitude CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
    ADD CONSTRAINT ck_gardens_longitude CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
    ADD CONSTRAINT ck_gardens_coordinates_pair CHECK ((latitude IS NULL) = (longitude IS NULL)),
    ADD CONSTRAINT ck_gardens_location_source CHECK (location_source IS NULL OR location_source IN ('province', 'gps')),
    ADD CONSTRAINT ck_gardens_location_consistency CHECK ((location_source IS NULL) = (latitude IS NULL)),
    ADD CONSTRAINT ck_gardens_province_requires_code CHECK (location_source IS DISTINCT FROM 'province' OR province_code IS NOT NULL);

-- One latest snapshot per garden. Reused until it expires (cache TTL in application config) so that
-- opening the app does not call OpenWeatherMap every time.
CREATE TABLE garden_weather_snapshots (
    garden_id uuid PRIMARY KEY REFERENCES gardens(id) ON DELETE CASCADE,
    source_latitude double precision NOT NULL,
    source_longitude double precision NOT NULL,
    location_name varchar(160),
    temperature_c numeric(5,2) NOT NULL,
    feels_like_c numeric(5,2),
    temp_min_c numeric(5,2),
    temp_max_c numeric(5,2),
    humidity_pct smallint CHECK (humidity_pct IS NULL OR humidity_pct BETWEEN 0 AND 100),
    pressure_hpa integer,
    wind_speed_ms numeric(6,2),
    clouds_pct smallint CHECK (clouds_pct IS NULL OR clouds_pct BETWEEN 0 AND 100),
    condition_code integer,
    condition_main varchar(60),
    condition_description varchar(160),
    icon_code varchar(8),
    observed_at timestamptz NOT NULL,
    fetched_at timestamptz NOT NULL DEFAULT now()
);
