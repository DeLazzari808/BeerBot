/**
 * Patch Baileys messages-send.js to fix @lid group message crash (1006).
 *
 * Bug: getUSyncDevices() calls `new USyncUser().withId(jid)` for ALL JIDs.
 * For @lid JIDs, this produces:
 *   <user jid="xxx@lid">
 *     <devices version="2"/>
 *   </user>
 *
 * WhatsApp rejects jid="xxx@lid" in the <user> element → 1006.
 *
 * Fix: For @lid JIDs, use ONLY withLid() (NOT withId()). This produces:
 *   <user>
 *     <devices version="2"/>
 *     <lid jid="xxx@lid"/>
 *   </user>
 *
 * The <user> element has no jid attribute (user.id is undefined),
 * and the <lid> child element carries the LID JID — the format
 * WhatsApp expects for LID device queries.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const filePath = resolve(
    __dirname,
    '../node_modules/@whiskeysockets/baileys/lib/Socket/messages-send.js'
);

const original = readFileSync(filePath, 'utf8');

// Match the line (may already have a previous patch applied)
const buggyPatterns = [
    // Original unpatched line:
    'query.withUser(new USyncUser().withId(jid));',
    // Previous patch v1 (withId + withLid):
    `{
                const u = new USyncUser().withId(jid);
                if (isLidUser(jid)) u.withLid(jid);
                query.withUser(u);
            }`,
];

const fixedCode = `{
                // PATCH: For @lid JIDs, use withLid() only (no withId).
                // This makes <user> have no jid attr, with <lid jid="xxx@lid"/> child.
                // For regular JIDs, use withId() as normal.
                if (isLidUser(jid)) {
                    query.withUser(new USyncUser().withLid(jid));
                } else {
                    query.withUser(new USyncUser().withId(jid));
                }
            }`;

// Check if already patched with v2
if (original.includes('use withLid() only (no withId)')) {
    console.log('[patch-baileys] Already patched v2 — skipping.');
    process.exit(0);
}

let patched = original;
let found = false;
for (const pattern of buggyPatterns) {
    if (patched.includes(pattern)) {
        patched = patched.replace(pattern, fixedCode);
        found = true;
        break;
    }
}

if (!found) {
    console.error('[patch-baileys] Could not find target line to patch!');
    console.error('[patch-baileys] Searched for patterns:', buggyPatterns.map(p => p.substring(0, 50)));
    process.exit(1);
}

writeFileSync(filePath, patched, 'utf8');
console.log('[patch-baileys] ✅ v2: withLid() only for @lid JIDs (no withId)');
