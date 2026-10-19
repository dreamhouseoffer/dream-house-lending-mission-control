# Body OS — WHOOP Privacy Notice

Effective date: October 19, 2026

Body OS is a personal-use fitness dashboard within Mission Control, intended for the app owner's own WHOOP account. It is not a public fitness service or a medical device. WHOOP access is optional and is not active until the owner completes authorization.

## Data and purpose
When the owner authorizes WHOOP access, Body OS requests the read permissions needed to display recovery, sleep and physiological-cycle information. These may include recovery scores, heart-rate variability, resting heart rate, sleep measurements and strain. Workout-summary access may be added only if enabled and disclosed. Strength-training weights, repetitions, sets, effort and optional notes are recorded separately by the owner; they are not represented as data supplied by WHOOP.

This information is used for personal tracking and training planning, not diagnosis, treatment or clearance to exercise an injury. A readiness score does not override clinical restrictions.

## Storage and access
The primary fitness log and integration credentials are stored in private files on the owner's computer. WHOOP responses may be cached temporarily in the running service. The dashboard is hosted through Vercel and uses an authenticated connection to that computer, so information displayed remotely passes through the dashboard's hosting and connection providers. Those providers may process normal request metadata and operational logs. Access to fitness views requires Mission Control sign-in. WHOOP client secrets and access/refresh tokens are not displayed in the dashboard or committed to its public source repository.

## Sharing
Body OS does not sell WHOOP or workout data, use it for advertising, or publish it to social media. Its WHOOP adapter does not automatically send health records to an AI service or run model training. WHOOP itself processes account and device data under its own policies. Any later addition of a new data-sharing purpose must be disclosed before activation.

## Retention and owner control
Workout logs remain until the owner requests deletion. If the configured storage capacity is reached, new saves are refused rather than silently deleting prior records. Temporarily cached WHOOP information may remain until replaced or the service stops. Revoking access in WHOOP prevents continued authorized API access but does not itself erase previously saved workout records. The owner can request local deletion separately; the app does not promise an automatic deletion schedule.

## Contact and changes
For access, correction or deletion requests, contact the application owner through your existing private communication channel. Do not post health records or credentials in public repository issues. This app is intended only for that owner's personal use. This notice will be revised when the implemented data flow changes.
