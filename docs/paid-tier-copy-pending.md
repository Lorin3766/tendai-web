# Paid-tier copy — prepare only (do not apply until founder says "billing is on")

Google's paid Gemini API terms (current unpaid → paid difference the product must reflect):
prompts and responses on a billed project are **not** used to improve Google's products; they may be **logged briefly for abuse monitoring**. Keep any EEA/UK wording accurate for the **paid** tier when applying.

## Places to change

### 1. Consent step — `mobile-app/js/features/settings/system-onboarding.js` (~line 319)

**Current (free tier):**
> Because Obrium currently uses Gemini's free tier, Google may use this data to improve its AI models, and it may be reviewed by people at Google …

**Proposed (paid):**
> Obrium uses Google's Gemini API on a billed project. Under Google's paid terms, prompts and replies are not used to improve Google's products; Google may log them briefly for abuse detection. See [Google's Gemini API terms](https://ai.google.dev/gemini-api/terms).

### 2. Privacy Policy — `mobile-app/privacy-policy.html` (Gemini free-tier paragraph)

**Current:**
> Obrium currently uses the free (unpaid) tier of the Gemini API. … Google may use what Obrium sends … to provide, improve and develop Google's products … Human reviewers at Google may read …

**Proposed (paid):**
> Obrium uses the Gemini API on a Google Cloud / AI Studio project with billing enabled. Under [Google's terms for paid use](https://ai.google.dev/gemini-api/terms), Google does not use this content to improve its products. Google may keep prompts and replies for a short period for abuse monitoring and safety. If you do not want this data sent, do not use Talk, and switch off the automatic requests in Settings → Privacy & Security.

### 3. Settings info text — `mobile-app/index.html` (Privacy & Security blurb ~line 1027)

**Current:** describes sending to Gemini without naming free/paid model training.

**Proposed:** no change required unless you want an explicit “billed project; not used to train Google’s models” sentence. Optional add-on after “see the Privacy Policy”:
> On the billed Gemini tier, Google does not use these prompts to improve its products; it may log them briefly for abuse detection.

### 4. Out of scope

- `mobile-app/js/weather-service.js` “free tier” refers to OpenWeatherMap, not Gemini — leave it.
- Code comments that say “Gemini” without free-tier training claims — leave them.

## Apply rule

Apply this file’s replacements **only** when the founder writes **billing is on**. Until then, keep the free-tier consent and policy text so they stay true.
