// Recorded scenarios for fixture-driven adapter development.
//
// Every fixture is SYNTHETIC content in the real markup structure of its source:
// enough to exercise a parser faithfully without copying anyone's listings.
// The set is chosen to cover the ways ingestion goes wrong in production, not
// just the happy path — a parser that only ever sees a well-formed page is a
// parser whose failure behavior is unknown.

export const SCENARIOS = [
  "normal",
  "changed_layout",
  "missing_fields",
  "closed",
  "expired",
  "invalid",
  "bot_challenge",
  "duplicate",
  "geo_restricted",
  "multi_entry",
  "broken_official_link",
] as const;

export type ScenarioName = (typeof SCENARIOS)[number];

// ---------------------------------------------------------------------------
// Sweepstakes Advantage — hub + daily listing pages
// ---------------------------------------------------------------------------

export const SA_HUB_HTML = `
  <h2>New Sweepstakes</h2>
  <a href="/new-sweepstakes-1784073600.html" class="text-warning">Wednesday, July 15 2026 New Sweepstakes</a>
  <a href="/new-sweepstakes-1783987200.html" class="text-warning">Tuesday, July 14 2026 New Sweepstakes</a>
`;

/** Hub with no daily link at all — the source reorganized on us. */
export const SA_HUB_EMPTY_HTML = `<h2>New Sweepstakes</h2><p>Check back soon.</p>`;

export const SA_DAILY_HTML = `
<div class="panel panel-default sweepstake-item" data-link_id="1539742">
  <div class="panel-heading">
    <span class="pop-checkbox">&#9633;</span> 1.
    <a href="/sweepstakes-1539742.html" target="_blank" rel="nofollow">Daily Cash Blast Giveaway</a>
  </div>
  <div class="panel-body">
    <p class="sweepstake-description">Enter every day for a shot at cold hard cash.</p>
    <div class="sweepstake-details">
      <div class="pull-left"><strong>Restrictions:</strong> 18+ US only.</div>
      <div class="pull-left"><strong>Limit:</strong> Unlimited Daily Entry</div>
      <div class="pull-left"><strong>Expires:</strong> 07-31-2026 11:59 PM EST</div>
      <div class="pull-left"><strong>Value:</strong> $50.00</div>
    </div>
  </div>
</div>
<div class="panel panel-default sweepstake-item" data-link_id="1551236">
  <div class="panel-heading">
    <span class="pop-checkbox">&#9633;</span> 2.
    <a href="/sweepstakes-1551236.html" target="_blank" rel="nofollow">Books &amp; Brews Giveaway</a>
  </div>
  <div class="panel-body">
    <p class="sweepstake-description">Win a year of books.</p>
    <div class="sweepstake-details">
      <div class="pull-left"><strong>Restrictions:</strong> 21+ US &amp; Canada.</div>
      <div class="pull-left"><strong>Limit:</strong> One Time Entry</div>
      <div class="pull-left"><strong>Expires:</strong> 08-15-2026 11:59 PM EST</div>
      <div class="pull-left"><strong>Value:</strong> $1,000.00</div>
    </div>
  </div>
</div>
`;

/**
 * The same listings after a template change: the container attribute the parser
 * splits on is gone. This is the single most likely real-world break, and the
 * correct behavior is zero leads (not garbage leads), loudly.
 */
export const SA_DAILY_CHANGED_LAYOUT_HTML = `
<article class="sweep-card" data-sweep-id="1539742">
  <h3><a href="/sweepstakes-1539742.html">Daily Cash Blast Giveaway</a></h3>
  <p class="summary">Enter every day for a shot at cold hard cash.</p>
  <ul class="meta"><li>Limit: Unlimited Daily Entry</li><li>Expires: 07-31-2026</li></ul>
</article>
`;

/** A card with the container and title but none of the labeled metadata. */
export const SA_DAILY_MISSING_FIELDS_HTML = `
<div class="panel panel-default sweepstake-item" data-link_id="1600001">
  <div class="panel-heading">
    <a href="/sweepstakes-1600001.html" target="_blank" rel="nofollow">Mystery Giveaway</a>
  </div>
  <div class="panel-body"><div class="sweepstake-details"></div></div>
</div>
`;

/** Two cards that resolve to the SAME official page — cross-source duplicate. */
export const SA_DAILY_DUPLICATE_HTML = `
<div class="panel panel-default sweepstake-item" data-link_id="1700001">
  <div class="panel-heading">
    <a href="/sweepstakes-1700001.html" target="_blank" rel="nofollow">Cash Blast Giveaway</a>
  </div>
  <div class="panel-body">
    <div class="sweepstake-details">
      <div class="pull-left"><strong>Expires:</strong> 07-31-2026 11:59 PM EST</div>
    </div>
  </div>
</div>
<div class="panel panel-default sweepstake-item" data-link_id="1700002">
  <div class="panel-heading">
    <a href="/sweepstakes-1700002.html" target="_blank" rel="nofollow">Daily Cash Blast — Enter Now</a>
  </div>
  <div class="panel-body">
    <div class="sweepstake-details">
      <div class="pull-left"><strong>Expires:</strong> 07-31-2026 11:59 PM EST</div>
    </div>
  </div>
</div>
`;

// ---------------------------------------------------------------------------
// Sweepstakes Today — listings index
// ---------------------------------------------------------------------------

export const ST_INDEX_HTML = `
<div id="content">
  <table class="sweeps-table">
    <tr class="sweep-row">
      <td class="sweep-title"><a href="/sweepstakes/win-a-kitchen-makeover-88213.html">Win a Kitchen Makeover</a></td>
      <td class="sweep-end">Ends: 2026-09-01</td>
      <td class="sweep-freq">Daily</td>
    </tr>
    <tr class="sweep-row">
      <td class="sweep-title"><a href="/sweepstakes/summer-road-trip-cash-88214.html">Summer Road Trip Cash</a></td>
      <td class="sweep-end">Ends: 2026-08-20</td>
      <td class="sweep-freq">One Time</td>
    </tr>
    <tr class="sweep-row">
      <td class="sweep-title"><a href="/sweepstakes/canada-only-cabin-getaway-88215.html">Canada-Only Cabin Getaway</a></td>
      <td class="sweep-end">Ends: 2026-10-05</td>
      <td class="sweep-freq">Weekly</td>
    </tr>
  </table>
</div>
`;

/** Index whose rows carry no detail links — nothing to follow. */
export const ST_INDEX_EMPTY_HTML = `
<div id="content"><table class="sweeps-table"><tr class="sweep-row"><td>No sweepstakes today.</td></tr></table></div>
`;

export const ST_DETAIL_HTML = `
<div class="sweep-detail">
  <h1>Win a Kitchen Makeover</h1>
  <p class="sponsor">Sponsored by Northwind Appliances</p>
  <a class="enter-btn" href="https://northwind-appliances.example.com/kitchen-sweeps?utm_source=st">Enter Here</a>
  <a class="rules-link" href="https://northwind-appliances.example.com/kitchen-sweeps/official-rules">Official Rules</a>
</div>
`;

/** Detail page whose entry link is a bare fragment — a broken official link. */
export const ST_DETAIL_BROKEN_LINK_HTML = `
<div class="sweep-detail">
  <h1>Summer Road Trip Cash</h1>
  <p class="sponsor">Sponsored by Cascade Motors</p>
  <a class="enter-btn" href="#">Enter Here</a>
</div>
`;

export const ST_DETAIL_GEO_HTML = `
<div class="sweep-detail">
  <h1>Canada-Only Cabin Getaway</h1>
  <p class="sponsor">Sponsored by Laurentide Cabins</p>
  <p class="eligibility">Open to legal residents of Canada (excluding Quebec), 19+.</p>
  <a class="enter-btn" href="https://laurentide-cabins.example.com/cabin-getaway">Enter Here</a>
  <a class="rules-link" href="https://laurentide-cabins.example.com/cabin-getaway/rules">Official Rules</a>
</div>
`;

// ---------------------------------------------------------------------------
// The Freebie Guy — sweepstakes category archive
// ---------------------------------------------------------------------------

export const FG_ARCHIVE_HTML = `
<main>
  <article class="post type-post">
    <h2 class="entry-title"><a href="https://thefreebieguy.com/sweepstakes/win-a-year-of-coffee/">Win a Year of Coffee Sweepstakes</a></h2>
    <div class="entry-meta"><time datetime="2026-07-15">July 15, 2026</time></div>
  </article>
  <article class="post type-post">
    <h2 class="entry-title"><a href="https://thefreebieguy.com/freebies/free-sample-box/">Free Sample Box (No Entry Needed)</a></h2>
    <div class="entry-meta"><time datetime="2026-07-15">July 15, 2026</time></div>
  </article>
  <article class="post type-post">
    <h2 class="entry-title"><a href="https://thefreebieguy.com/sweepstakes/enter-to-win-a-grill/">Enter to Win a Grill Giveaway</a></h2>
    <div class="entry-meta"><time datetime="2026-07-14">July 14, 2026</time></div>
  </article>
</main>
`;

export const FG_POST_HTML = `
<article class="post">
  <h1 class="entry-title">Win a Year of Coffee Sweepstakes</h1>
  <div class="entry-content">
    <p>Roasted Daily is giving away a year of coffee. Enter once per day through August.</p>
    <p><a class="btn" href="https://roasteddaily.example.com/year-of-coffee" rel="nofollow sponsored">Enter the Sweepstakes Here</a></p>
    <p><a href="https://roasteddaily.example.com/year-of-coffee/rules">Official Rules</a></p>
  </div>
</article>
`;

/** A sweepstakes post that has been closed out by the blogger. */
export const FG_POST_CLOSED_HTML = `
<article class="post">
  <h1 class="entry-title">Enter to Win a Grill Giveaway</h1>
  <div class="entry-content">
    <p><strong>This giveaway has ended.</strong> Congratulations to our winner!</p>
  </div>
</article>
`;

// ---------------------------------------------------------------------------
// Shared: transport-level and official-page scenarios
// ---------------------------------------------------------------------------

/** Anti-bot interstitial served with 403 — classified `bot_challenge`. */
export const BOT_CHALLENGE_HTML = `
<!DOCTYPE html><html><head><title>Just a moment...</title></head>
<body><div class="cf-browser-verification">Checking your browser before accessing the site.</div></body></html>
`;

/** Structurally valid HTML that simply is not a sweepstakes page. */
export const INVALID_PAGE_HTML = `
<!DOCTYPE html><html><body><h1>404 — Page Not Found</h1><p>The page you requested no longer exists.</p></body></html>
`;

/** An official page whose sweepstakes closed — end date already past. */
export const OFFICIAL_EXPIRED_HTML = `
<!DOCTYPE html><html><body>
  <h1>Spring Cash Giveaway</h1>
  <p>Sponsored by Northwind Appliances.</p>
  <p>This sweepstakes ended on March 31, 2026. No purchase necessary.</p>
  <a href="https://northwind-appliances.example.com/spring-cash/rules">Official Rules</a>
</body></html>
`;

/** An official page stating multi-entry rules and full eligibility. */
export const OFFICIAL_MULTI_ENTRY_HTML = `
<!DOCTYPE html><html><body>
  <h1>Daily Cash Blast Giveaway</h1>
  <p>Sponsored by Northwind Appliances. No purchase necessary to enter or win.</p>
  <p>Enter once per day. Limit one entry per person per day; maximum one prize per household.</p>
  <p>Open to legal residents of the 50 United States and D.C. who are 18 years of age or older.</p>
  <p>Sweepstakes ends July 31, 2026. Approximate retail value: $50.00.</p>
  <a href="https://northwind-appliances.example.com/cash-blast/enter">Enter</a>
  <a href="https://northwind-appliances.example.com/cash-blast/official-rules">Official Rules</a>
</body></html>
`;
