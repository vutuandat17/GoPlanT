-- Plant journals: dated care/growth observations attached to a user's owned plant.
-- Each journal entry can have multiple private photos stored in journal_photos.

CREATE TABLE plant_journals (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_plant_id uuid NOT NULL,
    care_task_id uuid REFERENCES care_tasks(id) ON DELETE SET NULL,
    entry_date date NOT NULL DEFAULT CURRENT_DATE,
    log_type varchar(24) NOT NULL CHECK (log_type IN ('growth', 'watering', 'fertilizing', 'pest', 'pruning', 'other')),
    health_status varchar(24) NOT NULL CHECK (health_status IN ('healthy', 'warning', 'critical')),
    title varchar(160),
    note text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, owner_user_id),
    FOREIGN KEY (user_plant_id, owner_user_id) REFERENCES user_plants(id, owner_user_id) ON DELETE CASCADE
);
CREATE INDEX ix_plant_journals_owner ON plant_journals(owner_user_id, entry_date DESC, created_at DESC);
CREATE INDEX ix_plant_journals_plant ON plant_journals(user_plant_id, entry_date DESC, created_at DESC);

CREATE TABLE journal_photos (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    journal_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    content_type varchar(24) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
    image_bytes bytea NOT NULL CHECK (octet_length(image_bytes) BETWEEN 1 AND 5242880),
    created_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (journal_id, owner_user_id) REFERENCES plant_journals(id, owner_user_id) ON DELETE CASCADE
);
CREATE INDEX ix_journal_photos_journal ON journal_photos(journal_id, created_at ASC);
