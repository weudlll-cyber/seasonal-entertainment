# Privacy

**Fill in before going live.**

## Who is responsible

[TO BE FILLED BY OWNER: name, postal address and contact email of the person responsible for
this website]

## What this site stores, and for how long

This list describes what the website's software actually stores.

- **Your account** (if you register): username, email address, a one-way hash of a key your
  browser derives from your password (your password itself never reaches this site's server),
  the random value ("salt") your browser needs for that derivation, your role, whether you may start games, whether the
  account is locked, and when it was created. An account made with Discord has no email address
  here, and no password until you set one. Kept until the account is deleted (see "Deleting
  your account" below). The
  confirmation that you are at least 14 is required to register but is not stored, and no date
  of birth is asked for.
- **Your profile** (members, if you fill it in): an optional "About me" of at most 300
  characters and an optional profile picture (stored like chat images: re-encoded, without
  metadata such as location). Your profile page shows your username, Admin or Organiser if you
  are one, your Discord steps, the date your account was created ("Member since"), your About me
  and your picture, **only to signed-in members**: never to guests, never to search engines. A
  locked account's profile is not shown. You change or remove both on your account page; admins
  can clear them (each clear goes into the admin log, without the text). Deleted with your
  account.
- **Discord login** (if you log in with Discord or link your account to it): your Discord user
  id and Discord username, and the ids of your roles on the Seasonal Tokens Discord server, read
  with your consent when you log in and once a day. From them the site shows your steps (Holder,
  Farmer, Investor) next to your name, to everyone who sees your messages, and opens rooms for
  those steps to you. To read them again each day without asking you, the site keeps the
  "refresh token" Discord gives it, encrypted. It also stores when your roles were last read,
  when they are read next, and whether Discord still accepts the link. It does not read or store
  your email address at Discord, your other Discord servers, your nickname or your avatar.
  - While you sign up with Discord, the confirmation from Discord is held in your session for at
    most 15 minutes, until you choose your username.
  - Kept until you unlink Discord on your account page (you need a password for that) or delete
    your account. Both delete it at once and also cancel the site's access at Discord. You can
    also remove the site's access in Discord itself; the site then stops reading your roles and
    hides your steps.
- **Your login session**: a cookie holding a random session number, and on the server the
  matching session record (which account it belongs to). It ends when you log out, when your
  password changes, when the account is deleted, or after 7 days without use.
- **Two-factor authentication** (if you turn it on): the secret your authenticator app uses,
  and your recovery codes as one-way hashes. Deleted when you turn two-factor authentication
  off, or with your account.
- **Admin and moderation log**: when an admin or moderator changes an account, a page, an
  event, a game entry, a chat room, or moderates a chat message, the site records who did it,
  when, and what changed. When an admin deletes an account, the log keeps who deleted it, when,
  and the deleted account's username. This log is kept without automatic deletion, also when
  an account named in it is deleted.
- **Chat messages**: the text, the room, the author's name (account name or guest name) and
  the time. Deleted automatically after 90 days (the configured retention period), and at once
  when the author's account is deleted.
- **Guest names in the chat**: a guest who writes or reports a message gets a random name such
  as "Guest-k7m2qa", kept with that guest's session. The name is released 30 days after it was
  last used.
- **Private messages between members**: end-to-end encrypted in the senders' and recipients'
  browsers. This site stores only the encrypted message, who sent it to whom, which keys were
  used, and when, and cannot read the content; moderators and admins cannot read it either. It
  also stores how far each of you has read a conversation (for the unread mark). Deleted after the
  chat retention period (90 days), like room messages. When either of you deletes their account,
  the whole conversation is deleted at once, for both of you.
- **Link previews in private messages**: when you write a link in a private message, your
  browser asks this site for a preview card (title, description, a small picture) of that link.
  The site fetches the linked page for you but keeps neither the card nor the link, does not log
  it, and does not record that you asked; it only counts how many previews your account asked
  for, against abuse. The card is sent end-to-end encrypted with your message, so the recipient's
  browser never contacts the linked site. You can remove a card before sending, or turn link
  previews in private messages off on your account page.
- **Reports of a private message**: the reason, who reported whom, and when. Only if you tick
  "Share the selected messages with the moderators" are copies of the messages you selected sent
  along — as your browser shows them — so the moderators can judge the report. Every time a
  moderator looks at such copies, this is recorded in the moderation log. The copies are deleted
  90 days after the report was dealt with. The report and its copies are deleted at once when
  the account of the reporter or of the reported member is deleted.
- **Chat reports**: when someone reports a message, the site stores which account or guest name
  reported it, so each person counts once. No IP address is stored. Deleted with the
  reporter's account, or with the reported message.
- **Chat mutes and bans**: who was muted or banned, by whom, and until when. Deleted with the
  muted or banned account.
- **Your key for private messages** (members): your public key, and your private key only in
  locked form — locked with a key your browser derives from your password, and, if you chose to
  create one, also with your recovery code. This site cannot unlock either; your recovery code
  itself is never sent here. Your browser keeps an unlocked copy, itself encrypted, until you
  log out, or until you delete your account in it. Deleted with your account.
- **Mentions in the chat**: when a room message mentions a member as "@name", the site stores
  that this message mentions that member, so it can show it to them. Deleted with the message
  (after the chat retention period), or with the mentioned member's account.
- **What you have read in the chat** (members only): for each room and each private
  conversation, up to which message you have read, so the site can count what is new for you,
  and which rooms you muted. Deleted with your account.
- **Favourites in the chat** (members only): the rooms and other members you marked as
  favourites. Only you see them; they are deleted with your account. A member you marked does
  not learn about it. Next to your favourite members (and in your private conversations and when
  searching for a member) the chat shows whether they are online right now (have the chat open);
  this is not stored. You can switch off "Show when I'm online" on your account page: then nobody
  sees you as online. The site stores this choice with your account.
- **Stickers and GIFs in the chat** come from this site's own library, managed by its admins. No
  outside GIF or sticker service is contacted.
- **Files in private messages**: end-to-end encrypted. Your browser encrypts a file before it
  is uploaded; this site stores only the encrypted file and cannot see its content, name or
  type. Only you and the other member can download it, and only your browsers can open it. It
  is deleted together with its message, and so at once when either of you deletes their
  account. If you report a message and choose to share it, your
  browser also shares that message's file, decrypted, with the moderators, as it does the text.
- **Files in the chat**: members (not guests) can send images (JPG, PNG, WebP, GIF) and PDF
  files. Images are stored without their hidden metadata, such as camera details and GPS
  location. A file is deleted together with its message, after the chat retention period
  (90 days), or at once with the account that sent it (the file on the server's disk too).
- **Link previews in the chat**: when a member posts an https link, this site's server fetches
  that page once and stores its title, description, site name and a scaled-down copy of its
  image, which are shown with the message. Your browser loads nothing from the linked site for
  this; it only goes there if you click the link.
- **Community calls**: a call is **not recorded** unless an organiser starts a recording (see
  "Call recordings" below). While you are in a call, the site's own call server (run by this site, not by
  another company) passes the sound, camera pictures and shared screens of the speakers on to
  the other participants as they happen, and processes the IP addresses of everyone connected
  to do so; nothing of it is stored afterwards. The site stores who joined which call (as a
  random participant number linked to your account or guest name), whether you raised your
  hand and whether you were on the stage, and keeps the call's chat like any other chat room.
  If you hide your online status, other listeners see you as "A listener". Which calls you
  joined, and the call reminders you asked for, are deleted with your account.
- **Call recordings** (_Proposal — to be reviewed by the site owner_): organisers and admins
  can record a call (sound, camera pictures and shared screens of the speakers, as the call
  shows them). You always know: while a recording runs, the call shows a red "Recording"; when
  it starts, everyone in the call is told; and nobody joins a recorded call, or turns on their
  microphone or camera in it, without first confirming
  "I understand this call is being recorded". Recordings are stored on this site's server and
  shown on the call's page to everyone who can see the call. They are included in the site's
  backups.
  - **Legal basis**: your consent (GDPR Art. 6(1)(a)), which you give by confirming
    "I understand this call is being recorded". You can join a recorded call only after that
    confirmation, and you can leave the call at any time.
  - **How long**: a recording is kept until an organiser or admin deletes it. There is no
    automatic deletion, and deleting your account does not delete recordings you are in (see
    the next point).
  - **Deletion and your other rights**: if you are in a recording, you can ask for the
    recording, or your part of it, to be deleted, and for a copy of it, by writing to the
    contact address in the Imprint ([TO BE FILLED BY OWNER: contact email for these requests]).
    You can also lodge a complaint with a data protection authority; in Austria that is the
    Datenschutzbehörde.
- **Notifications when a call starts** (members, only on a device where you turn "When a call
  starts" on, on your account page): for each such device, the address your browser's push
  service gave it, two keys with which the site encrypts the message for that device, which of
  the site's own keys it was made for, and when you turned it on. Used only to send the call's
  title with "has started" when a call goes live. The message goes encrypted through the push service
  of your browser's maker (for example Google for Chrome, Mozilla for Firefox, Apple for Safari,
  Microsoft for Edge), which delivers it to your device and cannot read it; the site sends that
  service nothing else about you. Removed when you turn the switch off on that device, when the
  push service says the address is no longer valid, when the site's own keys change, when your
  account is locked, and with your account. Your browser keeps its side of it until you turn
  the switch off or take back the site's permission for notifications.
- **Protection against abuse**: to limit repeated login attempts and similar, the server keeps
  your IP address in its memory for up to one hour. It is not written to the database.

## Deleting your account

You can delete your account yourself on your account page ("Delete my account"), with your
password and, if two-factor authentication is on, a code from your app; an account without a
password confirms with a fresh Discord login instead. An admin can also
delete an account. The last remaining admin account cannot be deleted. The deletion happens at
once and cannot be undone. It deletes:

- your account itself (username, email address, password hash and salt, settings) and every
  login session of it; open chat connections of the account are closed;
- your Discord link (your Discord id and name, your role ids and the refresh token), and the
  site's access at Discord is cancelled;
- your two-factor secret and recovery codes;
- your keys for private messages;
- every chat message you wrote in any room (call chats included), with the files you sent
  (from the server's disk too), the reports of those messages and the mentions in them;
- every private message you sent or received and every file in them: the whole conversation
  is deleted for the other member too, and so are their read marks for it;
- your favourites, read marks and muted rooms, and the mentions of you;
- the chat reports you made, and the reports of private messages you made or that were made
  about you, with their copies and shared files;
- mutes and bans of your account;
- the logins of your account for the chat on other websites (embed tokens);
- which calls you joined, and your call reminders;
- the devices you turned "When a call starts" on for (their push addresses and keys).

It does not delete:

- the admin and moderation log: its entries stay as they are, with the names in them (for
  example who deleted an account, and the deleted account's username);
- call recordings: a recording shows and sounds as the call did, so if you spoke, showed your
  camera or shared your screen in a recorded call, that stays in the recording until an
  organiser or admin deletes it; ask for it as described under "Call recordings";
- a moderator's or admin's name where the site noted it on an action they took (for example
  who hid a message, removed a file, or muted someone);
- for **30 days**, a note that your account was deleted: its number, your username and when,
  nothing else. It is kept apart from the backups, so that restoring an older backup after a
  failure deletes your account again instead of bringing it back; after 30 days it is deleted;
- the backups (next paragraph).

**Backups**: every night the site makes an encrypted backup of its database and files. What a
deletion removes stays in the backups made before it until those backups are deleted
themselves: on the site's server, backups are deleted after **14 days**; the site owner also
keeps copies on their own computer, which keeps the **newest 30 backups** (about 30 days, with
one backup a night). The backups can be read only with a key that is not on the server, and are
used only to restore the site after a failure.

## What this site does not do

- No tracking, no analytics, no advertising.
- No cookies other than the session cookie described above.
- No content from other websites is loaded: fonts and images, including chat stickers, GIFs
  and link-preview images, come from this site, and calls go through the site's own call
  server. Links to other sites (such as Discord or
  Telegram) are only followed when you click them.

## Your rights

You can delete your account yourself at any time (see "Deleting your account"). You can ask for
a copy of your data, for corrections, and for your account to be deleted:
[TO BE FILLED BY OWNER: how to contact, and the legal basis and rights that apply].
