// Lesson 13: Security essentials
// Format and field reference: CONTRIBUTING.md
window.LESSONS.push({
  id: "security",
  n: 13,
  track: "Craft",
  mins: 20,
  title: "Security essentials",
  tag: "Don't be the reason the security team gets paged.",
  hook: "You don't need to be a security engineer. You need to <mark>not be the reason the security engineer gets paged</mark>. Most real incidents come from a short list of mistakes, and code review is where you catch them.",
  steps: [
    {
      k: "read",
      t: "AuthN vs AuthZ, and IDOR",
      b: "<b>Authentication</b>: who are you? <b>Authorization</b>: what are you allowed to do? Broken access control has topped the OWASP Top 10 lately, and the most common form is <mark>IDOR</mark> (Insecure Direct Object Reference): change the ID in the URL and you see someone else's data.",
      code: `# IDOR: any logged-in user can fetch any invoice
@invoice = Invoice.find(params[:id])

# Scoped: only finds invoices this account owns (404 otherwise)
@invoice = current_account.invoices.find(params[:id])`
    },
    {
      k: "mcq",
      q: "Which line prevents IDOR for a download endpoint?",
      o: [
        "<code>Invoice.find(params[:id])</code>",
        "<code>current_account.invoices.find(params[:id])</code>",
        "<code>Invoice.find_by(id: params[:id].to_i)</code>",
        "Hiding the ID with base64"
      ],
      a: 1,
      why: "Scope the lookup through the authorized owner, or use a policy object (Pundit, Action Policy). Obscured IDs aren't access control."
    },
    {
      k: "read",
      t: "Injection",
      b: "If user input becomes code, it's injection. SQL is the classic case:",
      code: `# Vulnerable: q = "' OR '1'='1" returns everything
User.where("name = '#{params[:q]}'")

# Safe: parameterized
User.where(name: params[:q])
User.where("name ILIKE ?", "%#{User.sanitize_sql_like(params[:q])}%")`,
      note: "Same idea elsewhere: shell commands (pass arrays to system, never interpolated strings), <code>constantize</code> on user input, <code>send(params[:method])</code>."
    },
    {
      k: "read",
      t: "XSS and CSRF",
      b: "<b>XSS</b>: an attacker gets script into your page, which runs as the victim. Rails escapes output by default; the danger zones are <code>html_safe</code>, <code>raw</code>, <code>&lt;%==</code>, unsanitized markdown, and URLs like <code>javascript:</code>. Add a Content Security Policy as a second line of defense.<br><br><b>CSRF</b>: another site makes the victim's browser send a request with their cookies. Rails' authenticity token blocks it, and <code>SameSite=Lax</code> cookies help. Token-authenticated JSON APIs (no cookies) aren't exposed the same way."
    },
    {
      k: "mcq",
      q: "What does Rails' authenticity token protect against?",
      o: ["SQL injection", "Cross-site request forgery", "Brute-force login", "XSS"],
      a: 1,
      why: "The form must include a secret token the attacker's site can't read, so forged cross-site form posts fail."
    },
    {
      k: "read",
      t: "Passwords, secrets, encryption",
      b: "<ul><li>Passwords: <mark>hash with a slow, salted algorithm</mark> (bcrypt via <code>has_secure_password</code>, or argon2). Never encrypt them, and never use a fast hash.</li><li>Secrets live in Rails credentials or a secret manager, never in the repo or in logs. Rotate them, and scope them to least privilege.</li><li>In transit: TLS everywhere. At rest: disk encryption plus field-level encryption for sensitive data (Rails <code>encrypts :ssn</code>).</li><li>Filter params in logs (<code>filter_parameters</code>).</li></ul>"
    },
    {
      k: "myth",
      q: "Hashing passwords with SHA-256 is secure enough.",
      a: false,
      why: "SHA-256 is designed to be fast, so GPUs try billions of guesses per second. Password hashing needs to be deliberately slow and salted: bcrypt, scrypt, argon2."
    },
    {
      k: "read",
      t: "Tokens and OAuth in 60 seconds",
      b: "<b>Sessions</b>: a server-side state reference in a cookie, easy to revoke. <b>JWT</b>: signed, self-contained claims, so it's stateless but hard to revoke before expiry. Keep them short-lived.<br><br><b>OAuth 2</b> is for <mark>delegated authorization</mark> ('let this app read my calendar'). <b>OpenID Connect</b> adds identity on top ('log in with Google'). Browser and mobile apps use the authorization code flow with PKCE.<br><br><b>Webhooks</b>: verify an HMAC signature with a timing-safe compare (<code>ActiveSupport::SecurityUtils.secure_compare</code>)."
    },
    {
      k: "mcq",
      q: "OAuth 2.0, by itself, is mainly for…",
      o: [
        "Hashing passwords",
        "Delegated authorization: granting an app scoped access without sharing your password",
        "Encrypting databases",
        "Load balancing"
      ],
      a: 1,
      why: "OAuth answers 'what can this client access?'. For 'who is this user?' you add OpenID Connect, which issues an ID token."
    }
  ],
  interview: {
    q: "You're reviewing a PR that adds an endpoint to download invoices as PDF. What do you look for?",
    rubric: [
      "Authorization scoping on the lookup (IDOR) and tests for cross-account access",
      "Authentication required; consider token/session type",
      "Safe file handling: no user-controlled paths; signed, expiring URLs if served from S3",
      "No sensitive data in logs; correct cache headers (private, no-store)",
      "Rate limiting / abuse (PDF generation is expensive) and async generation",
      "Audit logging for access to financial documents"
    ],
    model: "<p><b>Access first:</b> is the lookup scoped (<code>current_account.invoices.find</code>) or behind a policy? Is there a spec proving another account gets a 404? That test is the one I'd insist on.</p><p><b>Files:</b> no paths built from params. If PDFs live in S3, serve short-lived signed URLs, not public buckets.</p><p><b>Leaks:</b> <code>Cache-Control: private, no-store</code> so shared proxies don't keep copies, and no invoice data in logs or error trackers.</p><p><b>Abuse and cost:</b> PDF generation is CPU-heavy, so rate-limit and generate async with caching. <b>Audit:</b> log who downloaded which financial document.</p>"
  },
  cards: [
    ["AuthN vs AuthZ", "Who are you vs what are you allowed to do."],
    [
      "IDOR fix in Rails",
      "Scope finds through the owner: current_account.invoices.find(id)."
    ],
    ["Safe SQL with user input", "Parameterize: where(name: q) or where('x = ?', q)."],
    [
      "Rails XSS danger zones",
      "html_safe, raw, <%==, unsanitized markdown, javascript: URLs."
    ],
    ["Password storage", "Slow salted hash: bcrypt/argon2. Never fast hashes or encryption."],
    ["OAuth vs OIDC", "OAuth = delegated authorization; OIDC adds identity (ID token)."]
  ],
  cheat: [
    "Scope every lookup through the owner. Test cross-account access.",
    "Parameterize everything that reaches SQL or a shell.",
    "XSS hides in html_safe/raw. CSRF is handled by tokens + SameSite.",
    "bcrypt/argon2 for passwords; secrets out of repo and logs.",
    "Verify webhook HMACs with secure_compare."
  ]
});
