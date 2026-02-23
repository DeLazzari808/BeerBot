/**
 * Patch Baileys messages-send.js to fix @lid group message crash (1006).
 *
 * Bug: getUSyncDevices() calls `new USyncUser().withId(jid)` for ALL JIDs,
 * but for @lid JIDs, USyncLIDProtocol.getUserElement() checks `user.lid`
 * (not `user.id`). Without `user.lid`, the <user> XML node is sent with
 * `jid="xxx@lid"` but NO <lid> child element → WhatsApp rejects with 1006.
 *
 * Fix: For @lid JIDs, also call `.withLid(jid)` so the USyncLIDProtocol
 * generates the proper `<lid jid="xxx@lid"/>` child element.
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

// The buggy line:
//   query.withUser(new USyncUser().withId(jid));
// Should be:
//   const u = new USyncUser().withId(jid);
//   if (isLidUser(jid)) u.withLid(jid);
//   query.withUser(u);

const buggyLine =
    'query.withUser(new USyncUser().withId(jid));';

const fixedCode = `{
                const u = new USyncUser().withId(jid);
                if (isLidUser(jid)) u.withLid(jid);
                query.withUser(u);
            }`;

if (!original.includes(buggyLine)) {
    if (original.includes('if (isLidUser(jid)) u.withLid(jid)')) {
        console.log('[patch-baileys] Already patched — skipping.');
        process.exit(0);
    }
    console.error('[patch-baileys] Could not find target line to patch!');
    process.exit(1);
}

const patched = original.replace(buggyLine, fixedCode);
writeFileSync(filePath, patched, 'utf8');
console.log('[patch-baileys] ✅ Patched getUSyncDevices to use withLid() for @lid JIDs');
