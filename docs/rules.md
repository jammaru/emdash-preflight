# Policy rules

Preflight evaluates five deterministic rules. Schema-level required fields and primitive constraints remain EmDash's responsibility; Preflight policies express publication requirements that depend on relationships, assignments, or external EmDash resources.

Each rule accepts a `severity`: `off`, `info`, `warning`, or `error`. `off` skips evaluation. In Observe mode all results are stored. In Enforce mode only `error` severity blocks publishing or scheduling.

## `field.required_when`

Requires a content field when another path has a configured value. Nested values use dot-separated paths.

```json
{
  "severity": "error",
  "when": { "field": "sponsored", "equals": true },
  "require": "sponsorName"
}
```

## `media.alt.required`

Checks non-empty alt text on media referenced by the configured paths. Values may be media IDs, objects containing an `id` or `mediaId`, or arrays of those values. Empty image fields are left to the site's schema policy. At most two unique media items are fetched per entry.

```json
{ "severity": "warning", "fields": ["featuredImage", "socialImage"] }
```

## `byline.required`

Requires at least one EmDash byline credit on the entry. Uses one batched byline lookup.

```json
{ "severity": "error" }
```

## `taxonomy.min_terms`

Requires at least `min` assigned terms from a named taxonomy.

```json
{ "severity": "warning", "taxonomy": "category", "min": 1 }
```

## `reference.published`

Requires every referenced entry at the configured field to exist and have `published` status. Configure the target collection explicitly. At most two unique references are fetched per entry.

```json
{ "severity": "error", "field": "featuredArticle", "targetCollection": "posts" }
```

## Policy format

Policy version 1 has a site-wide `mode`, optional `defaults`, and collection-specific rule maps:

```json
{
  "version": 1,
  "mode": "observe",
  "defaults": {},
  "collections": {
    "posts": {
      "rules": {
        "byline.required": { "severity": "error" }
      }
    }
  }
}
```

Collection options override the matching default options. Policies are plain data; executable expressions and custom JavaScript are not supported. Every check is bounded to eight planned host lookups. If a lookup fails or a rule exceeds its supported reference limit, the result carries `complete: false` and `evaluationError`; this is distinct from a content policy failure.

## Issues

Each issue includes `ruleId`, `severity`, `message`, `collection`, `contentId`, an optional `path` and `details`, and a stable `fingerprint`. Fingerprints include the rule, collection, entry ID, and path. Rechecks update existing records, remove resolved records, and preserve `firstSeenAt`.
