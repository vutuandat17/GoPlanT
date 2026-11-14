-- Care schedules: recurring care rules attached to a user's own plant.
-- Concrete occurrences are materialised ahead of time into care_tasks (rolling horizon).

CREATE TABLE care_schedules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_plant_id uuid NOT NULL,
    task_type varchar(32) NOT NULL CHECK (task_type IN (
        'watering', 'fertilizing', 'pruning', 'weeding', 'repotting',
        'cleaning', 'environment_check', 'pest_control', 'misting', 'other')),
    title varchar(160),
    note text,
    repeat_type varchar(20) NOT NULL CHECK (repeat_type IN ('DAILY_INTERVAL', 'WEEKLY')),
    frequency_days integer,
    days_of_week integer[],
    time_of_day time NOT NULL DEFAULT '08:00',
    start_date date NOT NULL,
    end_date date,
    timezone varchar(64) NOT NULL,
    -- Last local date for which care_tasks rows have been generated.
    generated_until date,
    -- Due instant of the next pending occurrence (NULL when nothing is pending).
    next_due_at timestamptz,
    is_active boolean NOT NULL DEFAULT true,
    deactivated_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, owner_user_id),
    FOREIGN KEY (user_plant_id, owner_user_id) REFERENCES user_plants(id, owner_user_id) ON DELETE CASCADE,
    CHECK (repeat_type <> 'DAILY_INTERVAL'
        OR (frequency_days BETWEEN 1 AND 365 AND days_of_week IS NULL)),
    CHECK (repeat_type <> 'WEEKLY'
        OR (frequency_days IS NULL AND days_of_week IS NOT NULL
            AND cardinality(days_of_week) BETWEEN 1 AND 7
            AND days_of_week <@ ARRAY[1, 2, 3, 4, 5, 6, 7])),
    CHECK (end_date IS NULL OR end_date >= start_date),
    CHECK (is_active OR deactivated_at IS NOT NULL)
);
CREATE INDEX ix_care_schedules_owner ON care_schedules(owner_user_id, is_active, created_at DESC);
CREATE INDEX ix_care_schedules_plant ON care_schedules(user_plant_id) WHERE is_active;
CREATE INDEX ix_care_schedules_next_due ON care_schedules(next_due_at) WHERE is_active;
CREATE INDEX ix_care_schedules_generation ON care_schedules(generated_until) WHERE is_active;

CREATE TABLE care_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    care_schedule_id uuid NOT NULL,
    owner_user_id uuid NOT NULL,
    user_plant_id uuid NOT NULL,
    task_type varchar(32) NOT NULL,
    due_date date NOT NULL,
    due_at timestamptz NOT NULL,
    status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'skipped')),
    completed_at timestamptz,
    skipped_at timestamptz,
    note text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    FOREIGN KEY (care_schedule_id, owner_user_id) REFERENCES care_schedules(id, owner_user_id) ON DELETE CASCADE,
    FOREIGN KEY (user_plant_id, owner_user_id) REFERENCES user_plants(id, owner_user_id) ON DELETE CASCADE,
    -- One occurrence per schedule per local day: generation is idempotent.
    UNIQUE (care_schedule_id, due_date),
    CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
    CHECK ((status = 'skipped') = (skipped_at IS NOT NULL))
);
CREATE INDEX ix_care_tasks_owner_due ON care_tasks(owner_user_id, due_date);
CREATE INDEX ix_care_tasks_plant_due ON care_tasks(user_plant_id, due_date);
CREATE INDEX ix_care_tasks_pending ON care_tasks(care_schedule_id, due_at) WHERE status = 'pending';
