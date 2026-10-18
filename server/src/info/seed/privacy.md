# Privacy

**Draft — needs legal review before publishing.**

## Who is responsible

[TO BE FILLED BY OWNER: name, postal address and contact email of the person responsible for
this website]

## What this site stores, and for how long

This list describes what the website's software actually stores.

- **Your account** (if you register): username, email address, a one-way hash of a key your
  browser derives from your password (your password itself never reaches this site's server),
  the random value ("salt") your browser needs for that derivation, your role, whether you may start games, whether the
  account is locked, and when it was created. Kept as long as the account exists. The
  confirmation that you are at least 14 is required to register but is not stored, and no date
  of birth is asked for.
- **Your login session**: a cookie holding a random session number, and on the server the
  matching session record (which account it belongs to). It ends when you log out, when your
  password changes, or after 30 days.
- **Two-factor authentication** (if you turn it on): the secret your authenticator app uses,
  and your recovery codes as one-way hashes. Deleted when you turn two-factor authentication
  off.
- **Admin and moderation log**: when an admin or moderator changes an account, a page, an
  event, a game entry, a chat room, or moderates a chat message, the site records who did it,
  when, and what changed. This log is kept without automatic deletion.
- **Chat messages**: the text, the room, the author's name (account name or guest name) and
  the time. Deleted automatically after 90 days (the configured retention period).
- **Guest names in the chat**: a guest who writes or reports a message gets a random name such
  as "Guest-k7m2qa", kept with that guest's session. The name is released 30 days after it was
  last used.
- **Private messages between members**: end-to-end encrypted in the senders' and recipients'
  browsers. This site stores only the encrypted message, who sent it to whom, which keys were
  used, and when, and cannot read the content; moderators and admins cannot read it either. It
  also stores how far each of you has read a conversation (for the unread mark). Deleted after the
  chat retention period (90 days), like room messages.
- **Reports of a private message**: the reason, who reported whom, and when. Only if you tick
  "Share the selected messages with the moderators" are copies of the messages you selected sent
  along — as your browser shows them — so the moderators can judge the report. Every time a
  moderator looks at such copies, this is recorded in the moderation log. The copies are deleted
  90 days after the report was dealt with.
- **Chat reports**: when someone reports a message, the site stores which account or guest name
  reported it, so each person counts once. No IP address is stored.
- **Chat mutes and bans**: who was muted or banned, by whom, and until when.
- **Your key for private messages** (members): your public key, and your private key only in
  locked form — locked with a key your browser derives from your password, and, if you chose to
  create one, also with your recovery code. This site cannot unlock either; your recovery code
  itself is never sent here. Your browser keeps an unlocked copy, itself encrypted, until you
  log out. Deleted with your account.
- **What you have read in the chat** (members only): for each room and each private
  conversation, up to which message you have read, so the site can count what is new for you,
  and which rooms you muted. Deleted with your account.
- **Favourites in the chat** (members only): the rooms and other members you marked as
  favourites. Only you see them; they are deleted with your account. A member you marked does
  not learn about it. Next to your favourite members the chat shows whether they are online
  right now (have the chat open); this is not stored.
- **Stickers and GIFs in the chat** come from this site's own library, managed by its admins. No
  outside GIF or sticker service is contacted.
- **Files in the chat**: members (not guests) can send images (JPG, PNG, WebP, GIF) and PDF
  files. Images are stored without their hidden metadata, such as camera details and GPS
  location. A file is deleted together with its message, after the chat retention period
  (90 days).
- **Link previews in the chat**: when a member posts an https link, this site's server fetches
  that page once and stores its title, description, site name and a scaled-down copy of its
  image, which are shown with the message. Your browser loads nothing from the linked site for
  this; it only goes there if you click the link.
- **Protection against abuse**: to limit repeated login attempts and similar, the server keeps
  your IP address in its memory for up to one hour. It is not written to the database.

## What this site does not do

- No tracking, no analytics, no advertising.
- No cookies other than the session cookie described above.
- No content from other websites is loaded: fonts and images, including chat stickers, GIFs
  and link-preview images, come from this site. Links to other sites (such as Discord or
  Telegram) are only followed when you click them.

## Your rights

You can ask for a copy of your data, for corrections, and for your account to be deleted:
[TO BE FILLED BY OWNER: how to contact, and the legal basis and rights that apply].
