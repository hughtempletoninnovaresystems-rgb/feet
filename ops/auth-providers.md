# Google and Facebook sign-in setup

The application uses server-side OAuth authorization-code flows. Provider credentials stay on the server, callback state is signed and short-lived, and OAuth access tokens are discarded after retrieving the account profile. The app does not link accounts just because their email addresses match.

## Environment variables

Set these in the deployment environment and in `.env.local` for local development. Keep secrets out of browser-visible variables such as `NEXT_PUBLIC_*`.

| Variable | Value |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth 2.0 web client ID from Google Cloud |
| `GOOGLE_CLIENT_SECRET` | Secret for that same Google web client |
| `FACEBOOK_APP_ID` | App ID from Meta for Developers |
| `FACEBOOK_APP_SECRET` | Secret for that same Meta app |
| `FACEBOOK_GRAPH_API_VERSION` | A currently supported version such as `v22.0`; keep the `v` prefix |
| `APP_URL` | Canonical app origin, for example `https://example.com` (no callback path) |
| `AUTH_SECRET` | At least 32 characters; signs OAuth state cookies and auth rate-limit keys |
| `RESEND_API_KEY`, `EMAIL_FROM` | Existing email verification delivery configuration, required for registration |

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FACEBOOK_APP_ID`, and `FACEBOOK_APP_SECRET` can be left blank when that provider is not configured. The app hides no buttons, but returns a generic unavailable message until the matching credentials are set.

## Callback URLs

Register the exact URL that matches `APP_URL`:

| Provider | Local development | Production pattern |
| --- | --- | --- |
| Google | `http://localhost:3000/api/auth/oauth/google/callback` | `https://your-domain.example/api/auth/oauth/google/callback` |
| Facebook | `http://localhost:3000/api/auth/oauth/facebook/callback` | `https://your-domain.example/api/auth/oauth/facebook/callback` |

Do not add a trailing slash or alternate hostname unless that exact origin is used for `APP_URL`.

## Google Cloud setup

1. Create or select a Google Cloud project and configure its OAuth consent screen, app name, support email, developer contact, and authorized domains.
2. Create an OAuth client with application type **Web application**.
3. Add the local and production Google callback URLs above under **Authorized redirect URIs**.
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.
5. The app requests only `openid`, `email`, and `profile`. The consent screen must be in a state that allows the intended users to sign in.

Google's [web server OAuth guide](https://developers.google.com/identity/protocols/oauth2/web-server) describes the authorization-code flow and redirect URI setup.

## Meta / Facebook setup

1. Create a Meta app for the intended business and add the **Facebook Login** product for a web app.
2. Add the callback URLs above to the product's **Valid OAuth Redirect URIs** list and enable the web OAuth login flow.
3. Request only the `email` and `public_profile` permissions used by this app. Complete Meta's app review and business verification requirements before opening sign-in to the public.
4. Copy the app ID and app secret into `FACEBOOK_APP_ID` and `FACEBOOK_APP_SECRET`; set `FACEBOOK_GRAPH_API_VERSION` to a version Meta currently supports.

In development mode, only app administrators, developers, testers, and approved test users can use the app. Meta's [Facebook Login documentation](https://developers.facebook.com/docs/facebook-login/) covers app configuration and review.

## Application behavior and launch controls

- Login signs in only an identity already linked to that exact provider subject. Users with an email/password account must continue using that method; matching email addresses do not silently join accounts.
- Registration creates a pending client or model account, records Terms and Privacy acceptance, then emails a verification link. If Facebook does not provide an email address, registration cannot continue.
- Provider sign-in does not prove that a person is an adult. Users must still verify their email and complete the app's separate Didit age-assurance flow.
- `PUBLIC_SIGNUPS_ENABLED` and the legal, age-assurance, and provider readiness checks continue to gate registration in production. Do not open public signups before the operator completes sign-off and tests both provider consoles and callback domains.
- Register production callback URLs only after the final hostname is selected. Keep the development and production OAuth clients/apps separate where practical, and rotate a credential immediately if it is exposed.
