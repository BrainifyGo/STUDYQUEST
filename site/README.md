# StudyQuest — the marketing site

A single static page that tells people what StudyQuest is and sends them to the
app to install it. No build step, no framework, no dependencies.

## Why it is separate

The app is a React application that needs a Node server (for the AI calls, the
Lemon Squeezy webhook and the board-paper fetch). This page is three files that
never change per visitor, so it is a static site — which on Render is **free**
and, unlike a free web service, **can carry a custom domain**.

## What it deliberately does NOT do

**It cannot install StudyQuest, and no amount of JavaScript will change that.**
`beforeinstallprompt` is same-origin: a browser only ever lets a site install
*its own* app, or any page could push an app onto you from a domain you had
never visited.

So every Install button here links to the app with `?install=1`, and the app
opens its own install sheet (`src/components/InstallPrompt.tsx`). If someone
later tries to "make the install button work properly from the landing page",
this is why it does not, and cannot.

## Deploying it on Render

1. New → **Static Site**, pointed at this repository.
2. **Root Directory:** `site`
3. **Build Command:** leave empty.
4. **Publish Directory:** `.`
5. Add the custom domain under Settings → Custom Domains once one is bought.

Nothing else. There is no build to run.

## When a domain is bought

The usual arrangement is the marketing site on the bare domain and the app on a
subdomain:

- `studyquest.co.uk` → this static site (free)
- `app.studyquest.co.uk` → the app (needs a paid Render instance; free
  instances cannot have custom domains and sleep after 15 minutes)

Then update the three `studyquest-ruuq.onrender.com` links in `index.html`, and
`VITE_SITE_URL` in the app's environment.
