CREATE TABLE user_avatars (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    content_type varchar(24) NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png')),
    image_bytes bytea NOT NULL CHECK (octet_length(image_bytes) BETWEEN 1 AND 5242880),
    updated_at timestamptz NOT NULL DEFAULT now()
);
