# Inbox AI

**Read your email like Gmail. Ask it like ChatGPT.**

Inbox AI connects to your Gmail account, mirrors your inbox so it feels familiar,
and lets you ask questions about your email in plain English — getting back real
answers with links to the exact messages they came from.

No more digging through search operators or scrolling for that one email from
three months ago. Just ask.

---

## What you can do

### 📥 Browse your inbox
Your mail, laid out like Gmail. Threads are split into **Primary** and **Other**
so the important stuff isn't buried under newsletters and receipts. Unread counts,
full thread view, and the latest message always on top.

### 💬 Ask anything
Open **Ask AI** and type a question the way you'd ask a person:

> *"What did the contractor quote me for the kitchen?"*
> *"When is my flight to Lisbon and what's the confirmation number?"*
> *"Summarize everything from my landlord this year."*
> *"Did I ever reply to Sarah about the contract?"*

Inbox AI searches your entire mail history, writes a direct answer, and **cites
the messages it used** — click any citation to jump straight to the original
email.

### 📝 Instant thread summaries
Long back-and-forth thread? Open it and get an AI summary of what happened and
where it landed, without reading all 40 replies.

---

## Getting started

1. **Open the app** and click **Sign in with Google**.
2. **Grant read-only access** to Gmail. Inbox AI can *read* your mail to answer
   questions — it can't send, delete, or change anything.
3. **Wait for the first sync.** On your first sign-in, Inbox AI imports your mail
   so it can search it. You'll see a progress screen — this is a one-time setup
   and takes a few minutes depending on inbox size. After that, new mail syncs
   automatically.
4. **Start asking.** Once sync finishes you land in your inbox. Hit **Ask AI**
   and go.

---

## Tips for better answers

- **Be specific about *who* or *what*.** "What's the dentist's address?" beats
  "where's that appointment."
- **Ask for the detail you actually want** — a date, an amount, a confirmation
  number, a yes/no. Inbox AI pulls the specific fact, not just the email.
- **Use it to catch up.** "Summarize everything from my accountant in the last
  month" is a great way to get back up to speed.
- **Trust but verify.** Every answer cites its sources — click through to confirm
  anything important.

---

## Your privacy

- **Read-only.** Inbox AI requests read-only Gmail access. It cannot send,
  delete, or modify your email.
- **Your data is yours.** Your email is only ever used to answer *your* questions.
  It is never shared, sold, or used to train models.
- **Encrypted access.** Your Google sign-in credentials are encrypted before
  they're stored.
- **Isolated.** You can only ever see your own mail — accounts are strictly
  separated at the database level.
- **Email content is never logged.**

---

## FAQ

**Does it send or delete email?**
No. Access is read-only by design.

**Why did the first sign-in take a while?**
The first sync imports your mail history so questions can search across
everything. It only happens once; after that, updates are incremental.

**How fresh are the answers?**
New mail syncs automatically after the initial import, so answers reflect your
recent inbox.

**It said I'm not an authorized test user — what gives?**
The app may be running in Google's "Testing" mode, which limits access to a list
of approved accounts. Ask whoever runs your instance to add your Google address.

**Can I use a non-Gmail account?**
Not yet — Gmail only for now.

---

## Running your own instance

Inbox AI is a Next.js app you can self-host. For full setup — Supabase, Google
OAuth, Inngest, API keys, and Vercel deployment — see
**[docs/SELF_HOSTING.md](docs/SELF_HOSTING.md)**.

**Tech stack:** Next.js 14 (App Router) · TypeScript · Tailwind + shadcn/ui ·
Supabase Postgres + pgvector · Auth.js (Google OAuth) · Anthropic Claude ·
OpenAI embeddings · Inngest · Vercel.
