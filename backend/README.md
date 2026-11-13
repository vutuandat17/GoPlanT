# GoPlant Backend (V1)

REST API for the Expo/React Native application, built with Spring Boot 3.5, Java 21 and PostgreSQL. Flyway migrations are the source of truth for database schema; API persistence uses parameterized SQL through Spring JDBC.

## Start locally

Requirements: JDK 21, Maven 3.9+, and Docker Desktop (for PostgreSQL).

Use one PostgreSQL instance on port `5432`. If the Windows PostgreSQL service and this Docker container are both running, stop the Windows service from an elevated PowerShell before starting the project container:

```powershell
Stop-Service postgresql-x64-17
```

```powershell
docker compose up -d postgres
$containerId = docker compose ps -q postgres
if (-not $containerId) { throw 'PostgreSQL container was not found.' }
$pgPasswordSetting = docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' $containerId | Select-String '^POSTGRES_PASSWORD='
if (-not $pgPasswordSetting) { throw 'The container has no POSTGRES_PASSWORD setting.' }
$env:DATABASE_PASSWORD = $pgPasswordSetting.Line.Substring('POSTGRES_PASSWORD='.Length)

$env:PORT = '8082'
$rng = [Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 48
$rng.GetBytes($bytes)
$env:GOPLANT_JWT_SECRET = [Convert]::ToBase64String($bytes)
$rng.Dispose()
mvn spring-boot:run
```

Keep this terminal open while using the app. The API listens on `http://localhost:8082`; check `http://localhost:8082/actuator/health`. The command reads the Docker container's configured database password without displaying it. For an existing database, changing Compose's `POSTGRES_PASSWORD` does not change the password stored in PostgreSQL; if the database role password was changed separately, set `DATABASE_PASSWORD` to its current value. Do not use `docker compose down -v` to fix authentication because it deletes the database volume.

If the API reports `password authentication failed`, verify that `DATABASE_PASSWORD` matches the PostgreSQL instance the API reaches. Do not run both the Windows service and the Docker container on port `5432`. To use a Windows PostgreSQL instance instead, run `docker compose stop postgres` and set `DATABASE_URL`, `DATABASE_USERNAME`, and `DATABASE_PASSWORD` to that instance's values. Flyway applies migrations on startup. Set `GOPLANT_CORS_ALLOWED_ORIGINS` to a comma-separated allowlist for the frontend origins used by your environment. The PowerShell-compatible random secret commands above also work on Windows PowerShell versions that do not support `RandomNumberGenerator.GetBytes(int)`.

If `mvn` is not on PATH, run Maven with its installed path, for example:

```powershell
& "C:\Users\rev\AppData\Local\Programs\Apache\Maven\apache-maven-3.9.16\bin\mvn.cmd" spring-boot:run
```

For a new database only, create the initial administrator by setting both variables before starting the API. The password is hashed before storage and is never seeded into source or logs:

```powershell
$env:GOPLANT_BOOTSTRAP_ADMIN_EMAIL = 'admin@goplant.test'
$env:GOPLANT_BOOTSTRAP_ADMIN_PASSWORD = '<set-the-existing-admin-password-or-a-new-unique-password>'
mvn spring-boot:run
```

The bootstrap defaults to `admin@goplant.test` and runs only when that email does not already exist. Passwords must contain at least 8 characters. Existing administrator records are never overwritten, even if a different bootstrap password is provided. The current local database already has this admin; leave the bootstrap password unset to preserve it. Remove bootstrap variables after provisioning.

## Authentication

Register creates an account in `pending_verification`; login is allowed only after its primary email is verified. Verification tokens are random, single-use, expire after 24 hours, and only their SHA-256 hashes are stored. Registration sends a verification email through SMTP and rolls back account creation if SMTP is missing or delivery fails. The email link opens a confirmation page; the user must press its button, so automated link previews do not consume the token. SMTP credentials and a public API URL are required for registration outside local token testing:

```powershell
$env:SPRING_MAIL_HOST = 'smtp.example.com'
$env:SPRING_MAIL_PORT = '587'
$env:SPRING_MAIL_USERNAME = 'your-smtp-user'
$env:SPRING_MAIL_PASSWORD = 'your-smtp-password'
$env:SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH = 'true'
$env:SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE = 'true'
$env:GOPLANT_EMAIL_FROM = 'no-reply@example.com'
$env:GOPLANT_PUBLIC_API_URL = 'https://api.example.com'
mvn spring-boot:run
```

For local development only, activate the `local` profile and set `GOPLANT_AUTH_EXPOSE_VERIFICATION_TOKEN=true` to return the token from registration instead of sending email. The application refuses to expose tokens under any other profile.

```http
POST /api/v1/auth/register
Content-Type: application/json

{"displayName":"Nguyen An","email":"an@example.com","password":"a-unique-password-12"}
```

```http
POST /api/v1/auth/verify-email
Content-Type: application/json

{"token":"<verification-token>"}
```

The email link opens `GET /api/v1/auth/verify-email?token=...`, which presents a confirmation button. Pressing it submits the token and activates the account.

```http
POST /api/v1/auth/login
Content-Type: application/json

{"email":"an@example.com","password":"a-unique-password-12"}
```

Login returns a short-lived JWT (15 minutes by default); send it as `Authorization: Bearer <accessToken>`. JWT signing uses HS256 and requires `GOPLANT_JWT_SECRET` with at least 32 bytes. Refresh tokens and individual session revocation are not implemented in V1.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/v1/health` | Public | API status |
| GET | `/actuator/health` | Public | Operational health |
| POST | `/api/v1/auth/register` | Public | Create pending account |
| GET, POST | `/api/v1/auth/verify-email` | Public | Confirm and verify primary email |
| POST | `/api/v1/auth/login` | Public | Issue access token |
| GET | `/api/v1/catalog/plants` | Public | List active, approved catalog entries only |
| POST | `/api/v1/admin/catalog/plants` | Admin | Add and publish a catalog entry with its source |
| POST | `/api/v1/admin/catalog/plants/{id}/approve` | Admin | Approve and publish a draft |
| GET, POST, DELETE | `/api/v1/gardens[/{id}]` | User | List, create and delete own gardens |
| GET, POST, PUT, DELETE | `/api/v1/plants[/{id}]` | User | List, add, update and archive own plants |
| GET | `/api/v1/auth/me` | User | Return the current account |
| GET | `/api/v1/favorites` | User | List favorite catalog entries |
| POST, DELETE | `/api/v1/catalog/plants/{id}/favorite` | User | Add or remove a favorite |
| POST, GET | `/api/v1/plants/{id}/photo` | Plant owner | Upload and view the private plant photo |

Owned garden/plant queries are scoped by the authenticated JWT subject. The database also constrains garden ownership on a plant assignment. Plant owners can upload JPEG or PNG photos up to 5 MB; uploads are validated and stored in PostgreSQL, and only the owner can retrieve them. On startup, the backend idempotently adds 21 commonly grown indoor, flowering, herb and vegetable plants, with scientific names and Kew Plants of the World Online reference links. A verified active admin account is required for these curated rows to be seeded. No unverified care instructions or mock users are seeded. New admin-created plants require at least a source title or URL and are published with the admin recorded as reviewer.

## V1 defaults and remaining scope

This V1 records implementation defaults approved for this work: catalog states are `draft`, `approved`, `rejected`; a skipped care occurrence is to be treated as immutable history when that feature is added; catalog source fields for the initial API are `common_name`, `scientific_name`, and `category`. The account invariant is enforced transactionally by the service and unique constraints; active accounts are only promoted alongside verification of their primary email.

Flyway migrations cover identity/RBAC roles, email verification tokens, catalog/source metadata, gardens, owned plants, favorites and private user plant photos. Journals, care schedules/occurrences, metrics/units, account recovery, refresh sessions, admin audit, retention/backup policy and production operations remain future work. Their domain codes and operational policies need review before those modules are added.

## Containers

Build the API image with `docker build -t goplant-backend .` from this directory. `compose.yaml` runs PostgreSQL only; start the API separately during development. For production, supply secrets through a secret manager and configure TLS, SMTP credentials, rate limits, backup/restore and audit before exposing the service.
