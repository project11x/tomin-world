# Admin Worker / Pages Function setup

The admin panel at `/admin.html` writes through a Cloudflare Pages Function
(`functions/api/status.js`) that holds the GitHub PAT as a server-side secret.
The browser never sees the token — it only sends its Cloudflare Access cookie.

## One-time setup

### 1. Cloudflare Access (already done if you followed earlier steps)

Zero Trust → Access → Applications → **Add application** → Self-hosted

- Application name: `Shouli Admin`
- Application domain: `shouli.de` paths `/admin.html` **and** `/api/*`
- Identity provider: Email OTP or Google
- Policy: Allow → Emails → `ed.wut@icloud.com`

The path `/api/*` is critical — without it, the Pages Function endpoint is
public and anyone could push to `status.json`.

### 2. Pages environment variables

In Cloudflare Pages → your project → Settings → Environment variables, set the
following (Production scope):

| Name           | Value                                     |
| -------------- | ----------------------------------------- |
| `GH_TOKEN`     | Fine-grained GitHub PAT (see step 3)      |
| `GH_REPO`      | `project11x/tomin-world`                  |
| `ADMIN_EMAILS` | `ed.wut@icloud.com`                       |

Mark `GH_TOKEN` as **Encrypted** (the eye icon).

### 3. GitHub fine-grained PAT

- GitHub → Settings → Developer settings → **Personal access tokens (Fine-grained)**
- Token name: `tomin-world admin status`
- Repository access: Only select repositories → `project11x/tomin-world`
- Repository permissions:
  - Contents: **Read and write**
  - Metadata: **Read** (auto-required)
- Expiration: 1 year (set a reminder to rotate)
- Generate, copy, paste into Pages env var `GH_TOKEN`.

### 4. Deploy

`functions/api/status.js` ships automatically with the next Pages deploy.
Verify after deploy:

```bash
# Should reject without Access JWT (locally)
curl -X PUT https://shouli.de/api/status -H "Content-Type: application/json" -d '{}'
# → redirected to Access login (or 401/403 depending on Access config)
```

## Local development

Pages Functions only run inside Cloudflare's runtime. Locally, the admin save
button will hit `/api/status` and 404. Two options:

- **Recommended**: deploy to a preview environment for testing the save flow.
- Or use `wrangler pages dev` to emulate Functions locally:

  ```bash
  npx wrangler pages dev dist --compatibility-date=2024-01-01
  # Then set env vars: --binding GH_TOKEN=… --binding GH_REPO=… --binding ADMIN_EMAILS=…
  ```

## Rotating the PAT

When the GitHub PAT expires or is compromised:

1. Generate a new fine-grained PAT (step 3 above).
2. Update `GH_TOKEN` in Pages env vars.
3. Trigger a new deploy (any push to main works).

The old token can be revoked immediately on GitHub — no client-side cache to worry about.
