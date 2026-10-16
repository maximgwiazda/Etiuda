# Relay attack adapter

`relay/test/attacks.mjs` loads the module in `RELAY_TARGET` and calls `createTarget(limits)`. The object it returns is both the relay and the program, in process, with no network. A real adapter maps each method onto `relay/` (the Worker), `shell/relay/blob.cjs` (seal, open, sign, counter, padding, path) and `shell/relay/channel.cjs` (accept or drop, echo, the mirror). The reference targets are `relay/test/targets/naive.cjs`, `relay/test/targets/model.cjs` and `relay/test/targets/refuse-all.cjs`. `relay/test/wire.cjs` is the byte helper they share. An adapter may ignore it and call `blob.cjs`, as long as the methods below accept and refuse the same way.

`createTarget(limits)` is synchronous. `limits` may be omitted. The only field read is `teamMax`, which replaces the 1 GB team cap for that instance. Blob size, rate, token tries and deletion keep stay the real constants. Keys below are Ed25519. `keyId` and `publicKey` are the raw 32 byte public key as 64 hex characters. `privateKey` is PKCS8 DER as hex. A team key is 32 raw bytes. The target's clock starts at 0. `advance(ms)` moves it. Nothing here contacts a host.

A refusal is `{ ok: false, reason, said, served: false }` with no `ids` and no `ciphertext`. `said` is one short sentence, with no exclamation mark and no dash. An acceptance is `{ ok: true }` plus the fields named on that method.

Trust for a team file, a head and a roster is the pinned lead key and the signature, never a key the message names. `pin({ leadKeyId, relayTeamId, teamId })` sets that anchor. The relay is not given the team key. `seal` and `acceptBlob` are, because the desk holds it.

The harness strips `path`, `body` and `plainLength` before `upload` and `acceptBlob`. An attack that must put a path back does so itself. The contract has no caller-supplied public key, no caller-chosen nonce, no declared size, no `charge()`, and no `withheld`, `fromDownload` or `onMissing` flag.

## Relay

- `start()` marks the relay up. `createTarget` calls it.
- `createTeam({ teamId, epoch, lead })` returns `{ relayTeamId, teamId }`. `lead` is `{ keyId, publicKey, privateKey }`. The lead is enrolled for place `root`. `relayTeamId` is 16 random bytes, hex. There is no team key argument.
- `addEpoch({ relayTeamId, epoch })` records the next epoch. There is no team key argument.
- `enrol({ relayTeamId, deskId, keyId })` enrols that device for place `desk:<deskId>`.
- `removeDesk({ relayTeamId, deskId })` withdraws that device. Later reads and uploads by it are refused with `removed`.
- `invite({ relayTeamId })` returns `{ token, invitationId }`. `token` is 32 random bytes, hex. The relay stores only the sha256 of the token's UTF-8 text.
- `challenge({ relayTeamId })` returns `{ nonce }`. The relay mints 16 random bytes, hex, and records when it was issued. A nonce the caller passes is not a challenge.
- `hello({ relayTeamId, nonce, keyId, signature, token, invitationId })` returns `{ ok: true, session }` or a refusal. A device hello carries `signature` and is verified under the public key enrolled for `keyId` on that team. A key that was enrolled and then removed is verified under that same key before the relay answers `removed`. An unsigned or forged signature on that hello is `bad-signature`, the same refusal as any other bad signature, and the answer does not say that the key was removed. A genuine signature on a removed key is `removed`. A token hello carries `token` and `invitationId` and no signature. A key the caller names is not the verifying key. Both consume the nonce only on success.
- `helloMessage(relayTeamId, nonce, keyId)` is the buffer a device signs. It contains the team, the nonce and the key id.
- `list({ relayTeamId, session })` returns `{ ok: true, served: true, ids }` or a refusal with `ids` absent. `ids` are the live blobs of that team.
- `fetch({ relayTeamId, session, id })` returns `{ ok: true, served: true, id, ciphertext, nonce, signature, epoch, supersedes, writerKeyId, counter }` or a refusal with `ciphertext` absent. `ciphertext` is the stored blob. The other fields are the signed envelope a channel needs to open it. `supersedes` is the stored id, or null. `counter` is the stored integer.
- `subscribe({ relayTeamId, session })` returns `{ ok: true, served: true, events }`. After another device uploads, `events` gains `{ seq, id, size }` and nothing else.
- `upload({ relayTeamId, blob })` returns `{ ok: true, seq, id }`. There is no `size` argument. The relay accounts `blob.ciphertext.length`.
- `fetchDeletion({ relayTeamId, id })` serves a deletion record while it is inside its keep, then refuses with `expired`.
- `epochMove({ relayTeamId })` returns `{ resealed: false }` and leaves every stored ciphertext as it was.
- `inspect({ relayTeamId, id })` returns the stored record, or null. The record has no path and no body.

## Program

- `seal(opts)` returns a blob. `opts` is `{ relayTeamId, epoch, teamKey, writer, path, body, counter, place, kind, id, supersedes }`. `writer` is a key pair. `kind` is `file` or `delete`. `place` is `root` or `desk:<deskId>`. The ciphertext is the padded frame plus the 16 byte tag. Two small bodies both come out 4112 bytes.
- `acceptBlob({ teamKey, teamDoc, blob })` opens the blob under the team file. The team file must verify under the pinned lead key. Its `id` must be the pinned team id, and `channel.relay` must be the pinned relay team id, or the reason is `wrong-team`. A `rev` below the floor `loadTeamFile` holds for that team id, lead key and epoch is `replay-rev`; the rev at the floor is still accepted. A blob whose `epoch` is not the team file's `epoch` is `epoch`, and it is not opened under the key of another epoch. The writer must be on that signed roster. On success `{ ok: true, path }` and the mirror holds the inner body at the inner path. A path stuck onto the blob is ignored. A deletion returns `{ ok: true, deleted: true, path }` and the mirror drops that path only when the writer's counter is newer than the floor and the path is that writer's place.
- `loadTeamFile(doc)` accepts a team file signed by the pinned lead, or refuses. A file whose `id` is not the pinned team id, or whose `channel.relay` is not the pinned relay team id, is `wrong-team`. A lower or equal `rev` at the same epoch is `replay-rev`. Another epoch may start at `rev` 1.
- `showFreshness({ head, now })` returns `{ shown, blocked, time, epoch, rev, ageMs }`. While nothing is pinned, every head comes back with `shown` false and `blocked` false. Once pinned, the head must verify, and its key and relay must be the pin. `time` is the head's signed time. `ageMs` is `now` minus that time. A head the desk holds is shown and `blocked` is false. The rev shown is the head's rev, including when the desk has loaded an older team file and a newer one was never delivered.
- `syncMirror({ relayTeamId, session, teamKey, teamDoc })` leaves a mirror file the relay omitted where it is. It asks `fetch` under this session for each listed blob this program does not yet hold, opens that returned envelope under `teamKey` and `teamDoc`, and writes the inner body into the mirror. It does not read the relay's stored map. A blob the lead uploaded after the accept is brought in that way.
- `considerOutgoing({ path })` returns `{ send: false, reason, said }` for a `.tmp`. A path this program has accepted is an echo, reason `echo`, while the clock is less than 60 minutes (`ECHO_MS`, 60 * 60 * 1000) past that accept. The echo ends at that mark: `considerOutgoing` of the same path then returns `{ send: true }`, which is the later local change of a received file. Any other path returns `{ send: true }`. The download is one this program accepted, not a flag.
- `readRing({ teamDoc, looseRing })` returns `{ source, ring }`. In relay mode `source` is `team` when the team file is signed by the pinned lead and carries a ring, otherwise `none`. It is never `loose`.
- `verifyUploadSignature({ publicKey, payload, signature })` and `verifyDeskSignature({ publicKey, body, signature })` return `{ ok }`. Each accepts a genuine signature of its own prefix and rejects the other prefix and another key.
- `programAllowUpload({ blob, deviceId })` applies the blob, team and rate limits to `blob.ciphertext.length` before an upload.
- `restart()` drops sessions, challenges and subscribers. The program counter floor, the relay counter floor and the `rev` floor stay. A replay after restart is refused, and the next counter or `rev` is kept.
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

## Who may write

The relay sees `place` in the clear and refuses a writer whose enrolment does not match it. The path stays inside the ciphertext. The program ignores a key that is only on the relay's list. It trusts a writer only from a team file signed by the pinned lead: the lead for a path that does not start with `desks/`, and a rostered desk only for `desks/<that desk id>/`. Before that comparison the path is folded to lower case and `.` segments are dropped, so `Desks/<id>/...` and `./desks/<id>/...` are that desk's place and not the lead's. A roster with an extra desk and the old signature does not enrol that desk. A path that merely begins with the desk id, without the slash that closes the id, is outside that desk's place.

These paths are dropped with `bad-path`: a segment `..`, a drive (`C:` and the like), a colon anywhere else (a stream), a leading `/` or `\`, or any backslash.

## Counters, rev, reads, limits

A program counter is kept per writer and epoch. A relay counter is kept the same way, in its own map. A value equal to or below the floor is `replay-counter`, for a file and for a deletion. A failed signature does not leave the relay floor raised. A new epoch starts at counter 1.

`rev` is kept per team id, lead key and epoch. A lower or equal `rev` at that epoch is `replay-rev` on `loadTeamFile`. `acceptBlob` uses that same floor and refuses a team file whose `rev` is below it. The team file at the floor still opens a blob.

`list`, `fetch` and `subscribe` require a live session for that team. An upload does not. It is authenticated by the upload signature, enrolment and place. Removing a desk refuses that desk's open session and its later uploads with `removed`.

Limits, and the reason when they trip:

| Limit | Reason |
|---|---|
| ciphertext longer than 50 * 1024 * 1024 | `blob-size` |
| team ciphertext bytes over the team cap, 1024 * 1024 * 1024 unless `teamMax` is set | `team-size` |
| 60 uploads already in the last 60 000 ms for that writer or device | `rate` |
| 20 failed presentations of one invitation, after which the right token also fails | `token-tries` |
| a token already used once | `token-spent` |
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

A swap of id, team, epoch, counter or `supersedes` fails closed as `bad-signature`. A path written onto the blob is not where the file lands. A blob sealed for an epoch the team file does not carry is `epoch`.

## Plants

`model.cjs` has one line marked `/* plant:<id> */` per attack. That line is the check. Deleting it, and leaving the rest of the file as valid script, turns that attack red and leaves every other attack green. The insecure default sits on the line above. A replay after `restart` is judged by a second comparison that is not a plant, so lifting the pre-restart line does not also drop `F2-persist`, `P19` or `E7-persist`. Those three attacks lift the line that keeps the floor.

## Choices the model made

These are the places the note lists a field and does not fix the bytes, or names a keep and does not say where. The model does the following. Each one is a question for the lead engineer.

1. Hello bytes are the line form above. The nonce is single-use and team-scoped. It stays valid while `now - issued` is at most 5 minutes (300000 ms) and is `nonce-stale` one millisecond later. A spent nonce is `hello-replay`, and that check comes first.
2. The counter floor and the `rev` floor survive `restart`. Sessions do not. The floor is per writer and epoch, and `rev` is per team, lead key and epoch. A new epoch starts at counter 1 and `rev` 1. A deletion uses the same writer floor as a file, and a replayed deletion does not remove the later body.
3. The path is not in the associated data. The note's list omits it, and the counter is on the list, so the counter is a line. The seal binds the path. A path stuck on the outside of the blob is ignored.
4. The relay judges place from a cleartext `place` of `root` or `desk:<deskId>`, because the path is inside the ciphertext and the relay still has to refuse the wrong writer.
5. An upload does not need a hello. A list, a fetch and a socket do.
6. Accounted size is the ciphertext length, padded step plus the 16 byte tag. 50 MB is 50 * 1024 * 1024. 1 GB is 1024 cubed. `createTarget({ teamMax })` may set a smaller team cap. The rate window is a sliding 60 000 ms, not a clock minute. There is no declared size and no `charge()`.
7. A token hello spends the token on the first success. Failures are counted apart from that, up to 20, and the 21st presentation fails even with the right token. Presenting the stored hash in place of the token does not succeed. The note's burn of the wrap is slice 3. The model applies both because the attacks name a spent token and a token past 20 tries.
8. A deletion the relay can recognise without reading the path is the cleartext `deletion` flag. The record is kept 30 days. The plaintext kind is `delete`. The program checks the writer's counter before it removes the mirror file.
9. The head's prefix is `etiuda-relay-head\n`. The note does not name it. A head is shown only when something is pinned, the head verifies, and its key and relay are the pin. While nothing is pinned, every head is hidden. The time shown is the signed time. The rev shown is the head's rev. A head the desk still holds does not block the desk, even when the loaded team file is an older rev.
10. `epochMove` does not rewrite stored blobs. A later upload may name an older id in `supersedes`, including across epochs. That new upload is not a re-seal.
11. Padding hides growth from the relay. Two plaintexts that fit in 4096 show the same ciphertext length, 4112. An outgoing or incoming ciphertext over 50 MB is refused on its real length. The harness builds that ciphertext from a body of 50 * 1024 * 1024 bytes, so the frame is over the cap even before padding.
12. The upload prefix ends with a newline, matching `BRANCH_PREFIX` and the engine's other labels. The note writes `etiuda-relay-upload` without saying whether the newline is there.
13. A desk's upload may name the lead's blob in `supersedes`, and the model then stops serving that blob. The design does not say a desk cannot supersede a lead edition. This is not an attack. It is P7, left as a choice.

A desk that stays offline longer than 30 days is not an attack either. The plan read asks what that desk can still publish. The model refuses to serve a deletion record after 30 days, and it does not delete a mirror file just because the relay has stopped listing it. What a returning desk may upload after a gap is open.
