# Product Strategy

## Working Position

Parcel Tracker is a privacy-first package automation hub for people who want control over their delivery data, not another shopping app.

The product should not compete head-on with Parcel, Shop, AfterShip, or 17TRACK as a generic package tracker. Those products already have mature mobile apps, carrier networks, and notification systems. The stronger wedge is to become the user-owned layer that reads delivery signals from email, cleans them up, stores them locally, and routes them anywhere.

## Core Promise

Own your delivery data. Automatically find packages from your email, review uncertain matches, and sync delivery events to the tools you already use.

## Target Users

- Power users who order frequently and want automation, search, and history.
- Privacy-conscious users who do not want to forward purchase emails to a third party.
- Home automation users who want package events in Home Assistant, Apple Reminders, calendars, chat, or webhooks.
- Small households or teams that need shared package visibility without adopting a merchant SaaS platform.
- Developers who want a local package-tracking API they can build on.

## Competitive Map

| Product | Strength | Opening For Parcel Tracker |
| --- | --- | --- |
| Parcel | Excellent Apple-native package app, push notifications, widgets, Web Access, Amazon integration, broad carrier support. | App/service destination, not a local automation layer. API access and limits are controlled by Parcel. |
| Shop | Strong Gmail/Outlook and Shop Pay order import, convenient consumer app. | Commerce-platform shaped, cloud-account based, limited as a user-owned automation tool. |
| AfterShip | Large carrier network, merchant analytics, branded tracking pages, API and webhooks. | Built for merchants and post-purchase teams, not personal privacy-first package operations. |
| 17TRACK | Huge international carrier coverage and broad tracking aggregation. | Aggregator first, not inbox intelligence or local ownership first. |
| Deliveries / Junecloud | Polished package app with mail-forwarding workflow. | App-centric and third-party sync based. |
| Route | Merchant package protection and branded visual tracking. | Merchant/insurance workflow, not personal automation. |
| Penguin Ship / TrackPack | Close consumer competitors with email-based package discovery. | Our distinction must be self-hosting, auditability, open extensibility, and local-first control. |

## Differentiators

1. Local-first storage
   - Delivery metadata lives in the user's database.
   - A hosted version can exist later, but local ownership remains the brand promise.

2. Inbox intelligence
   - Parse email subject, sender, body, order IDs, tracking candidates, return labels, and confidence.
   - Explain why a package was detected or ignored.

3. Review queue
   - Uncertain matches should be held for user confirmation instead of silently polluting trackers.
   - Every package should expose source, confidence, matched pattern, and carrier inference.

4. Automation router
   - Parcel sync is one integration, not the whole product.
   - Add webhooks, Home Assistant, Apple Reminders, calendar, ntfy, Slack, Discord, email, and custom HTTP destinations.

5. No shopping feed or upsell funnel
   - The product is a tool for the user, not an advertising surface or purchase-intent platform.

6. Extensible parser and connector model
   - Users and contributors can add retailer parsers, carrier patterns, destination integrations, and notification rules.

## Product Shape

The full app should feel like package operations software:

- Deliveries: active packages, status, ETA, carrier, retailer, and source email.
- Review Queue: low-confidence detections, ignored candidates, duplicate handling, bad tracking candidates.
- Automations: sync to Parcel, fire webhooks, add reminders, notify household members.
- Rules: retailer naming, ignore patterns, confidence thresholds, destination-specific routing.
- History: searchable archive of deliveries, retailers, carriers, and order metadata.
- Admin: email accounts, folders, polling health, parser health, sync failures, API quota.

## MVP For Public Release

1. Support iCloud, Gmail, Outlook, and generic IMAP.
2. Add email-forwarding ingestion as an alternative to mailbox access.
3. Keep the local Docker install excellent.
4. Add a proper review queue before third-party sync.
5. Make Parcel sync optional and add generic webhooks.
6. Improve the dashboard into a real app shell.
7. Document privacy boundaries clearly.

## Naming Notes

The current name, Parcel Tracker, is descriptive but crowded and overlaps with existing apps. Before public launch, consider a name that emphasizes ownership and automation rather than generic tracking.

Possible directions:

- PackageOps
- DispatchBoard
- ParcelHub
- DeliveryDesk
- TrackFoundry
- InboxParcel

