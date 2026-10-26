# Relay attack adapter

`relay/test/attacks.mjs` loads the module in `RELAY_TARGET` and calls `createTarget(limits)`. The object it returns is both the relay and the program, in process, with no network. A real adapter maps each method onto `relay/` (the Worker), `shell/relay/blob.cjs` (seal, open, sign, counter, padding, path) and `shell/relay/channel.cjs` (accept or drop, echo, the mirror). The reference targets are `relay/test/targets/naive.cjs`, `relay/test/targets/model.cjs` and `relay/test/targets/refuse-all.cjs`. `relay/test/wire.cjs` is the byte helper they share. An adapter may ignore it and call `blob.cjs`, as long as the methods below accept and refuse the same way.

`createTarget(limits)` is synchronous. `limits` may be omitted. The only field read is `teamMax`, which replaces the 1 GB team cap for that instance. Blob size, rate, token tries and deletion keep stay the real constants. Keys below are Ed25519. `keyId` and `publicKey` are the raw 32 byte public key as 64 hex characters. `privateKey` is PKCS8 DER as hex. A team key is 32 raw bytes. The target's clock starts at 0. `advance(ms)` moves it. Nothing here contacts a host.

A refusal is `{ ok: false, reason, said, served: false }` with no `ids` and no `ciphertext`. `said` is one short sentence, with no exclamation mark and no dash. An acceptance is `{ ok: true }` plus the fields named on that method.

Trust for a team file, a head and a roster is the pinned lead key and the signature, never a key the message names. `pin({ leadKeyId, relayTeamId, teamId })` sets that anchor. The relay is not given the team key. `seal`, `acceptBlob` and `acceptDeskFile` are, because the desk holds it.

The harness strips `path`, `body` and `plainLength` before `upload`, `acceptBlob` and `acceptDeskFile`. An attack that must put a path back does so itself. The contract has no caller-supplied public key, no caller-chosen nonce, no declared size, no `charge()`, and no `withheld`, `fromDownload` or `onMissing` flag.

## Relay

- `start()` marks the relay up. `createTarget` calls it.
- `createTeam({ teamId, epoch, lead })` returns `{ relayTeamId, teamId }`. `lead` is `{ keyId, publicKey, privateKey }`. The lead is enrolled for place `root`. `relayTeamId` is 16 random bytes, hex. There is no team key argument.
- `addEpoch({ relayTeamId, epoch })` records the next epoch. There is no team key argument.
- `enrol({ relayTeamId, deskId, keyId })` enrols that device for place `desk:<deskId>`.
- `removeDesk({ relayTeamId, deskId })` withdraws that device. Later reads and uploads by it are refused with `removed`.
- `invite({ relayTeamId, wrap, until, invitationId })` returns `{ token, invitationId }`. `token` is 32 random bytes, hex. The relay stores only the sha256 of the token's UTF-8 text. `wrap` and `until` may be omitted; a slice 1 invitation carries neither. `invitationId`, when the caller passes it, is the lead's 32 hex id, because the wrap's associated data names it before the call; when it is omitted the target mints one. `until` is the invitation's end, a safe integer on the relay's clock. While `until` is absent the invitation does not lapse. A token hello at a time after `until`, the invitation not yet spent, is `invite-ended`, spends nothing and deletes the wrap. A bound key's later fetch of a wrap first served at or before `until` is still served until the upload.
- `reseal({ relayTeamId, wraps, drop })` is the lead's signed invites call that replaces wraps and drops ids. `wraps` is `[{ id, wrap }]`. An id in `drop` is not given a wrap by the same call. The acceptance is `{ ok: true, dropped, used }`. The harness may pass `signed: false`, a `signer` that is not the lead, or `cover: "bare"` (the signature covers `add` and `drop` only, while the body still carries `wraps`). Each of those is `bad-signature` and leaves the stored wrap as it was.
- `drop({ relayTeamId, ids })` is that call with only the drops. It returns `{ ok: true, dropped, used }`. `used` names each dropped id that had been spent, and no unused id.
- `fetchWrap({ relayTeamId, session })` returns `{ ok: true, served: true, wrap }` or a refusal with `wrap` absent and `ciphertext` absent. The wrap is served only on a session whose hello bound that invitation's key, as often as that session asks, until the invitation's one upload, and then it is gone. A lead's session, an enrolled desk's session and any other session are refused. The wrap is not a blob: `list` does not name it and `fetch` does not return it.
- `inviteStates({ relayTeamId, session })` is answered only to the lead's session. `{ ok: true, served: true, states }` and each state is `{ id, state, usedAt }`. `state` is `unused` before the bound hello, `used` after it and `asked` after the one upload. `usedAt` is the relay's clock at that hello, null while unused, and the same number after the upload.
- `challenge({ relayTeamId })` returns `{ nonce }`. The relay mints 16 random bytes, hex, and records when it was issued. A nonce the caller passes is not a challenge.
- `hello({ relayTeamId, nonce, keyId, signature, token, invitationId })` returns `{ ok: true, session }` or a refusal. A device hello carries `signature` and is verified under the public key enrolled for `keyId` on that team. A key that was enrolled and then removed is verified under that same key before the relay answers `removed`. An unsigned or forged signature on that hello is `bad-signature`, the same refusal as any other bad signature, and the answer does not say that the key was removed. A genuine signature on a removed key is `removed`. A token hello carries `token` and `invitationId`, and may also carry the joining desk's `key`, its public half `pub`, and `sig`, that key's signature over `helloMessage(relayTeamId, nonce, key)`. Where `key` is the id of `pub` and `sig` verifies under it, the relay binds that key to the invitation as it spends the token: inside the invitation's 30-day keep, that key's own hello, the key on no list, verified under the bound `pub`, opens the invitation's session again and lets go of the one before it: before the invitation's one upload, for that upload, and after it, for the lead's answer alone, until the key is enrolled, the invitation is dropped or the keep ends. Only that key may make the upload. The token stays spent. A token hello without a valid `key`, `pub` and `sig` is refused with `bad-signature` and spends nothing: the token stays unspent and the failure is not one of the 20 tries. A wrong token is a try whether or not the hello binds a key. The relay answers an invitation's session, opened by its bound token hello or by the bound key, `{ session, until, invite: true }`, and a device's session with no `invite`. A key a device hello names is not the verifying key. Both consume the nonce only on success.
- `helloMessage(relayTeamId, nonce, keyId)` is the buffer a device signs. It contains the team, the nonce and the key id.
- `list({ relayTeamId, session })` returns `{ ok: true, served: true, ids }` or a refusal with `ids` absent. `ids` are the live blobs of that team.
- `fetch({ relayTeamId, session, id })` returns `{ ok: true, served: true, id, ciphertext, nonce, signature, epoch, supersedes, writerKeyId, counter }` or a refusal with `ciphertext` absent. `ciphertext` is the stored blob. The other fields are the signed envelope a channel needs to open it. `supersedes` is the stored id, or null. `counter` is the stored integer.
- `subscribe({ relayTeamId, session })` returns `{ ok: true, served: true, events }`. After another device uploads, `events` gains `{ seq, id, size }` and nothing else.
- `upload({ relayTeamId, blob })` returns `{ ok: true, seq, id }`. There is no `size` argument. The relay accounts `blob.ciphertext.length`.
- After the invitation's one upload, the bound key fetches exactly one thing, the lead's answer to its own request, at the place `answer:<relay invitation id>`, sealed to that key, until the key is enrolled or the invitation is dropped. The blob's id is that invitation id. The relay stores the ciphertext and does not open it. That session's `list` and `subscribe` are refused `not-enrolled` and serve nothing. Its `fetch` of the answer's id, the invitation id, serves the answer once the lead has written it, and is `missing` before. Its `fetch` of any other id is refused with no ciphertext, so a catalog at 25 minutes and a catalog at 31 minutes are never served to it. The lead's session and any other device's session are not served the answer: `list` omits it and `fetch` is `missing`. A second upload is `token-spent`. After a drop, reads on the bound session are refused. Enrolling the bound key ends its invitation sessions with no drop: a call on one is refused `no-hello`, and that key's own hello opens a device session. After enrolment, the device session lists the team's catalogs.
- `fetchDeletion({ relayTeamId, id })` serves a deletion record while it is inside its keep, then refuses with `expired`.
- `epochMove({ relayTeamId })` returns `{ resealed: false }` and leaves every stored ciphertext as it was.
- `inspect({ relayTeamId, id })` returns the stored record, or null. The record has no path and no body.

## Program

- `seal(opts)` returns a blob. `opts` is `{ relayTeamId, epoch, teamKey, writer, path, body, counter, place, kind, id, supersedes }`. `writer` is a key pair. `kind` is `file` or `delete`. `place` is `root` or `desk:<deskId>`. The ciphertext is the padded frame plus the 16 byte tag. Two small bodies both come out 4112 bytes.
- `acceptBlob({ teamKey, teamDoc, blob })` opens the blob under the team file. The team file must verify under the pinned lead key. Its `id` must be the pinned team id, and `channel.relay` must be the pinned relay team id, or the reason is `wrong-team`. A `rev` below the floor `loadTeamFile` holds for that team id, lead key and epoch is `replay-rev`; the rev at the floor is still accepted. A blob whose `epoch` is not the team file's `epoch` is `epoch`, and it is not opened under the key of another epoch. The writer must be on that signed roster. A key that an earlier signed roster of this epoch listed, or that an earlier epoch's roster listed, and that the current roster leaves out, is `removed`. A key absent from the newest loaded epoch's roster is `removed` at every older epoch, including a new file sealed at the old epoch under the old team file. A key that was never on a signed roster is `not-roster`. The relay's enrolment is not consulted. On success `{ ok: true, path, keyId, deskId, rev, epoch }` and the mirror holds the inner body. A desk file is filed at its folded path, so `Desks/<id>/x` and `./desks/<id>/x` are both `desks/<id>/x`. Any other file stays at its inner path. `keyId` is the writer the signature verified. `deskId` is the roster row for that key when the writer is a desk, and null for the lead. `rev` and `epoch` are the team file's. A path stuck onto the blob is ignored. A `place` of `desk:<other>` does not move the file and does not change `deskId`. A deletion returns `{ ok: true, deleted: true, path }` and the mirror drops that path only when the writer's counter is newer than the floor and the path is that writer's place.
- `acceptDeskFile({ teamKey, teamDoc, blob })` is the program receiving one desk file: `in-use.ec`, `catalog-answer.ec`, `stats.estat`, or any other `*.ec` in that desk's place (a desk edit; `notes.ec` stays with `acceptBlob`). The arguments and the refusal are the same as `acceptBlob`, including the `rev` floor `loadTeamFile` holds (`replay-rev` below it). On success the same fields, and the mirror holds the inner body. The writer counter is the same one `acceptBlob` reads and raises. A replay at an equal or lower counter is `replay-counter`. The lead's key, or another desk's key, on that path is `outside-place`. A path outside those four kinds is refused and is not written, except the desk's own `notes.ec`, which may be refused or accepted under the same rules as `acceptBlob`. A foreign `notes.ec` is refused and nothing is written. A desk an earlier roster of this team file's epoch listed, and that this team file leaves out, is `removed`, and so is a desk the newest loaded epoch has dropped, at every older epoch. The body that was accepted first stays. A product target's `acceptDeskFile` calls that product's own receipt (`shell/relay/channel.cjs`), never `model.cjs`.
- `loadTeamFile(doc)` accepts a team file signed by the pinned lead, or refuses. A file whose `id` is not the pinned team id, or whose `channel.relay` is not the pinned relay team id, is `wrong-team`. A lower or equal `rev` at the same epoch is `replay-rev`. Another epoch may start at `rev` 1.
- `showFreshness({ head, now })` returns `{ shown, blocked, time, epoch, rev, ageMs }`. While nothing is pinned, every head comes back with `shown` false and `blocked` false. Once pinned, the head must verify, and its key and relay must be the pin. `time` is the head's signed time. `ageMs` is `now` minus that time. A head the desk holds is shown and `blocked` is false. The rev shown is the head's rev, including when the desk has loaded an older team file and a newer one was never delivered.
- `syncMirror({ relayTeamId, session, teamKey, teamDoc, box, deskId })` leaves a mirror file the relay omitted where it is. It asks `fetch` under this session for each listed blob this program does not yet hold, opens that returned envelope under `teamKey` and `teamDoc`, and writes the inner body into the mirror. It does not read the relay's stored map. A blob the lead uploaded after the accept is brought in that way. Where `box` and `deskId` are given, the program is that desk, and it also opens its own copy of a newer team file, as An epoch move says.
- `sealTeam({ relayTeamId, teamId, epoch, teamKey, writer, leadBox, teamDoc, files })` returns `{ ok: true, blobs }`: what the lead owes for that team file, sealed and signed by `writer`, the lead. The team file is `etiuda-team.json` at the root, and each of `files` (path to body) at the root, all under `teamKey` at `epoch`; then one copy of the team file for each desk its roster names, as An epoch move says, and for no other desk. The harness uploads each blob.
- `considerOutgoing({ path })` returns `{ send: false, reason, said }` for a `.tmp`. A path this program has accepted is an echo, reason `echo`, while the clock is less than 60 minutes (`ECHO_MS`, 60 * 60 * 1000) past that accept. The echo ends at that mark: `considerOutgoing` of the same path then returns `{ send: true }`, which is the later local change of a received file. Any other path returns `{ send: true }`. The download is one this program accepted, not a flag.
- `readRing({ teamDoc, looseRing })` returns `{ source, ring }`. In relay mode `source` is `team` when the team file is signed by the pinned lead and carries a ring, otherwise `none`. It is never `loose`.
- `verifyUploadSignature({ publicKey, payload, signature })` and `verifyDeskSignature({ publicKey, body, signature })` return `{ ok }`. Each accepts a genuine signature of its own prefix and rejects the other prefix and another key.
- `programAllowUpload({ blob, deviceId })` applies the blob, team and rate limits to `blob.ciphertext.length` before an upload.
- `restart()` drops sessions, challenges and subscribers. The program counter floor, the desk-file floor, the relay counter floor, the desk-place floor and the `rev` floor stay. A replay after restart is refused, and the next counter or `rev` is kept.
- `openWrap({ secret, relayTeamId, teamId, invitationId, wrap, teamDoc })` opens one invitation wrap. The wrap key is 32 bytes of HKDF-SHA256 of the secret's 16 bytes, with an empty salt and info `etiuda-invite-wrap`. The associated data is UTF-8 `etiuda-invite-wrap\n<relay team id>\n<team id>\n<invitation id>\n<epoch>\n`, and `epoch` is the wrap's epoch. `wrap.ct` is hex of the 12 byte nonce, then AES-256-GCM of the JSON `{"epoch","key"}` with `key` 64 hex, then the 16 byte tag. The wrap the relay stored is `{ epoch, ct }` only. On success `{ ok: true, epoch, key }` and `key` is the 32 byte team key. A wrap whose `epoch` is not `teamDoc.epoch` is `epoch` and is not opened. A wrap that does not open under those bytes, including one moved to another invitation id, team, relay team or epoch, is `bad-signature`. The relay never opens a wrap.
- `readMirror(path)` returns the body, or null.
- `advance(ms)` moves the clock and returns it.

## Blob

`id` is 16 random bytes, hex, new for every seal, and it is not a hash of the path. `supersedes` is an earlier id, or null. `writerKeyId` is the writer's `keyId`. `counter` is an integer from 1. `deletion` is true when the plaintext kind is `delete`. `nonce` is 12 bytes, hex. `ciphertext` is a Buffer. `signature` is 64 bytes, hex.

The record `inspect` returns has `relayTeamId`, `id`, `supersedes`, `size`, `seq`, `writerKeyId`, `ciphertext`, `nonce`, `deletion`, `epoch` and `superseded`. It does not carry the path or the body. `size` for a small blob is 4112.

## Bytes

Associated data is UTF-8, one field a line, with a trailing newline:

```
etiuda-relay-blob
<relay team id>
<epoch>
<blob id>
<supersedes, or ->
<writer key id>
<counter>
```

The path is not a line. It is inside the plaintext. A blob moved to another id, team, epoch or counter does not open.

The plaintext frame is a big-endian u32 length, then the JSON `{"kind","path","body"}`, then zeros so that 4 plus the JSON length reaches the next size step. The steps are 4096, then powers of two. AES-256-GCM uses a fresh 12 byte nonce and appends the 16 byte tag. The size the relay shows is that ciphertext's length. For a small blob that is 4112.

The upload signature is Ed25519 over the bytes `etiuda-relay-upload\n`, then the associated data, then the ciphertext.

A desk-file signature is Ed25519 over `etiuda-desk-branch\n`, then the body. That prefix is the engine's `BRANCH_PREFIX`. Neither signature verifies as the other.

A device hello is Ed25519 over the UTF-8 `etiuda-relay-hello\n<relay team id>\n<nonce>\n<key id>\n`. The nonce is one `challenge` issued for that team. It verifies once, under the enrolled key, and only while `now - issued` is at most 300000 ms. One millisecond later the reason is `nonce-stale`. A second use of a nonce that already succeeded is `hello-replay`. A removed key is verified under that key before the answer is `removed`. A signature that does not hold is `bad-signature`.

A team file is signed the way the engine signs a document: canonical JSON with the keys sorted, `sig.value` left out of the signed bytes, Ed25519. The verifier uses the pinned lead key, not `lead.keyId` from the file. A head is `{ kind: "etiuda-head", relay, epoch, rev, time, keyId, sig }` and the signed bytes are `etiuda-relay-head\n` plus that same canonical form. Shown heads are those whose key and relay are the pin.

## An epoch move

M1 needs a box and an agreement per desk. A box is an X25519 pair: `public` is the raw 32 byte key as 64 hex characters, `private` is PKCS8 DER as hex. An agreement is X25519 of one box's private half and another's public half, 32 bytes. The team file names the lead's box as `lead.box`. Its roster entry for a desk takes the engine's form, `{ desk: { id, key, box }, wrap }`: `id` is `k-` and the first 16 hex characters of the sha256 of the desk key's 32 bytes, `key` its key id, `box` its box's public half.

A desk's copy of the team file is sealed under a key only the lead and that desk can make. HKDF-SHA256 of their agreement, with an empty salt, over the info below, one field a line with a trailing newline, gives 48 bytes: the first 32 are the key, the last 16 as hex the copy's id. The copy sits at place `invite:<id>`, which the relay takes from the lead. An all-zero agreement makes no copy.

```
etiuda-relay-desk-copy
<relay team id>
<team id>
<lead key id>
<lead box>
<desk id>
<desk box>
```

A wrap is `{ epoch, enc, ct }`: `enc` the public half of a fresh box, and `ct` as hex the 12 byte nonce, then AES-256-GCM of the team key, then the 16 byte tag, under the 32 bytes HKDF-SHA256 gives from the agreement of that fresh box and the desk's box, with an empty salt, over the UTF-8 `etiuda-relay-wrap\n<team id>\n<epoch>\n<desk id>\n`.

A desk holding only the old key and team file reaches the new ones with no step: `syncMirror` with its `box` and `deskId` opens its own copy, signed by the pinned lead, under the agreement of its box and the `lead.box` of the team file it holds; takes the team file from it where it is newer, and the key from its own wrap; and opens what the lead sent under that key. The desk taken off the roster has no copy of any later team file, and nothing after the move is sealed under the old key, so everything it is served opens under neither the old key nor any copy key it can make: its own agreement with the lead's box, or with any desk's, bound to any desk of the roster it held.

## Who may write

The relay sees `place` in the clear and refuses a writer whose enrolment does not match it. `root` is the lead's. `desk:<deskId>` is only the device enrolled for that desk, but for an invitation's one upload, which is made at `desk:<deskId>` of a desk not yet held, by the key that invitation bound: the lead's key and another desk's key are `outside-place`, at the relay and at the program. The lead may also write at `invite:` and 32 hex characters, a desk's copy, and a desk may not. The lead may also write at `answer:` and 32 hex characters, the answer to that invitation, and only a blob whose own id is those 32 characters; a desk may not, an enrolled desk's upload at `answer:<invitation id>` is `outside-place`, and so is the lead's blob at that place with any other id, and the bound session is served neither blob. Any other place is `outside-place`. A place the product relay's header cannot carry is `bad-signature` before that check. The attack signs such a place with the writer's key through the wire helper, so the target's own seal is not what answers. A desk upload whose `supersedes` names another writer's blob, including the lead's, is `outside-place`, and that blob is still served. The path stays inside the ciphertext. The program ignores a key that is only on the relay's list, and it ignores a `place` that names a different folder from the path inside the ciphertext. It trusts a writer only from a team file signed by the pinned lead: the lead for a path that does not start with `desks/`, and a rostered desk only for `desks/<that desk id>/`. Before that comparison the path is folded to lower case and `.` segments are dropped, so `Desks/<id>/...` and `./desks/<id>/...` are that desk's place and not the lead's. A roster with an extra desk and the old signature does not enrol that desk. A path that merely begins with the desk id, without the slash that closes the id, is outside that desk's place. `catalog-answer.ec`, `stats.estat` and a desk edit `*.ec` are judged as that desk's place even when the general place check is lifted. `in-use.ec`, `join.json` and `notes.ec` stay on the general check.

These paths are dropped with `bad-path`: a segment `..`, a drive (`C:` and the like), a colon anywhere else (a stream), a leading `/` or `\`, or any backslash.

## Counters, rev, reads, limits

A program counter is kept per writer and epoch. A relay counter is kept the same way, in its own map. A value equal to or below the floor is `replay-counter`, for a file and for a deletion. A failed signature does not leave the relay floor raised. A new epoch starts at counter 1.

A desk file's counter is that same writer counter. After `restart`, `catalog-answer.ec`, `stats.estat` and a desk edit `*.ec` are refused from the floor kept for those kinds. `in-use.ec` after `restart` stays on the program floor (attack `F2-persist`). The relay refuses a desk-place upload after `restart` from the floor kept for desk places, including `in-use.ec`. A root upload after `restart` stays on the relay floor (attack `P19`). The two floors are one counter when every plant is present: each acceptance raises both.

`rev` is kept per team id, lead key and epoch. A lower or equal `rev` at that epoch is `replay-rev` on `loadTeamFile`. `acceptBlob` uses that same floor and refuses a team file whose `rev` is below it. The team file at the floor still opens a blob.

`list`, `fetch`, `subscribe` and an upload require a live session for that team. An upload's session is its writer's own key's, or an invitation's for its one upload, and the upload is also authenticated by the upload signature, enrolment and place. Removing a desk refuses that desk's open session and its later uploads with `removed`.

Limits, and the reason when they trip:

| Limit | Reason |
|---|---|
| ciphertext longer than 50 * 1024 * 1024 | `blob-size` |
| team ciphertext bytes over the team cap, 1024 * 1024 * 1024 unless `teamMax` is set | `team-size` |
| 60 uploads already in the last 60 000 ms for that writer or device | `rate` |
| 20 failed presentations of one invitation, after which the right token also fails | `token-tries` |
| a token already used once | `token-spent` |
| a wrap whose canonical JSON is longer than 1024 bytes | `blob-size` |
| a token hello after the invitation's end, the token not yet spent | `invite-ended` |
| a deletion record older than 30 days of this clock | `expired` |
| a challenge older than 5 minutes | `nonce-stale` |

The relay and the program each apply the blob, team and rate limits. An incoming blob over the cap is refused before it is opened. After the rate window slides, the next upload is accepted.

## Reasons

| Reason | Sentence |
|---|---|
| `no-hello` | The relay serves a team only after a signed hello. |
| `not-enrolled` | That key is not enrolled for this team. |
| `hello-replay` | That hello has already been used. |
| `nonce-stale` | That challenge has expired. |
| `bad-signature` | That signature does not hold, so the file was left out. |
| `token-spent` | This invitation has already been used. |
| `token-tries` | This invitation has been tried too many times. |
| `invite-ended` | This invitation has expired. Ask your lead for a new one. |
| `removed` | That desk is no longer on the team. |
| `replay-counter` | An older copy of that file was left out. |
| `replay-rev` | An older team file was left out. |
| `wrong-team` | That team file is not this desk's pinned team. |
| `epoch` | That file names an epoch this team file does not carry. |
| `not-roster` | That key is not on the signed team file, so the file was left out. |
| `outside-place` | That file sits outside its writer's place, so it was left out. |
| `bad-path` | That path stays outside the team folder. |
| `blob-size` | That file is larger than the relay accepts. |
| `team-size` | The team has reached the space the relay keeps. |
| `rate` | That many uploads in a minute is more than the relay accepts. |
| `forged-delete` | A deletion needs its writer's signature, so nothing was removed. |
| `superseded` | An older blob of that chain is no longer served. |
| `expired` | That deletion record has passed its keep. |
| `missing` | The relay has no such blob. |
| `tmp` | A temporary file stays on this desk. |
| `echo` | A file just received stays as it is. |
| `bad-grant` | That team needs a valid grant, so the relay did not make it. |
| `team-lapsed` | This team's relay is waiting for its renewal, so that was not done. |
| `swept-other-lead` | This team id is kept for its own lead, so a create under another key is not taken. |
| `revoked` | That grant was signed by a revoked key, so the relay did not take it. |

A swap of id, team, epoch, counter or `supersedes` fails closed as `bad-signature`. A path written onto the blob is not where the file lands. A blob sealed for an epoch the team file does not carry is `epoch`.

## Plants

`model.cjs` has one line marked `/* plant:<id> */` per attack. That line is the check. Deleting it, and leaving the rest of the file as valid script, turns that attack red and leaves every other attack green. The insecure default sits on the line above. `S3-answer-place` is judged on two clauses and has two lines, `plant:S3-answer-place` for the lead's role and `plant:S3-answer-id` for the blob id being the place's, and deleting either turns it red alone. A replay after `restart` is judged by a second comparison that is not a plant, so lifting the pre-restart line does not also drop `F2-persist`, `P19`, `E7-persist`, `S2-counter` or `S2-relay-counter`. Those attacks lift the line that keeps the floor.

## Choices the model made

These are the places the note lists a field and does not fix the bytes, or names a keep and does not say where. The model does the following. Each one is a question for the lead engineer.

1. Hello bytes are the line form above. The nonce is single-use and team-scoped. It stays valid while `now - issued` is at most 5 minutes (300000 ms) and is `nonce-stale` one millisecond later. A spent nonce is `hello-replay`, and that check comes first.
2. The counter floor and the `rev` floor survive `restart`. Sessions do not. The floor is per writer and epoch, and `rev` is per team, lead key and epoch. A new epoch starts at counter 1 and `rev` 1. A deletion uses the same writer floor as a file, and a replayed deletion does not remove the later body.
3. The path is not in the associated data. The note's list omits it, and the counter is on the list, so the counter is a line. The seal binds the path. A path stuck on the outside of the blob is ignored.
4. The relay judges place from a cleartext `place` of `root` or `desk:<deskId>`, because the path is inside the ciphertext and the relay still has to refuse the wrong writer.
5. An upload needs a hello, as a list, a fetch and a socket do: a live session of its writer's own key, or an invitation's for its one upload. The relay departs here from the first draft, which took an upload on its signature alone.
6. Accounted size is the ciphertext length, padded step plus the 16 byte tag. 50 MB is 50 * 1024 * 1024. 1 GB is 1024 cubed. `createTarget({ teamMax })` may set a smaller team cap. The rate window is a sliding 60 000 ms, not a clock minute. There is no declared size and no `charge()`.
7. A token hello spends the token on the first success that also binds a key. An unbound hello is refused and spends nothing. Failures of a wrong token are counted apart from that, up to 20, and the 21st presentation fails even with the right token. Presenting the stored hash in place of the token does not succeed. The wrap is at most 1024 bytes of its canonical JSON, is stored as `{ epoch, ct }` only, and is deleted on the one upload and on a drop. The model applies this because the slice 3 attacks name it.
8. A deletion the relay can recognise without reading the path is the cleartext `deletion` flag. The record is kept 30 days. The plaintext kind is `delete`. The program checks the writer's counter before it removes the mirror file.
9. The head's prefix is `etiuda-relay-head\n`. The note does not name it. A head is shown only when something is pinned, the head verifies, and its key and relay are the pin. While nothing is pinned, every head is hidden. The time shown is the signed time. The rev shown is the head's rev. A head the desk still holds does not block the desk, even when the loaded team file is an older rev.
10. `epochMove` does not rewrite stored blobs. A later upload may name an older id in `supersedes`, including across epochs. That new upload is not a re-seal.
11. Padding hides growth from the relay. Two plaintexts that fit in 4096 show the same ciphertext length, 4112. An outgoing or incoming ciphertext over 50 MB is refused on its real length. The harness builds that ciphertext from a body of 50 * 1024 * 1024 bytes, so the frame is over the cap even before padding.
12. The upload prefix ends with a newline, matching `BRANCH_PREFIX` and the engine's other labels. The note writes `etiuda-relay-upload` without saying whether the newline is there.
13. A desk's upload may not name another writer's blob in `supersedes`. The relay refuses it `outside-place` and keeps serving that blob. The lead may still supersede, including a desk's blob. This is `S2-chain`.
14. `acceptDeskFile` is the channel's receipt of `in-use.ec`, `catalog-answer.ec`, `stats.estat` and a desk edit `*.ec`. Those four names are always recognized. Each kind's plant is the desk id that receipt reports for that kind, so lifting the plant fails only that kind's end-to-end attack. A real adapter can implement the receipt with the same rules as `acceptBlob` for those paths. `notes.ec` is not a desk edit here, because the place attack already uses that name. The desk's own `notes.ec` through `acceptDeskFile` may be refused or accepted under `acceptBlob`'s rules. A foreign one is refused and not written.
15. A desk dropped from the signed roster is `removed`, not `not-roster`. `not-roster` stays the reason for a key that was never listed. The program decides this from the roster's `rev` and epoch. `removeDesk` does not make `acceptBlob` refuse while the signed roster still names the desk. What was accepted before the drop stays in the mirror. A later upload the relay still accepts, because the relay was not told, is still `removed` at the program.
16. `deskId` on a successful `acceptBlob` is the roster row for the signing key. A `place` of `desk:<other>` is the relay re-addressing the file. The body stays on the inner path, and `deskId` stays the signer's desk. The relay is not given a way to name the folder.
17. The desk-file floor and the desk-place floor are the writer counter, stored a second time so a restart plant can keep them without also being the plant for `F2-persist` or `P19`. With every plant present the numbers match. `in-use.ec` on the program after `restart` is `F2-persist`, not a second rule.
18. A desk's statistics pace is not an attack. The relay's rate limit already is.

A desk that stays offline longer than 30 days is not an attack either. The plan read asks what that desk can still publish. The model refuses to serve a deletion record after 30 days, and it does not delete a mirror file just because the relay has stopped listing it. What a returning desk may upload after a gap is open.
