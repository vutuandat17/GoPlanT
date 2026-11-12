CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name varchar(120) NOT NULL,
    password_hash varchar(255) NOT NULL,
    status varchar(24) NOT NULL CHECK (status IN ('pending_verification', 'active', 'disabled', 'locked')),
    timezone varchar(64) NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_email_addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    normalized_email varchar(320) NOT NULL UNIQUE,
    address_type varchar(20) NOT NULL CHECK (address_type IN ('primary', 'pending_change')),
    verified_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (normalized_email = lower(trim(normalized_email)))
);
CREATE UNIQUE INDEX uq_user_primary_email ON user_email_addresses(user_id) WHERE address_type = 'primary';
CREATE UNIQUE INDEX uq_user_pending_email ON user_email_addresses(user_id) WHERE address_type = 'pending_change';

CREATE TABLE account_action_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    purpose varchar(24) NOT NULL CHECK (purpose IN ('EMAIL_VERIFICATION')),
    token_hash varchar(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    consumed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar(40) NOT NULL UNIQUE,
    name varchar(100) NOT NULL
);
CREATE TABLE user_roles (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);
INSERT INTO roles(code, name) VALUES ('admin', 'Administrator'), ('user', 'User');

CREATE TABLE plant_catalog (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    common_name varchar(200) NOT NULL,
    scientific_name varchar(240) NOT NULL,
    category varchar(80) NOT NULL,
    publication_status varchar(24) NOT NULL DEFAULT 'draft' CHECK (publication_status IN ('draft', 'approved', 'rejected')),
    is_active boolean NOT NULL DEFAULT true,
    reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (publication_status <> 'approved' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX ix_plant_catalog_public ON plant_catalog(publication_status, is_active, common_name);
CREATE TABLE plant_catalog_sources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plant_catalog_id uuid NOT NULL REFERENCES plant_catalog(id) ON DELETE CASCADE,
    source_title varchar(240),
    source_url text,
    accessed_at timestamptz NOT NULL DEFAULT now(),
    supports_fields text[] NOT NULL,
    added_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (nullif(trim(source_title), '') IS NOT NULL OR nullif(trim(source_url), '') IS NOT NULL),
    CHECK (cardinality(supports_fields) > 0)
);

CREATE TABLE gardens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name varchar(160) NOT NULL,
    location_type varchar(32) NOT NULL CHECK (location_type IN ('balcony', 'rooftop', 'garden', 'indoor', 'greenhouse', 'other')),
    location_detail varchar(240),
    description text,
    cover_image_key text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, owner_user_id)
);
CREATE INDEX ix_gardens_owner ON gardens(owner_user_id, created_at DESC);

CREATE TABLE user_plants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    garden_id uuid,
    plant_catalog_id uuid NOT NULL REFERENCES plant_catalog(id) ON DELETE RESTRICT,
    display_name varchar(200) NOT NULL,
    specific_location varchar(200),
    added_at timestamptz NOT NULL DEFAULT now(),
    planted_on date,
    note text,
    archived_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, owner_user_id),
    FOREIGN KEY (garden_id, owner_user_id) REFERENCES gardens(id, owner_user_id) ON DELETE RESTRICT
);
CREATE INDEX ix_user_plants_owner ON user_plants(owner_user_id, created_at DESC);

CREATE TABLE user_plant_favorites (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plant_catalog_id uuid NOT NULL REFERENCES plant_catalog(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, plant_catalog_id)
);
