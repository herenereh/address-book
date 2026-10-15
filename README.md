# Address Book API

## Design

**Stack:** [Hono](https://hono.dev) running on Cloudflare Workers, written in TypeScript. Request validation uses Zod through `@hono/zod-openapi`, and the Swagger UI comes from `@hono/swagger-ui`.

The code is split into three layers:

- **`src/schemas.ts`** is the single source of truth for the data shape. The Zod schemas validate every request, generate the OpenAPI spec that Swagger shows, and provide the TypeScript types used elsewhere. Because all three come from the same schemas, the docs can't drift from what the API actually accepts.
- **`src/store.ts`** is the in-memory database, a class wrapping a `Map<id, Address>`. It handles create, read, replace, patch, delete, and listing with search, filtering, sorting and pagination. It knows nothing about HTTP, so it could be swapped for a real database without touching the routes.
- **`src/app.ts`** defines the routes. Each one validates the request with a schema, calls the store, and maps the result to a response. `createApp()` builds a fresh app with its own store, which keeps the tests isolated.

**Endpoints**

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/addresses` | List, search, filter, sort and paginate |
| `POST` | `/api/addresses` | Create |
| `GET` | `/api/addresses/{id}` | Get one |
| `PUT` | `/api/addresses/{id}` | Update (full replacement) |
| `PATCH` | `/api/addresses/{id}` | Edit (partial update) |
| `DELETE` | `/api/addresses/{id}` | Delete |
| `PUT` | `/api/addresses/{id}/favorite` | Mark as favorite |
| `DELETE` | `/api/addresses/{id}/favorite` | Remove from favorites |

Swagger UI is served at `/docs` (`/` redirects there), and the raw OpenAPI 3.1 spec is at `/openapi.json`.

**Design choices**

- **Update vs. edit:** `PUT` replaces the whole record, so optional fields you leave out are cleared. `PATCH` changes only the fields you send. Both are offered because the brief lists "edit" and "update" separately.
- **Favorite** has its own sub-resource (`PUT` / `DELETE` on `/favorite`). That makes it idempotent and lets clients favorite an address without sending the record. It can also be set through `POST`, `PUT` or `PATCH`.
- **Search** (`q`) is a case-insensitive substring match across name, email, phone, street, city, state, postal code, country and notes.
- **Sorting** (`sortBy`, `order`) uses a locale-aware, case-insensitive collator with numeric ordering, so `"bob"` sorts next to `"Bob"` and `"Apt 2"` comes before `"Apt 10"`. `favoritesFirst=true` puts favorites on top while keeping the chosen sort within each group.
- **Pagination** uses `page` and `limit`. `limit` defaults to 20 and is capped at 100. The response includes `total`, so clients can build page controls.
- **Errors** return JSON with an `error` message. Validation failures return 400 with a message naming each failing field, and a missing id returns 404.
- **CORS** is open (`*`) so the public API can be called from any frontend.
- **Tests** (`test/app.test.ts`, run with `bun test`) exercise every endpoint through HTTP requests against the app in memory.

## Assumptions

- **In memory means no persistence.** Data lives in a module-level store inside the Worker and is lost on redeploy or restart. That matches the brief's requirement for an in-memory database.
- **Publicly available means no authentication.** Anyone with the URL can read and change data, so it shouldn't hold real personal information.
- **Address fields:** `name`, `street`, `city`, `postalCode` and `country` are required. `email`, `phone`, `state` and `notes` are optional. Email format is validated, and phone numbers are free text because formats vary by country.
- **Lenient input:** an empty or blank string in an optional field means "not set". Sending `""` in a `PATCH` clears that field. Unknown fields, such as `id` or `createdAt` copied from a response, are ignored instead of rejected.
- **Ids** are server-generated UUIDs. Clients never choose them.
- **Single tenant:** there's one shared address book, not one per user.

## Issues encountered


- **Cloudflare build failed on the lockfile.** The local `bun.lock` was written by Bun 1.4.2, which uses lockfile version 2. Cloudflare's build image defaulted to Bun 1.2.15, which can't read that format, and the install failed because the lockfile is frozen during builds. The fix was to set the build variable `BUN_VERSION=1.4.2` in the Cloudflare dashboard to match the local version.

